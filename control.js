#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy --allow-env=LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT

const LOCAL        = Deno.env.get("LOCAL")        || ":26666"
const REMOTE       = Deno.env.get("REMOTE")       || "165.227.42.204:26656"
const CONTROL_HOST = Deno.env.get("CONTROL_HOST") || "127.0.0.1"
const CONTROL_PORT = Deno.env.get("CONTROL_PORT") || "25555"

let node  = null
let proxy = null

Deno.serve({ host: CONTROL_HOST, port: CONTROL_PORT }, (req) => {
  try {
    const info = {
      config:   { LOCAL, REMOTE },
      services: { proxy: !!proxy, node: !!node },
      commands: [ "/proxy/start", "/proxy/stop", "/node/start", "/node/stop", ]
    }
    let { pathname } = new URL(req.url)
    while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)
    switch (pathname) {
      case '/node/start':
        startNode()
        return respond(202, info)
      case '/node/stop':
        stopNode()
        return respond(202, info)
      case '/proxy/start':
        startProxy()
        return respond(202, info)
      case '/proxy/stop':
        stopProxy()
        return respond(202, info)
      case '/':
        return respond(200, info)
      default:
        return respond(404, info)
    }
  } catch (e) {
    console.error(e)
    return respond(500, { error: e.message||e })
  }
})

function respond (status, data) {
  const headers = { "content-type": "application/json" }
  return new Response(JSON.stringify(data, null, 2), { status, headers })
}

function startProxy () {
  if (proxy) {
    console.log('Proxy already running.')
    return
  }
  const options = { args: [ "-L", LOCAL, "-R", REMOTE ], stdout: 'piped', stderr: 'piped' }
  proxy = new Deno.Command("simpleproxy", options).spawn()
  console.log('Proxying', LOCAL, '->', REMOTE)
  proxy.stdout.pipeTo(Deno.stdout.writable)
  proxy.stderr.pipeTo(Deno.stderr.writable)
}

function stopProxy () {
  if (proxy) {
    const { pid } = proxy
    proxy.kill()
    proxy = null
    console.log('Stopped proxy', pid)
  }
  console.log('Proxy already stopped.')
}

function startNode () {
  if (node) {
    console.log('Node already running.')
    return
  }
  const options = { args: [ "node", "ledger", "run" ] }
  node = new Deno.Command('namada', options)
}

function stopNode () {
  if (node) {
    const { pid } = node
    node.kill()
    node = null
    console.log('Stopped node', pid)
  }
  console.log('Node already stopped.')
}
