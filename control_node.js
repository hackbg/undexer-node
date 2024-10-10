#!/usr/bin/env -S deno run --allow-net --allow-run=namada,pkill,pgrep --allow-env=HOST,PORT,NAMADA,CHAIN_ID --allow-write=/home/namada/.local/share/namada
// This service runs the node. In order for the indexer to have time to fetch all data
// before epoched data is pruned, this service parses the log output of the node, and
// when the epoch has incremented it tells the outgoing proxy to cut off outgoing
// connections from the node. Once the indexer is done with the current epoch, it tells
// the outgoing service to resume.
import { initialize, environment, api } from './lib.js'
import { NamadaService } from './services.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, NAMADA, CHAIN_ID } = environment({
    HOST:     "0.0.0.0",
    PORT:     "25551",
    NAMADA:   "namada",
    CHAIN_ID: "housefire-reduce.e51ecf4264fc3",
  })
  const service = new NamadaService(NAMADA, CHAIN_ID)
  service.start()
  api(HOST, PORT, {
    '/':      (_) => service.state(),
    '/start': (_) => service.start(),
    '/pause': (_) => service.pause(),
  })
}
