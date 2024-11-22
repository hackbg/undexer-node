#!/usr/bin/env -S deno run --allow-net --allow-run=simpleproxy,pkill,pgrep --allow-env=HOST,PORT,PROXY,LOCAL,REMOTE
// This service manages a `simpleproxy` that receives incoming connections
// from the indexer, and proxies them to the node over the internal network.
import { initialize, environment, api } from './lib.js'
import { Service } from './services.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, PROXY, LOCAL, REMOTE } = environment({
    HOST:   "0.0.0.0",
    PORT:   "25550",
    PROXY:  "simpleproxy",
    LOCAL:  ":26657",
    REMOTE: "node:26657",
  })
  const name = `Index proxy (${LOCAL} -> ${REMOTE})`
  const service = new Service(name, PROXY, '-v', '-L', LOCAL, '-R', REMOTE)
  service.start()
  api('Index', HOST, PORT, service.routes())
}
