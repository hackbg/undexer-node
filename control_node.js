#!/usr/bin/env -S deno run --allow-net --allow-run=namadan,pkill,pgrep --allow-env=HOST,PORT,NAMADA,CHAIN_ID,NODE_OUT --allow-read=/home/namada/.local/share/namada --allow-write=/home/namada/.local/share/namada
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
  initialize()
  const { HOST, PORT, NAMADA, CHAIN_ID, NODE_OUT } = environment({
    HOST:     "0.0.0.0",
    PORT:     "25551",
    NAMADA:   "namadan",
    CHAIN_ID: "namada-dryrun.abaaeaf7b78cb3ac",
    NODE_OUT: "http://node-out:25552"
  })
  const service = new NamadaService(NAMADA, CHAIN_ID)
  service.events.addEventListener('request-pause', async () => {
    let result = true
    while (!(result === false)) {
      console.log('🟠 Requesting pause until indexer catches up.')
      const response = await fetch(`${NODE_OUT}/pause`)
      result = await response.json()
    }
  })
  api('Node', HOST, PORT, service.routes(), {
    onOpen:    ({ send }) => {
      service.events.addEventListener('synced', send)
    },
    onClose:   ({ send }) => {
      service.events.removeEventListener('synced', send)
    },
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
}

export class NamadaService extends Service {
  constructor (namada = 'namadan', chainId) {
    super('Namada', namada, 'ledger', 'run')
    this.chainId = chainId
    this.regex   = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    this.events  = new EventTarget()
    this.epoch   = 0n
    this.start()
  }
  async start () {
    const configPath = `/home/namada/.local/share/namada/${this.chainId}/config.toml`
    const config = (await Deno.readTextFile(configPath)).split('\n')
    for (const line of config.filter(line=>line.includes('persistent_peers'))) {
      console.log('ℹ️ Config:', line)
    }
    return super.start()
  }
  pipe (stream, _kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        //if (!this.muted) console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        //this.muted || console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        if (!this.muted) console.log(chunk)
        const match = chunk.match(this.regex)
        if (match) {
          let [block, epoch] = match.slice(1)
          console.log(`🟢 Sync: block ${block} of epoch ${epoch}`)
          this.events.dispatchEvent(new SyncEvent({ block, epoch }))
          epoch = BigInt(epoch)
          if (epoch > this.epoch) {
            this.epoch = epoch
            console.log('🟠 Epoch has increased to', epoch)
            this.events.dispatchEvent(new RequestPauseEvent())
          }
        }
      } }))
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
