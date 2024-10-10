#!/usr/bin/env -S deno run --allow-net --allow-run=namadan,pkill,pgrep --allow-env=HOST,PORT,NAMADA,CHAIN_ID --allow-read=/home/namada/.local/share/namada
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
  const { HOST, PORT, NAMADA, CHAIN_ID } = environment({
    HOST:     "0.0.0.0",
    PORT:     "25551",
    NAMADA:   "namadan",
    CHAIN_ID: "housefire-reduce.e51ecf4264fc3",
  })
  const service = new NamadaService(NAMADA, CHAIN_ID)
  api(HOST, PORT, service.routes())
}

export class NamadaService extends Service {
  constructor (namada = 'namadan', chainId) {
    super('Namada', namada, 'ledger', 'run')
    this.chainId = chainId
    this.regex   = new RegExp('Block height: (\\d+).+epoch: (\\d+)')
    this.events  = new EventTarget()
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
  pipe (stream, kind) {
    stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TextLineStream())
      .pipeTo(new WritableStream({ write: (chunk, _) => {
        //if (!this.muted) console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        //this.muted || console.log(`:: ${this.name} :: ${kind} :: ${chunk}`)
        if (!this.muted) console.log(chunk)
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
