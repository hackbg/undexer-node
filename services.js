import { TextLineStream } from "./deps.js"
import { Service } from './lib.js'

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
      function respond (status, data) {
        const headers = { "content-type": "application/json" }
        return new Response(JSON.stringify(data, null, 2), { status, headers })
      }
    })
  }
}

export class Service {
  constructor (name, command, ...args) {
    this.name    = name
    this.command = command
    this.args    = args
    this.process = null
    this.signal  = 'SIGTERM'
    this.muted   = false
  }
  get status () {
    return !!this.process
  }
  async state () {
    const cmd  = 'pgrep'
    const args = [ '-x', this.command ]
    const { success } = await new Deno.Command(cmd, { args }).spawn().status
    return success
  }
  start () {
    console.log('Starting:', this.name)
    if (this.process) {
      console.log('Already started:', this.name)
      return false
    }
    const options = { args: this.args, stdout: 'piped', stderr: 'piped' }
    // Spawn child process
    this.process = new Deno.Command(this.command, options).spawn()
    // Listen for process exit
    this.process.status.then(status=>{
      console.log(
        'Died:',       this.name,
        'with PID:',   this.process.pid,
        'and status:', JSON.stringify(status)
      )
      this.process = null
    })
    console.log('Started:', this.name, 'at PID:', this.process.pid)
    // Write service stdout and stderr to host stdout
    this.pipe(this.process.stdout, "stdout")
    this.pipe(this.process.stderr, "stderr")
    return true
  }
  async pause () {
    console.log('Stopping:', this.name)
    if (!this.process) {
      console.log('Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    this.process.kill(this.signal)
    await this.process.status
    console.log('Stopped:', this.name, 'at PID:', pid)
    return true
  }
  mute () {
    this.muted = true
  }
  unmute () {
    this.muted = false
  }
  pipe (stream, kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        this.muted || console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
      }}))
  }
}

export class NamadaService extends Service {
  constructor (namada = 'namada', chainId) {
    super('Namada', namada, 'node', 'ledger', 'run')
    this.chainId = chainId
    this.regex   = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    this.events  = new EventTarget()
    this.start()
  }
  pipe (stream, kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        if (!this.muted) console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        const match = chunk.match(this.regex)
        if (match) {
          const [block, epoch] = match.slice(1)
          console.log(` ✔  Sync: block ${block} of epoch ${epoch}`)
          this.events.dispatchEvent(new SyncEvent({ block, epoch }))
        }
      } }))
  }
  /** Delete node state, allowing the sync to start from scratch.
    * This is invoked by the indexer when it finds that it is more
    * than 2 epochs ahead of the sync. */
  async deleteData () {
    await Promise.all([
      `db`, 'cometbft', 'tx_wasm_cache', 'vp_wasm_cache'
    ].map(path=>Deno.remove(`/home/namada/.local/share/namada/${this.chainId}/${path}`, {
      recursive: true
    }).catch((e)=>{
      console.warn(`Failed to remove ${path} (${e.message})`)
    })))
  }
}

class SyncEvent extends CustomEvent {
  constructor (detail) {
    super('synced', { detail })
  }
}

export class SimpleProxyService extends Service {
  constructor (proxy = 'simpleproxy', local, remote) {
    super('Proxy ', proxy, '-v', '-L', local, '-R', remote)
    this.signal = 'SIGKILL'
    this.start()
  }
  async stop () {
    console.log('Stopping:', this.name)
    if (!this.process) {
      console.log('Already stopped:', this.name)
      return false
    }
    const { pid } = this.process
    await new Deno.Command('pkill', { args: ['-9', 'simpleproxy'] }).spawn().status
    console.log('Stopped:', this.name, 'at PID:', pid)
    return true
  }
}
