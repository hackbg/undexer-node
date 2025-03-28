import { TextLineStream } from "../deps.js"
import { log } from './lib.js'

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
      } catch (error) {
        // Error handler
        log.error("Request handling error", {
          respondedWith: 500,
          message: error.message,
          stack: error.stack,
          error
        })
        return respond(500, { error: error.message||error })
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
    log.start('Starting', { name: this.name })
    if (this.process) {
      log.start('Already started', { name: this.name })
      return false
    }
    const options = { args: this.args, stdout: 'piped', stderr: 'piped' }
    // Spawn child process
    this.process = new Deno.Command(this.command, options).spawn()
    const pid = this.process.pid
    // Listen for process exit
    this.process.status.then(status=>{
      log.warn('Died', { name: this.name, pid, status })
      this.process = null
    })
    log.start('Started', { name: this.name, pid })
    // Write service stdout and stderr to host stdout
    this.pipe(this.process.stdout, "stdout")
    this.pipe(this.process.stderr, "stderr")
    const state = await this.state()
    this.process = null
    return state
  }
  async pause () {
    log.stop('Stopping', { name: this.name })
    if (!this.process) {
      log.stop('Already stopped', { name: this.name })
      return false
    }
    const { pid } = this.process
    await new Deno.Command('pkill', { args: ['-9', this.command] }).spawn().status
    log.ok('Stopped', { name: this.name, pid })
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
    this.name     = name
    this.commands = commands
    log.start('Init', { name: this.name, commands: this.commands })
    this.processes = commands.map(_=>null)
  }
  async state () {
    const commands = [...new Set(this.commands.map(command=>command[0]))]
    return await Promise.all(commands.map(async command=>{
      const cmd    = 'pgrep'
      const args   = [ '-Acx', command[0] ]
      const opts   = { args, stdin: 'null', stdout: 'null', stderr: 'null' }
      const status = await new Deno.Command(cmd, opts).spawn().status
      return status.success
    }))
  }
  async start () {
    log.start('Starting:', { name: this.name })
    if (this.processes.every(Boolean)) {
      log.start('Already started:', { name: this.name })
      return false
    }
    if (this.processes.some(Boolean)) {
      log.warn('Partially started, killing all and restarting:', { name: this.name })
      await this.pause()
    }
    // Spawn each child process
    for (const c in this.commands) {
      const [command, ...args] = this.commands[c]
      log.start('Spawning', { name: this.name, command: this.commands[c] })
      this.processes[c] = new Deno.Command(command, {
        args,
        stdout: 'piped',
        stderr: 'piped',
      }).spawn()
      // Listen for process exit
      this.processes[c].status.then(status=>{
        log.stop('Died', { name: this.name, pid: this.processes[c].pid, status })
        this.processes[c] = null
      })
      log.start('Started', { name: this.name, pid: this.processes[c].pid })
      // Write service stdout and stderr to host stdout
      this.pipe(this.processes[c].stdout, "stdout")
      this.pipe(this.processes[c].stderr, "stderr")
    }
    return await this.state()
  }
  async pause () {
    log.stop('Stopping', { name: this.name })
    if (this.processes.every(x=>Boolean(x)===false)) {
      log.stop('Already stopped', { name: this.name })
      return false
    }
    await Promise.all(this.commands.map(async ([command])=>{
      await new Deno.Command('pkill', { args: ['-e', '-9', command] }).spawn().status
      log.stop('Stopped', { name: this.name })
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
