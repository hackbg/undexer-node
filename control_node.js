#!/usr/bin/env -S deno run --allow-net --allow-run=namadan-1.0.0,pkill,pgrep --allow-env=HOST,PORT,NAMADA,CHAIN_ID,NODE_OUT --allow-read=/home/namada/.local/share/namada --allow-write=/home/namada/.local/share/namada
// This service runs the node. In order for the indexer to have time to fetch all data
// before epoched data is pruned, this service parses the log output of the node, and
// when the epoch has incremented it tells the outgoing proxy to cut off outgoing
// connections from the node. Once the indexer is done with the current epoch, it tells
// the outgoing service to resume.
import { initialize, environment, api } from './lib.js'
import { TextLineStream } from './deps.js'
import { Service } from './services.js'

if (import.meta.main) setTimeout(main, 0)

function main () {
  // Initialize and configure
  initialize()
  const { HOST, PORT, NAMADA, CHAIN_ID, NODE_OUT } = environment({
    HOST:     "0.0.0.0",
    PORT:     "25551",
    NAMADA:   "0=namadan-1.0.0",
    CHAIN_ID: "namada-dryrun.abaaeaf7b78cb3ac",
    NODE_OUT: "http://sync-proxy:25552"
  })

  // Namada node service manager
  const service = new NamadaService(NAMADA, CHAIN_ID)

  // When the node log contains block height and epoch, do the magic
  service.events.addEventListener('synced', async ({detail: {block, epoch}}) => {
    // Switch to next version of Namada node if hardfork has occurred
    block = BigInt(block)
    let namada = service.namadas[0n]
    // Find the next version to run
    for (const hardfork of Object.keys(service.namadas)) {
      if (block > hardfork) {
        namada = service.namadas[hardfork]
        break
      }
    }
    // If the next version is different to the current one, launch it
    if (namada != service.namada) {
      await service.pause()
      service.namada = namada
      await service.start()
    }
    // Pause if epoch has incremented
    epoch = BigInt(epoch)
    if (epoch > service.epoch) {
      service.epoch = epoch
      console.log('🟠 Epoch has increased to', epoch)
      service.events.dispatchEvent(new RequestPauseEvent())
    }
  })

  // When pause is requested, tell the sync-proxy to disconnect.
  // The undexer will tell it to reenable connections when ready to continue.
  service.events.addEventListener('request-pause', async () => {
    let canConnect = true
    while (canConnect) {
      console.log('🟠 Requesting pause until indexer catches up.')
      const response = await fetch(`${NODE_OUT}/pause`)
      const responseJson = await response.json()
      console.log('🟠 Pause response:', responseJson)
      canConnect = responseJson.canConnect
      await new Promise(resolve=>setTimeout(resolve, 100))
    }
  })

  // Run HTTP+WS API server
  api('Node', HOST, PORT, service.routes(), {
    // Notify undexer of sync progress
    onOpen: ({ send }) => {
      service.events.addEventListener('synced', event => send(event))
    },
    // Stop trying to notify undexer of sync progress on disconnect
    onClose: ({ send }) => {
      service.events.removeEventListener('synced', event => send(event))
    },
    // Respond to resync command from undexer
    onMessage: async ({ event }) => {
      const data = JSON.parse(event.data)
      if (data.restart) {
        console.log('🚨 Restarting sync from beginning...')
        await service.pause()
        await service.deleteData()
        await service.start()
      }
    }
  })

  // And away we go!
  service.start()
}

export class NamadaService extends Service {

  constructor (namadas = "0=namadan-0.45.1,182000=namadan-0.46.0", chainId) {
    // Multiple versions of Namada to support hard forks
    namadas = Object.fromEntries(namadas
      .split(',')
      .map(x=>x.split('='))
      .map(([block, bin])=>[BigInt(block), bin])
    )
    const namada = namadas[0n]
    if (!namada) {
      throw new Error('NAMADA format: 0=...[,HardForkHeight=...]')
    }
    // Start with 1st version of Namada node
    super('Namada', namada, 'ledger', 'run')
    // Which version to run starting from which block
    this.namadas = namadas
    // Currently selected version
    this.namada  = namada
    // Used to find config file
    this.chainId = chainId
    // Match block increment in log output
    this.regex   = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    // Brokers events asynchronously
    this.events  = new EventTarget()
    // Current epoch (FIXME: need to persist this!)
    this.epoch   = 0n
  }

  // Print config before launching node
  async start () {
    await this.printConfig()
    return super.start()
  }

  // Print config
  async printConfig () {
    const configPath = `/home/namada/.local/share/namada/${this.chainId}/config.toml`
    const config = (await Deno.readTextFile(configPath)).split('\n')
    for (const line of config.filter(line=>line.includes('persistent_peers'))) {
      console.log('ℹ️ Config:', line)
    }
  }

  // Output from service is parsed line-by-line and passed to callback
  pipe (stream, _kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => this.onChunk(chunk) }))
  }

  // Handle block and epoch increments
  onChunk (chunk) {
    if (!this.muted) {
      console.log(chunk)
    }
    const match = chunk.match(this.regex)
    if (match) {
      // Report block and epoch progress
      const [block, epoch] = match.slice(1)
      console.log(`🟢 Sync: block ${block} of epoch ${epoch}`)
      this.events.dispatchEvent(new SyncEvent({ block, epoch }))
    }
  }
  /** Delete node state, allowing the sync to start from scratch.
    * This is invoked by the indexer when it finds that it is more
    * than 2 epochs ahead of the sync. */
  async deleteData () {
    while (true) try {
      console.log('Deleting node data...')
      await Promise.all([
        `db`, 'cometbft', 'tx_wasm_cache', 'vp_wasm_cache'
      ].map(path=>Deno.remove(`/home/namada/.local/share/namada/${this.chainId}/${path}`, {
        recursive: true
      })))
      break
    } catch (e) {
      console.warn(`Failed to remove ${path} (${e.message})`)
    }
  }
}

class SyncEvent extends CustomEvent {
  constructor (detail) {
    super('synced', { detail })
  }
}

class RequestPauseEvent extends CustomEvent {
  constructor () {
    super('request-pause')
  }
}
