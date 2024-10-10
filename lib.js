import { TextLineStream } from "./deps.js"

export function initialize () {
  // Launch timestamp
  const t0 = performance.now()
  // Exit cleanly on Ctrl-C (otherwise container just detaches)
  Deno.addSignalListener("SIGINT", () => {
    console.log('Ran for', ((performance.now() - t0)/1000).toFixed(3), 'seconds')
    Deno.exit()
  })

  return t0
}

export function environment (vars) {
  const result = {}
  for (const [name, defaultValue] of Object.entries(vars)) {
    result[name] = Deno.env.get(name) ?? defaultValue
  }
  return result
}

export function api (name, host, port, routes = {}, socket) {
  return Deno.serve({
    host,
    port,
    onListen: () => console.log(`👂 ${name} control port: ${host}:${port}`)
  }, async req => {
    if (req.headers.get("upgrade") == "websocket") {
      if (socket) {
        return upgradeWebSocket(req, socket)
      } else {
        return respond(400, { error: 'websocket unavailable here' })
      }
    } else {
      const pathname = normalizePathname(req)
      const handler  = route(routes, pathname)
      if (handler) {
        return await Promise.resolve(handler(req))
      } else {
        return respond(404, { error: 'not found' })
      }
    }
  })
}

function upgradeWebSocket (req) {
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
}

function normalizePathname ({ url }) {
  let { pathname } = new URL(url)
  while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)
  if (pathname === '') pathname = '/'
  return pathname
}

// Route request to handler
function route (routes, pathname) {
  for (const [route, handler] of Object.entries(routes)) {
    if (route === pathname) {
      return handler
    }
  }
}

// Return a redirect to another path on the same host
function redirect (pathname) {
  const url = new URL(req.url)
  url.pathname = pathname
  return Response.redirect(url)
}

// Respond with JSON data
export function respond (status, data) {
  const headers = { "content-type": "application/json" }
  return new Response(JSON.stringify(data, null, 2), { status, headers })
}

export async function awaitObject (object) {
  const results = {}
  await Promise.all(Object.entries(object)
    .map(([key, value])=>Promise.resolve(value).then(result=>results[key]=result)))
  return results
}

export async function fetchJSON (...args) {
  const response = await fetch(...args)
  return await response.json()
}
