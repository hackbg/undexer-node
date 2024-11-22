# Namada custom

This repo emits a container image that can run in **4 modes**.
Running all 4 together in the setup described below results in
a Namada node whose **syncing can be paused.** While syncing is
paused, Undexer can reliably index the historical data that would
normally be pruned from the chain after 2 epochs, and is thus only
available during sync (see [`anoma/namada#3810`](https://github.com/anoma/namada/issues/3810)).

<table>
<thead>
<tr>
<th>Mode</th>
<th>Command</th>
<th>Networks</th>
<th>Requires init?</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>node</code></td>
<td><code>control_node.js</code></td>
<td>⚠️ <b>Internal only</b></td>
<td>No</td>
<td>Manages the Namada node. <b>MUST run in isolated network (no Internet access except through <code>rpc-proxy</code> and <code>sync-proxy</code>).</b>
Parses node log; when epoch increments, <code>node</code> messages <code>sync-proxy</code>
to pause the sync.</td>
</tr>
<tr>
<td><code>rpc-proxy</code></td>
<td><code>rpc_proxy.js</code></td>
<td>Internal, External</td>
<td>⚠️ <b>Yes</b></td>
<td>Allows connections from indexer to node.</td>
</tr>
<tr>
<td><code>sync-proxy</code></td>
<td><code>sync_proxy.js</code></td>
<td>Internal, External</td>
<td>⚠️ <b>Yes</b></td>
<td>Allows connections from node to peers. By pausing the contained proxy,
node sync is paused, so that the indexer can catch up.</td>
</tr>
<tr>
<td><code>node-status</code></td>
<td><code>status.js</code></td>
<td>Internal, External</td>
<td>No</td>
<td>Manages the other three. When indexing has caught up, Undexer tells <code>node-status</code>
to resume sync, and <code>node-status</code> tells <code>sync-proxy</code> to restart the proxy.</td>
</tr>
</tbody>
</table>

Note that `rpc-proxy` and `sync-proxy` require an init process in the container
(`docker run --init`, or `init: true` in `docker-compose.yml`) so that Docker
is able to reap the zombie processes that are created when the internal
`simpleproxy` is killed by the managing script.

Here's an example Docker Compose manifest which describes the relations between
the containers. Adapt as needed.

```yaml
volumes:
  database:
networks:
  database:
  external:
  internal:
    internal: true
services:
  postgres:
    image:    postgres:16.2-alpine
    networks: [ database ]
    restart:  unless-stopped
    ports:    [ "127.0.0.1:5432:5432" ]
    environment:
      - POSTGRES_PASSWORD=insecure
      - POSTGRES_USER=postgres
      - POSTGRES_DB=postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
  indexer:
    entrypoint:  /app/undexer
    command:     index
    networks:    [ external, database ]
    image:       ghcr.io/hackbg/undexer:v4
    restart:     unless-stopped
    depends_on:  { postgres: { condition: service_healthy } }
    environment: { RPC_URL: "http://rpc-proxy:26657" }
  rpc-proxy:
    entrypoint:  /rpc_proxy.js
    networks:    [ external, internal ]
    image:       ghcr.io/hackbg/namada-for-undexer:main
    init:        true
    restart:     unless-stopped
  node:
    entrypoint:  /control_node.js
    networks:    [ internal ]
    image:       ghcr.io/hackbg/namada-for-undexer:main
    restart:     unless-stopped
  sync-proxy:
    entrypoint:  /sync_proxy.js
    networks:    [ external, internal ]
    image:       ghcr.io/hackbg/namada-for-undexer:main
    init:        true
    restart:     unless-stopped
    environment: { REMOTE: "namada-peer.mandragora.io:26656" }
```
