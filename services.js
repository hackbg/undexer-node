import { TextLineStream } from "./deps.js"

export class ServiceManager {
  constructor (services) {
    this.services = services
    // Define routes from services
    this.routes = []
    for (const [id, service] of Object.entries(services)) {
      this.routes.push([`/${id}/start`,  () => { service.start()  }])
      this.routes.push([`/${id}/stop`,   () => { service.stop()   }])
      this.routes.push([`/${id}/mute`,   () => { service.mute()   }])
      this.routes.push([`/${id}/unmute`, () => { service.unmute() }])
    }
  }
  listen (config, getInfo) {
    // Run service
    Deno.serve(config, async (req) => {
      try {
        // Service status
        const info = getInfo()
        // Trim trailing slashes
        let { pathname } = new URL(req.url)
        while (pathname.endsWith('/')) pathname = pathname.slice(0, pathname.length - 1)
        // Route request to service
        for (const [route, handler] of this.routes) {
          if (route === pathname) {
            return await Promise.resolve(handler(req)) || redirect('/')
          }
        }
        // Default routes
        switch (pathname) {
          case '': return respond(200, info)
          default: return respond(404, { error: 'not found' })
        }
      } catch (e) {
        // Error handler
        console.error(e)
        return respond(500, { error: e.message||e })
      }
      // Return a redirect to another path on the same host
      function redirect (pathname) {
        const url = new URL(req.url)
        url.pathname = pathname
        return Response.redirect(url)
      }
      // Respond with JSON data
    })
  }
}

export function respond (status, data) {
  const headers = { "content-type": "application/json" }
  return new Response(JSON.stringify(data, null, 2), { status, headers })
}

export class LogPipe {
  muted = false
  mute () { this.muted = true }
  unmute () { this.muted = false }
  pipe (stream, _kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        //this.muted || console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        this.muted || console.log(chunk)
      }}))
  }
}

export class Service extends LogPipe {
  constructor (name, command, ...args) {
    super()
    this.name    = name
    this.command = command
    this.args    = args
    this.process = null
    this.signal  = 'SIGTERM'
  }
  async state () {
    const cmd  = 'pgrep'
    const args = [ '-Acx', this.command ]
    const opts = { args, stdin: 'null', stdout: 'null', stderr: 'null' }
    const status = await new Deno.Command(cmd, opts).spawn().status
    return status.success
  }
  async start () {
    console.log('🚀 Starting:', this.name)
    if (this.process) {
      console.log('🚀 Already started:', this.name)
      return false
    }
    const options = { args: this.args, stdout: 'piped', stderr: 'piped' }
    // Spawn child process
    this.process = new Deno.Command(this.command, options).spawn()
    // Listen for process exit
    this.process.status.then(status=>{
      console.log(
        '🟠 Died:',    this.name,
        'with PID:',   this.process.pid,
        'and status:', JSON.stringify(status)
      )
      this.process = null
    })
    console.log('🚀 Started: ', this.name, 'at PID:', this.process.pid)
    // Write service stdout and stderr to host stdout
    this.pipe(this.process.stdout, "stdout")
    this.pipe(this.process.stderr, "stderr")
    return await this.state()
  }
  async pause () {
    console.log('🟠 Stopping:', this.name)
    if (!this.process) {
      console.log('🟠 Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    await new Deno.Command('pkill', { args: ['-9', 'simpleproxy'] }).spawn().status
    console.log('🟠 Stopped:', this.name, 'at PID:', pid)
    return await this.state()
  }
  routes () {
    return {
      '/':      async (_) => respond(200, await this.state()),
      '/start': async (_) => respond(200, await this.start()),
      '/pause': async (_) => respond(200, await this.pause()),
    }
  }
}

export class MultiService extends LogPipe {
  constructor (name, commands) {
    super()
    this.name      = name
    this.commands  = commands
    console.log('🚀 Init', this.name, 'with', this.commands)
    this.processes = commands.map(_=>null)
  }
  async state () {
    const commands = [...new Set(this.commands.map(command=>command[0]))]
    await Promise.all(commands.map(async command=>{
      const cmd    = 'pgrep'
      const args   = [ '-Acx', command[0] ]
      const opts   = { args, stdin: 'null', stdout: 'null', stderr: 'null' }
      const status = await new Deno.Command(cmd, opts).spawn().status
      return status.success
    }))
  }
  async start () {
    console.log('🚀 Starting:', this.name)
    if (this.processes.every(Boolean)) {
      console.log('🚀 Already started:', this.name)
      return false
    }
    if (this.processes.some(Boolean)) {
      console.log('🟠 Partially started, killing all and restarted:', this.name)
      await this.pause()
    }
    // Spawn each child process
    for (const c in this.commands) {
      const [command, ...args] = this.commands[c]
      console.log('🚀 Spawning:', this.commands[c])
      this.processes[c] = new Deno.Command(command, {
        args,
        stdout: 'piped',
        stderr: 'piped',
      }).spawn()
      // Listen for process exit
      this.processes[c].status.then(status=>{
        console.log(
          '🟠 Died:',    this.name,
          'with PID:',   this.processes[p].pid,
          'and status:', JSON.stringify(status)
        )
        this.processes[c] = null
      })
      console.log('🚀 Started: ', this.name, 'at PID:', this.processes[c].pid)
      // Write service stdout and stderr to host stdout
      this.pipe(this.processes[c].stdout, "stdout")
      this.pipe(this.processes[c].stderr, "stderr")
    }
    return await this.state()
  }
  async pause () {
    console.log('🟠 Stopping:', this.name)
    if (this.processes.all(x=>Boolean(x)===false)) {
      console.log('🟠 Already stopped:', this.name)
      return false
    }
    await Promise.all(this.commands.map(async ([command])=>{
      await new Deno.Command('pkill', { args: ['-9', command] }).spawn().status
      console.log('🟠 Stopped:', this.name, 'at PID:', pid)
    }))
    return await this.state()
  }
  routes () {
    return {
      '/':      async (_) => respond(200, await this.state()),
      '/start': async (_) => respond(200, await this.start()),
      '/pause': async (_) => respond(200, await this.pause()),
    }
  }
}
