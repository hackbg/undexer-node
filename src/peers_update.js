#!/usr/bin/env -S deno run --allow-net --allow-write=peers.json

const toPeer = peer =>
  `tcp://${peer.node_info.id}@${peer.remote_ip}:${new URL(peer.node_info.listen_addr).port}`

const defaultPeer =
  ["26666", 'tcp://e055101fc58397cd4e740403807e2250a60c9cb0@namada-peer.mandragora.io:26656']

fetch('https://namada-rpc.mandragora.io/net_info')
  .then(response=>response.json())
  .then(response=>response.result.peers)
  .then(peers=>peers.map(toPeer))
  .then(peers=>peers.map((peer, index)=>[26666+index+1, peer]))
  .then(peers=>Object.fromEntries([ defaultPeer, ...peers, ]))
  .then(console.log)
