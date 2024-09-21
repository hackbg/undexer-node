# Namada custom

This Dockerfile represents a modified [Namada](https://github.com/anoma/namada) node container
which connects through [simpleproxy](https://github.com/vzaliva/simpleproxy). The local proxy
acts as a "circuit breaker", allowing the sync process of the fullnode to be paused and resumed.
This is necessary because Namada aggressively prunes data from past epochs, and the only way for
[Undexer](https://github.com/hackbg/undexer) to index it is while a fullnode is syncing (see
https://github.com/anoma/namada/issues/3810).

## First steps

```sh
just build # build the image
just run   # start the container
curl localhost:25555 # get status
```

## Configuration

This service is configured using environment variables.

* `NAMADA`: override path to `namada` binary (useful for development)
* `PROXY`: override path to `simpleproxy` binary (useful for development)
* `LOCAL`: passed to `simpleproxy -L` (local address to which the node connects)
* `REMOTE`: passed to `simpleproxy -R` (must be an actual remote persistent peer)
* `CONTROL_HOST`: defaults to `localhost`
* `CONTROL_PORT`: defaults to `25555`
* `CHAIN_ID`: needs to be correct in order to restart syncs from scratch

## HTTP API

```sh
curl localhost:25555/proxy/stop  # pause syncing
curl localhost:25555/proxy/start # continue syncing
curl localhost:25555/node/stop   # kill the node
curl localhost:25555/node/start  # restart the node
curl localhost:25555/node/mute   # reduce log output
curl localhost:25555/node/unmute # restore log output
```

## WebSocket API

Subscribe to sync progress:

```sh
websocat ws://localhost:25555/ws
# {"synced":{"block":"...","epoch":"..."}}
```

When epoch increments, sync will automatically pause.
After indexing the data from te epoch, send `resume`:

```sh
echo '{"resume":{}}' | websocat ws://localhost:25555/ws
```

To erase the node data and start syncing from scratch,
use the `restart` message:

```sh
echo '{"restart":{}}' | websocat ws://localhost:25555/ws
```

It is also possible to combine both, to atomically restart and resume:

```sh
echo '{"restart":{}, "resume":{}}' | websocat ws://localhost:25555/ws
```

## TODO

* Unify HTTP and WebSocket APIs
