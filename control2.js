#!/usr/bin/env -S deno run --allow-net --allow-env=IN,NODE,OUT,HOST,PORT
import { initialize, environment, api, awaitObject, fetchJSON } from './lib.js'
if (import.meta.main) main()
function main () {
  initialize()
  const { HOST, PORT, IN, NODE, OUT } = environment({
    HOST: "0.0.0.0",
    PORT: "25555",
    IN:   "node-in:25550",
    NODE: "node:25551",
    OUT:  "node-out:25552",
  })
  api(HOST, PORT, {
    '/': (_) => awaitObject({ "in": fetchJSON(IN), "node": fetchJSON(NODE), "out": fetchJSON(OUT), })
  })
}
