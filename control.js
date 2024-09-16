#!/usr/bin/env -S deno run --allow-net --allow-run=namada,simpleproxy --allow-env=LOCAL,REMOTE,CONTROL_HOST,CONTROL_PORT

const LOCAL        = Deno.env.get("LOCAL")        || ":26666"
const REMOTE       = Deno.env.get("REMOTE")       || "165.227.42.204:26656"
const CONTROL_HOST = Deno.env.get("CONTROL_HOST") || "127.0.0.1"
const CONTROL_PORT = Deno.env.get("CONTROL_PORT") || "25555"

class Service {
  constructor (name, command, ...args) {
    this.name    = name
    this.command = command
    this.args    = args
  }
  process = null
  get status () {
    return !!this.process
  }
  start () {
    console.log('Starting:', this.name)
    if (this.process) {
      console.log('Already started:', this.name)
      return false
    }
    const options = { args: this.args, stdout: 'piped', stderr: 'piped' }
    this.process = new Deno.Command(this.command, options).spawn()
    console.log('Started:', this.name, 'at PID:', this.process.pid)
    this.process.stdout.pipeTo(Deno.stdout.writable, { preventClose: true })
    this.process.stderr.pipeTo(Deno.stderr.writable, { preventClose: true })
    return true
  }
  stop () {
    console.log('Stopping:', this.name)
    if (!this.process) {
      console.log('Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    this.process.kill()
    this.process = null
    console.log('Stopped:', this.name, 'at PID:', pid)
    return true
  }
}

const services = {
  node:  new Service('Namada fullnode', 'namada', 'node', 'ledger', 'run'),
  proxy: new Service('TCP proxy', 'simpleproxy', "-L", LOCAL, "-R", REMOTE)
}
const routes = []
for (const service of Object.keys(services)) {
  routes.push(`/${service}/start`)
  routes.push(`/${service}/stop`)
}

Deno.serve({ host: CONTROL_HOST, port: CONTROL_PORT }, (req) => {
  try {
    const info = {
      config:   { LOCAL, REMOTE },
      services: { proxy: services.proxy.status, node: services.node.status },
      commands: routes
    }
    let { pathname } = new URL(req.url)
    while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)
    switch (pathname) {
      case '/node/start':
        services.node.start()
        return redirect('/')
      case '/node/stop':
        services.node.stop()
        return redirect('/')
      case '/proxy/start':
        services.proxy.start()
        return redirect('/')
      case '/proxy/stop':
        services.proxy.stop()
        return redirect('/')
      case '':
        return respond(200, info)
      default:
        return respond(404, { error: 'not found' })
    }
  } catch (e) {
    console.error(e)
    return respond(500, { error: e.message||e })
  }

  function redirect (pathname) {
    const url = new URL(req.url)
    url.pathname = pathname
    return Response.redirect(url)
  }
  function respond (status, data) {
    const headers = { "content-type": "application/json" }
    return new Response(JSON.stringify(data, null, 2), { status, headers })
  }
})
