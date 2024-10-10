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

export function api (host, port, routes = {}) {
  const onListen = () => console.log(`👂 Control port: ${host}:${port}`)
  return Deno.serve({ host, port, onListen }, async req => {
    let { pathname } = new URL(req.url)
    while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)
    if (pathname === '') pathname = '/'
    // Route request to service
    for (const [route, handler] of Object.entries(routes)) {
      if (route === pathname) {
        return await Promise.resolve(handler(req)) || redirect('/')
      }
    }
    return respond(404, { error: 'not found' })
    // Return a redirect to another path on the same host
    function redirect (pathname) {
      const url = new URL(req.url)
      url.pathname = pathname
      return Response.redirect(url)
    }
    // Respond with JSON data
    function respond (status, data) {
      const headers = { "content-type": "application/json" }
      return new Response(JSON.stringify(data, null, 2), { status, headers })
    }
  })
}

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
