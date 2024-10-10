#!/usr/bin/env -S deno run --allow-net --allow-run=simpleproxy,pkill,pgrep --allow-env=HOST,PORT,PROXY,LOCAL,REMOTE
// This service manages a `simpleproxy` that receives incoming connections
// from the indexer, and proxies them to the node over the internal network.
import { initialize, environment, api } from './lib.js'
import { SimpleProxyService } from './services.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, PROXY, LOCAL, REMOTE } = environment({
    HOST:   "0.0.0.0",
    PORT:   "25550",
    PROXY:  "simpleproxy",
    LOCAL:  ":26666",
    REMOTE: "namada:26656",
  })
  const service = new SimpleProxyService(PROXY, LOCAL, REMOTE)
  service.start()
  api(HOST, PORT, {
    '/':      (_) => service.state(),
    '/start': (_) => service.start(),
    '/pause': (_) => service.pause(),
  })
}
