#!/usr/bin/env -S deno run --allow-net --allow-write=peers.json

const toPeer = peer =>
  `${peer.node_info.id}@${peer.remote_ip}:${new URL(peer.node_info.listen_addr).port}`

fetch('https://namada-rpc.mandragora.io/net_info')
  .then(response=>response.json())
  .then(response=>response.result.peers)
  .then(peers=>peers.map(toPeer))
  .then(peers=>peers.map((peer, index)=>[26666+index, peer]))
  .then(Object.fromEntries)
  .then(console.log)
