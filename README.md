# Namada custom

This repo emits a container image that can run in **4 modes**.
Running all 4 together in the setup described below results in
a Namada node whose **syncing can be paused.** Together with Undexer,
this allows for a Namada chain to be fully indexed - including the data
that is pruned after 2 epochs (see [`anoma/namada#3810`](https://github.com/anoma/namada/issues/3810)).

<table>
<thead>
<tr>
<th>Mode</th>
<th>Command</th>
<th>Networks</th>
<th>Requires <code>--init</code>?</th>
<th>Description</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>node</code></td>
<td><code>control_node.js</code></td>
<td>Internal</td>
<td>No</td>
<td>Manages the Namada node. <b>Should run in isolated network (no Internet access).</b>
Parses node log; when epoch increments, <code>node</code> messages <code>node-out</code>
to pause the sync.</td>
</tr>
<tr>
<td><code>node-in</code></td>
<td><code>control_in.js</code></td>
<td>Internal, External</td>
<td>Yes</td>
<td>Proxies connections from indexer to node.</td>
</tr>
<tr>
<td><code>node-out</code></td>
<td><code>control_out.js</code></td>
<td>Internal, External</td>
<td>Yes</td>
<td>Proxies connections from node to peers. By pausing this proxy, node sync is paused, so that
the indexer can catch up.</td>
</tr>
<tr>
<td><code>node-status</code></td>
<td><code>control_status.js</code></td>
<td>Internal, External</td>
<td>No</td>
<td>Manages the other three. When indexing has caught up, Undexer tells <code>node-status</code>
to resume sync, and <code>node-status</code> tells <code>node-out</code> to restart the proxy.</td>
</tr>
</tbody>
</table>

Note that `node-in` and `node-out` require to be run with `--init` (`init: true`),
so that Docker is able to reap the zombie processes that are created when the
internal `simpleproxy` is killed by the managing script.

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
    image:       oci.hack.bg/undexer:v4
    restart:     unless-stopped
    depends_on:  { postgres: { condition: service_healthy } }
    environment: { RPC_URL: "http://node-in:26657" }
  node-in:
    entrypoint:  /control_in.js
    networks:    [ external, internal ]
    image:       oci.hack.bg/namada:userv
    init:        true
    restart:     unless-stopped
  node:
    entrypoint:  /control_node.js
    networks:    [ internal ]
    image:       oci.hack.bg/namada:userv
    restart:     unless-stopped
  node-out:
    entrypoint:  /control_out.js
    networks:    [ external, internal ]
    image:       oci.hack.bg/namada:userv
    init:        true
    restart:     unless-stopped
  node-status:
    entrypoint:  /control_status.js
    networks:    [ external, internal ]
    image:       oci.hack.bg/namada:userv
    init:        true
    restart:     unless-stopped
    ports:       [ "127.0.0.1:25555:25555" ]
```
