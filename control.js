#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy,pkill --allow-env=NAMADA,LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT,NAMADA,PROXY

import { TextLineStream } from "./deps.js"


function main () {

  // Global environment configuration
  const NAMADA       = Deno.env.get("NAMADA")       || "namada"
  const PROXY        = Deno.env.get("PROXY")        || "simpleproxy"
  const LOCAL        = Deno.env.get("LOCAL")        || ":26666"
  const REMOTE       = Deno.env.get("REMOTE")       || "165.227.42.204:26656"
  const CONTROL_HOST = Deno.env.get("CONTROL_HOST") || "127.0.0.1"
  const CONTROL_PORT = Deno.env.get("CONTROL_PORT") || "25555"

  // Exit cleanly on Ctrl-C (otherwise container just detaches)
  Deno.addSignalListener("SIGINT", () => Deno.exit())

  // Define the services
  const services = {
    node:  new NamadaService(NAMADA),
    proxy: new SimpleProxyService(PROXY, LOCAL, REMOTE),
  }

  // Run the service manager:
  new ServiceManager(services).listen({ host: CONTROL_HOST, port: CONTROL_PORT }, () => ({
    config: { LOCAL, REMOTE },
    services: {
      proxy: services.proxy.status,
      node:  services.node.status
    },
    commands: routes.map(route=>route[0])
  }))

}

class ServiceManager {

  constructor (services) {
    this.services = services
    // Define routes from services
    this.routes = []
    for (const service of Object.keys(services)) {
      this.routes.push([`/${service}/start`,  () => service.start()])
      this.routes.push([`/${service}/stop`,   () => service.stop()])
      this.routes.push([`/${service}/mute`,   () => service.mute()])
      this.routes.push([`/${service}/unmute`, () => service.unmute()])
    }
  }

  listen (config, getInfo) {
    // Run service
    Deno.serve(config, async (req) => {
      try {
        // Service status
        const info = getInfo()

        // Trim trailing slashes
        let { pathname } = new URL(req.url)
        while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)

        // Route request to service
        for (const [route, handler] of routes) {
          if (route === pathname) {
            await Promise.resolve(handler())
            return redirect('/')
          }
        }

        // Default routes
        switch (pathname) {
          case '': return respond(200, info)
          default: return respond(404, { error: 'not found' })
        }

      } catch (e) {
        // Error handler
        console.error(e)
        return respond(500, { error: e.message||e })
      }

      // Return a redirect to another path on the same host
      function redirect (pathname) {
        const url = new URL(req.url)
        url.pathname = pathname
        return Response.redirect(url)
      }

      // Respond with JSON data
      function respond (status, data) {
        const headers = { "content-type": "application/json" }
        return new Response(JSON.stringify(data, null, 2), { status, headers })
      }

    })
  }
}

class Service {

  constructor (name, command, ...args) {
    this.name    = name
    this.command = command
    this.args    = args
    this.process = null
    this.signal  = 'SIGTERM'
    this.muted   = false
  }

  get status () {
    return !!this.process
  }

  start () {
    console.log('Starting:', this.name)
    if (this.process) {
      console.log('Already started:', this.name)
      return false
    }
    const options = { args: this.args, stdout: 'piped', stderr: 'piped' }
    this.process = new Deno.Command(this.command, options).spawn()
    this.process.status.then(status=>{
      console.log(
        'Died:', this.name,
        'with PID:', this.process.pid,
        'and status:', JSON.stringify(status)
      )
      this.process = null
    })
    console.log('Started:', this.name, 'at PID:', this.process.pid)
    // Write service stdout and stderr to host stdout
    this.pipe(this.process.stdout, "stdout")
    this.pipe(this.process.stderr, "stderr")
    return true
  }

  async stop () {
    console.log('Stopping:', this.name)
    if (!this.process) {
      console.log('Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    this.process.kill(this.signal)
    await this.process.status
    console.log('Stopped:', this.name, 'at PID:', pid)
    return true
  }

  mute () {
    this.muted = true
  }

  unmute () {
    this.muted = false
  }

  pipe (stream, kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        this.muted || console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
      }}))
  }

}

class NamadaService extends Service {
  constructor (namada = 'namada') {
    super('Namada', namada, 'node', 'ledger', 'run')
    this.regex = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    this.start()
  }

  pipe (stream, kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        if (!this.muted) console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        const match = chunk.match(this.regex)
        if (match) {
          const [block, epoch] = match.slice(1)
          console.log({block, epoch})
        }
      } }))
  }
}

class SimpleProxyService extends Service {
  constructor (proxy = 'simpleproxy', local, remote) {
    super('Proxy ', proxy, '-v', '-L', local, '-R', remote)
    this.signal = 'SIGKILL'
    this.start()
  }

  async stop () {
    console.log('Stopping:', this.name)
    if (!this.process) {
      console.log('Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    await new Deno.Command('pkill', { args: ['-9', 'simpleproxy'] }).spawn().status
    console.log('Stopped:', this.name, 'at PID:', pid)
    return true
  }
}

if (import.meta.main) main()
