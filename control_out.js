#!/usr/bin/env -S deno run --allow-net --allow-run=simpleproxy,pkill,pgrep --allow-env=HOST,PORT,PROXY,LOCAL,REMOTE
// This service manages a `simpleproxy` that receives outgoing connections
// from the node over the internal network, and proxies them to the outside world.
import { initialize, environment, api } from './lib.js'
import { Service } from './services.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, PROXY, LOCAL, REMOTE } = environment({
    HOST:   "0.0.0.0",
    PORT:   "25552",
    PROXY:  "simpleproxy",
    LOCAL:  ":26666",
    REMOTE: "namada-peer-housefire.mandragora.io:26656",
  })
  const name = `Sync proxy (${LOCAL} -> ${REMOTE})`
  const service = new Service(name, PROXY, '-v', '-L', LOCAL, '-R', REMOTE)
  api(HOST, PORT, service.routes())
}
