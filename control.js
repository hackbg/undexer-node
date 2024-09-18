#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy,pkill --allow-env=NAMADA,LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT,NAMADA,PROXY,AUTO_STOP

import { TextLineStream } from "./deps.js"

function main () {

  const t0 = performance.now()

  // Global environment configuration
  const NAMADA       = Deno.env.get("NAMADA")       ?? "namada"
  const PROXY        = Deno.env.get("PROXY")        ?? "simpleproxy"
  const LOCAL        = Deno.env.get("LOCAL")        ?? ":26666"
  const REMOTE       = Deno.env.get("REMOTE")       ?? "165.227.42.204:26656"
  const CONTROL_HOST = Deno.env.get("CONTROL_HOST") ?? "127.0.0.1"
  const CONTROL_PORT = Deno.env.get("CONTROL_PORT") ?? "25555"
  const AUTO_STOP    = Boolean(Deno.env.get("AUTO_STOP") ?? true)

  // Exit cleanly on Ctrl-C (otherwise container just detaches)
  Deno.addSignalListener("SIGINT", () => {
    console.log('Ran for', ((performance.now() - t0)/1000).toFixed(3), 'seconds')
    Deno.exit()
  })

  // Define the services
  const services = {
    node:  new NamadaService(NAMADA),
    proxy: new SimpleProxyService(PROXY, LOCAL, REMOTE),
  }

  // If AUTO_STOP is enabled, proxy is disconnected every time the epoch increments.
  // The indexer must then send /proxy/start to reenable node syncing.
  if (AUTO_STOP) {
    let currentEpoch = 0n
    services.node.events.addEventListener('synced', async ({ detail: { epoch } }) => {
      epoch = BigInt(epoch)
      if (epoch > currentEpoch) {
        console.log('\nEpoch has increased. Pausing until indexer catches up.\n')
        await services.proxy.stop()
        currentEpoch = epoch
      }
    })
  }

  // Create the service manager.
  const server = new ServiceManager(services)

  // Add the websocket endpoint.
  server.routes.push(['/ws', (req) => {
    if (req.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 400 })
    }
    const { socket, response } = Deno.upgradeWebSocket(req)
    socket.addEventListener("open", () => {
      services.node.events.addEventListener('synced', send)
      console.log("client connected to websocket")
    })
    socket.addEventListener("close", () => {
      services.node.events.removeEventListener('synced', send)
      console.log("client disconnected from websocket")
    })
    socket.addEventListener("message", (event) => {
      console.log("message received over websocket", event.data)
      const data = JSON.parse(event.data)
      if (data.resume) {
        console.log('resuming sync...')
        services.proxy.start()
      }
    })
    return response

    function send ({ type, detail }) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ [type]: detail }))
      }
    }
  }])

  // Run the service manager:
  server.listen({
    host: CONTROL_HOST,
    port: CONTROL_PORT,
  }, () => ({
    config: { LOCAL, REMOTE },
    services: {
      proxy: services.proxy.status,
      node:  services.node.status
    },
    routes: server.routes.map(route=>route[0])
  }))

}

class ServiceManager {

  constructor (services) {
    this.services = services
    // Define routes from services
    this.routes = []
    for (const [id, service] of Object.entries(services)) {
      this.routes.push([`/${id}/start`,  () => { service.start()  }])
      this.routes.push([`/${id}/stop`,   () => { service.stop()   }])
      this.routes.push([`/${id}/mute`,   () => { service.mute()   }])
      this.routes.push([`/${id}/unmute`, () => { service.unmute() }])
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
        for (const [route, handler] of this.routes) {
          if (route === pathname) {
            return await Promise.resolve(handler(req)) || redirect('/')
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

    // Spawn child process
    this.process = new Deno.Command(this.command, options).spawn()

    // Listen for process exit
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
    this.regex  = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    this.events = new EventTarget()
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
          console.log({ synced: { block, epoch } })
          this.events.dispatchEvent(new SyncEvent({ block, epoch }))
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

class SyncEvent extends CustomEvent {
  constructor (detail) {
    super('synced', { detail })
  }
}

if (import.meta.main) main()
