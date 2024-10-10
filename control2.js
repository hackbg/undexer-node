#!/usr/bin/env -S deno run --allow-net --allow-env=IN,NODE,OUT,HOST,PORT
import { initialize, environment, api, awaitObject, fetchJSON, respond } from './lib.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, IN, NODE, OUT } = environment({
    HOST: "0.0.0.0",
    PORT: "25555",
    IN:   "http://node-in:25550",
    NODE: "http://node:25551",
    OUT:  "http://node-out:25552",
  })
  const checkStatus = url => fetchJSON(IN)
    .then(x=>({running: x}))
    .catch(e=>({ error: e.message }))
  api(HOST, PORT, {
    '/': async (_) => respond(200, await awaitObject({
      "index": checkStatus(IN),
      "node":  checkStatus(NODE),
      "sync":  checkStatus(OUT)
    }))
  })
}
