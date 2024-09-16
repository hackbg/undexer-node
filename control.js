#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy --allow-env=LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT

import { TextLineStream } from "./deps.js"

function main () {
  // Exit cleanly on Ctrl-C (otherwise container just detaches)
  Deno.addSignalListener("SIGINT", () => Deno.exit())

  // Read configuration from environment.
  const LOCAL        = Deno.env.get("LOCAL")        || ":26666"
  const REMOTE       = Deno.env.get("REMOTE")       || "165.227.42.204:26656"
  const CONTROL_HOST = Deno.env.get("CONTROL_HOST") || "127.0.0.1"
  const CONTROL_PORT = Deno.env.get("CONTROL_PORT") || "25555"

  // Define services.
  const services = {
    node:  new NamadaService(),
    proxy: new SimpleProxyService(LOCAL, REMOTE),
  }

  // Define routes.
  // TODO: define full route map here and not just list of route names
  const routes = []
  for (const service of Object.keys(services)) {
    routes.push(`/${service}/start`)
    routes.push(`/${service}/stop`)
  }

  // Run service
  Deno.serve({ host: CONTROL_HOST, port: CONTROL_PORT }, async (req) => {
    try {
      // Service status
      const info = {
        config:   { LOCAL, REMOTE },
        services: { proxy: services.proxy.status, node: services.node.status },
        commands: routes
      }

      // Trim trailing slashes
      let { pathname } = new URL(req.url)
      while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)

      // Route requests
      switch (pathname) {
        case '/node/start':
          services.node.start()
          return redirect('/')
        case '/node/stop':
          await services.node.stop()
          return redirect('/')
        case '/proxy/start':
          services.proxy.start()
          return redirect('/')
        case '/proxy/stop':
          await services.proxy.stop()
          return redirect('/')
        case '':
          return respond(200, info)
        default:
          return respond(404, { error: 'not found' })
      }

    } catch (e) {
      console.error(e)
      return respond(500, { error: e.message||e })
    }

    function redirect (pathname) {
      const url = new URL(req.url)
      url.pathname = pathname
      return Response.redirect(url)
    }

    function respond (status, data) {
      const headers = { "content-type": "application/json" }
      return new Response(JSON.stringify(data, null, 2), { status, headers })
    }

  })
}

class Service {

  constructor (name, command, ...args) {
    this.name    = name
    this.command = command
    this.args    = args
  }

  process = null
  signal  = 'SIGTERM'

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

  pipe (stream, kind) {
    const write = (chunk, _) => console.log(`[${this.name}] [${kind}]: ${chunk}`)
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeTo(new WritableStream({ write }))
  }

}

class NamadaService extends Service {
  constructor () {
    super('Namada fullnode', 'namada', 'node', 'ledger', 'run')
  }
}

class SimpleProxyService extends Service {
  constructor (local, remote) {
    super('TCP proxy', 'simpleproxy', 'v', '-L', local, '-R', remote)
    this.signal = 'SIGKILL'
  }
}

if (import.meta.main) main()
