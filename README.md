# Namada custom

This repo emits a container image that can run in **4 modes**.
Running all 4 together in the setup described below results in
a Namada node whose **syncing can be paused.** Together with Undexer,
this allows for a Namada chain to be fully indexed - including the data
that is pruned after 2 epochs (see [`anoma/namada#3810`](https://github.com/anoma/namada/issues/3810)).

* `node` runs `control_node.js`. This manages the Namada node.
  **This should be run in an isolated Docker network with no Internet access.**
* `node-in` runs `control_in.js`. This manages an instance of `simpleproxy`
  which proxies connections **from the indexer to the node**. It should have access to
  **both the isolated network as well as the network of the indexing process.**
* `node-out` runs `control_out.js`. This manages an instance of `simpleproxy`
  which proxies connections **from the node to its peers**. By stopping this proxy,
  syncing is paused so that the indexer can **catch up before epoched data
  is pruned by the node**. It should have access to **both the isolated network
  and the outside world.**
* `node-status` runs `control_status.js`. This manages the other control processes,
  most importantly - starting/stopping the `node-out` proxy. It should have access
  to **the networks of all other containers.**

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
