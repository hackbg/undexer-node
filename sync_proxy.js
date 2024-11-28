#!/usr/bin/env -S deno run --allow-net --allow-env=HOST,PORT,CONFIG --allow-read=peers.json
import peerMap from './peers.json' with { type: 'json' }
import { initialize, environment, api, respond } from './lib.js'

if (import.meta.main) main()

function main () {
  const t0 = initialize()
  const { HOST, PORT, CONFIG } = environment({
    HOST:   '0.0.0.0',
    PORT:   '25552',
    CONFIG: Object.entries(peerMap).map(([port, url])=>`${port}=${new URL(url).host}`).join(',')
  })
  const config = parseConfig(CONFIG)
  run(HOST, PORT, config)
}

const formatAddr = ({ transport, hostname, port }) => `${transport}://${hostname}:${port}`

async function run (localHost, controlPort, proxyConfig) {
  // Flag to allow/disallow connections
  let canConnect = true
  // Collection of active connections to close when pause signal is received
  const connections = new Set()
  // Print the proxy config that is in use
  console.log('🟢 Proxy config:', JSON.stringify(proxyConfig, null, 2))
  // Handler: report status
  const status = () => respond(200, { canConnect, connections: connections.size })
  // Handler: enable proxy
  const start  = () => {
    if (!canConnect) {
      console.log('🟢 Enabling new connections')
      canConnect = true
    }
    return respond(200, { canConnect, connections: connections.size })
  }
  // Handler: disable proxy
  const pause = () => {
    let connectionsJustClosed = 0
    let connectionsAlreadyClosed = 0
    if (canConnect) {
      console.log('🟠 Disabling new connections')
      canConnect = false
    }
    if (connections.size > 0) {
      console.log('Closing/cleaning up', connections.size, 'connection(s)')
      for (const connection of connections) {
        const { localAddr, remoteAddr } = connection
        try {
          connection.close()
          console.log('Closed:', formatAddr(localAddr), '<->', formatAddr(remoteAddr))
          connectionsJustClosed++
        } catch (e) {
          if (e.name === 'BadResource') {
            console.log('Cleaned up:', formatAddr(localAddr), '<->', formatAddr(remoteAddr))
            connectionsAlreadyClosed++
          } else {
            throw e
          }
        }
        connections.delete(connection)
      }
    }
    return respond(200, {
      canConnect,
      connections: connections.size,
      connectionsJustClosed,
      connectionsAlreadyClosed
    })
  }
  // Launch control api
  api('MultiSync', localHost, controlPort, { '/': status, '/start': start, '/pause': pause }, {
    onMessage: ({ event }) => {
      const data = JSON.parse(event.data)
      console.log('WS message received:', data)
      if (data.resume) {
        console.log('🟢 Resuming sync...')
        start()
      }
    }
  })
  // Launch TCP proxy listeners for each remote peer
  await Promise.all(Object.entries(proxyConfig).map(async ([localPort, { remoteHost, remotePort }])=>{
    // Listen on configured port
    const listener = Deno.listen({ transport: 'tcp', hostname: localHost, port: localPort })
    try {
      // For every new client connection:
      for await (const connection of listener) {
        // If connecting is enabled:
        if (canConnect) {
          console.log(`⏳ ${localPort}->${remoteHost}:${remotePort}: connecting`)
          try {
            // Establish connection to server
            const remote = await Deno.connect({ hostname: remoteHost, port: remotePort })
            // Store connection handle (to close on pause)
            console.log(`🟢 ${localPort}->${remoteHost}:${remotePort}: connected`)
            // Collect connection to close it on pause
            connections.add(connection)
            // Proxy client to server and back
            await Promise.all([
              connection.readable.pipeTo(remote.writable),
              remote.readable.pipeTo(connection.writable),
            ])
          } catch (e) {
            if (e.code) {
              console.error(`🔴 ${localPort}->${remoteHost}:${remotePort}: ${e.code}`)
            } else {
              console.error(`🔴 ${localPort}->${remoteHost}:${remotePort}`, e)
            }
          }
        } else {
          console.log(`🟠 ${localPort}->${remoteHost}:${remotePort}: rejected`)
          connection.close()
        }
      }
    } catch (e) {
      console.error(`🔴`, e)
    }
  }))
}

function parseConfig (text) {
  const configError1 = (config) => {
    console.error(`🔴 Config:`, config)
    return new Error(`Invalid config; format: LPORT=RHOST:RPORT[,LPORT=RHOST:RPORT]*`)
  }
  const configError2 = (port) => new Error(`Invalid local port in config: ${port}`)
  const configError3 = (host) => new Error(`Empty remote host in config: ${host}`)
  const configError4 = (port) => new Error(`Invalid remote port in config: ${port}`)
  const configError5 = (port) => new Error(`Duplicate local port in config: ${port}`) 
  const config = {}
  // Config is comma-separated clauses: LocalPort=RemoteHost:RemotePort
  for (let line of text.split(',')) {
    // Ignore whitespace and empty lines
    line = line.trim()
    if (line.length === 0) continue
    // Split into left and right parts
    let split = line.split('=')
    if (split.length !== 2) throw configError1()
    // Validate port number
    const localPort = Number(split[0])
    if (!(localPort > 0 && localPort < 65535)) throw configError2(split[0])
    // Parse remote connection details
    split = split[1].split(':')
    // Validate remote host
    const remoteHost = split[0].trim()
    if (remoteHost.length === 0) throw configError3(split[0])
    // Validate remote port
    const remotePort = Number(split[1])
    if (!(remotePort > 0 && remotePort < 65535)) throw configError4(split[1])
    // Prevent duplicates
    if (config[localPort]) throw configError5(localPort)
    config[localPort] = { remoteHost, remotePort }
  }
  return config
}
