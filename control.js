#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy,pkill --allow-env=NAMADA,LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT,NAMADA,PROXY,AUTO_STOP

import { TextLineStream } from "./deps.js"
import { ServiceManager, Service } from './lib.js'

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
