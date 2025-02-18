#!/usr/bin/env -S deno run --allow-read=peers.json --allow-env=BUILD_COLOR_VARIANT
import peerMap from './peers.json' with { type: 'json' }

const color = Deno.env.get('BUILD_COLOR_VARIANT')

switch (color) {
  case 'direct':
    build(null)
    break
  case 'green':
  case 'blue':
    build(color)
    break
  default:
    throw new Error(`Unsupported BUILD_COLOR_VARIANT=${color} (must be one of: direct, green, blue)`)
}

function build (color) {
  let peers
  if (!color) {
    peers = Object.values(peerMap).join(',')
  } else {
    peers = Object.entries(peerMap).map(([port, peer])=>{
      peer = new URL(peer)
      return `tcp://${peer.username}@${color}-sync-proxy:${port}`
    }).join(',')
  }
  console.log(peers)
}
