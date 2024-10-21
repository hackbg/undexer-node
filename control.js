#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy,pkill --allow-env=NAMADA,PROXY,LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT,CHAIN_ID --allow-write=/home/namada/.local/share/namada

import { initialize, environment, ServiceManager } from './lib.js'
import { NamadaService, SimpleProxyService } from './services.js'

if (import.meta.main) main()

function main () {
  initialize()
  const { NAMADA, PROXY, LOCAL, REMOTE, CONTROL_HOST, CONTROL_PORT, CHAIN_ID } = environment({
    NAMADA:       "namada",
    PROXY:        "simpleproxy",
    LOCAL:        ":26666",
    REMOTE:       "namada-peer-housefire.mandragora.io:26656",
    CONTROL_HOST: "127.0.0.1",
    CONTROL_PORT: "25555",
    CHAIN_ID:     "housefire-reduce.e51ecf4264fc3",
  })

  // Define the services
  const services = {
    node:  new NamadaService(NAMADA, CHAIN_ID),
    proxy: new SimpleProxyService(PROXY, LOCAL, REMOTE),
  }

  // Every time the epoch increments, proxy disconnects and sync stops.
  // The indexer must send HTTP /proxy/start or WS {"resume":{}} to continue
  // once it's done with indexindg the current epoch.
  let currentEpoch = 0n
  services.node.events.addEventListener('synced', async ({ detail: { epoch } }) => {
    epoch = BigInt(epoch)
    if (epoch > currentEpoch) {
      console.log('\n🟠 Epoch has increased. Pausing until indexer catches up.\n')
      await services.proxy.stop()
      currentEpoch = epoch
    }
  })

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
    socket.addEventListener("message", async (event) => {
      console.log("message received over websocket", event.data)
      const data = JSON.parse(event.data)
      if (data.restart) {
        console.log('restarting sync from beginning...')
        await services.node.stop()
        await services.node.deleteData()
        services.node.start()
      }
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
