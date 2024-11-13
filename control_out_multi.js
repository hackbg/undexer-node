#!/usr/bin/env -S deno run --allow-net --allow-run=simpleproxy,pkill,pgrep --allow-env=HOST,PORT,PROXY,LOCAL1,LOCAL2,LOCAL3,REMOTE1,REMOTE2,REMOTE3
// This service manages a `simpleproxy` that receives outgoing connections
// from the node over the internal network, and proxies them to the outside world.
import { initialize, environment, api } from './lib.js'
import { MultiService } from './services.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, PROXY, LOCAL1, LOCAL2, LOCAL3, REMOTE1, REMOTE2, REMOTE3 } = environment({
    HOST:    "0.0.0.0",
    PORT:    "25552",
    PROXY:   "simpleproxy",
    LOCAL1:  ":26666",
    LOCAL2:  ":26667",
    LOCAL3:  ":26668",
    REMOTE1: "74.50.93.254:26656",
    REMOTE2: "64.118.250.82:46656",
    REMOTE3: "138.197.133.118:26656",
  })
  const name = `Sync proxy (3x)`
  const service = new MultiService(name, [
    [PROXY, '-v', '-L', LOCAL1, '-R', REMOTE1],
    [PROXY, '-v', '-L', LOCAL2, '-R', REMOTE2],
    [PROXY, '-v', '-L', LOCAL3, '-R', REMOTE3],
  ])
  service.start()
  api('Sync', HOST, PORT, service.routes(), {
    onMessage: async ({ event }) => {
      const data = JSON.parse(event.data)
      if (data.resume) {
        console.log('🟢 Resuming sync...')
        await service.start()
      }
    }
  })
}