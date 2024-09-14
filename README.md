# Namada custom

This Dockerfile represents a modified [Namada](https://github.com/anoma/namada) node container to allow proxying peer discovery via a proxy service such as [simpleproxy](https://github.com/vzaliva/simpleproxy).

The goal is to allow for [Undexer](https://github.com/hackbg/undexer) to catch up and sync data historically prior to it's deletion/prune (see why that matters in the issue here: https://github.com/anoma/namada/issues/3810)

## How to use it

1. Build the image.
```sh
docker build -t namada-custom .
```

2. Run the image in a container.
```sh
docker run --network host namada-custom
```

3. Start a proxy (e.g. sipleproxy) and proxy the peer discovery port to allow incoming peer discovery and sync.

```sh
simpleproxy -L :26666 -R 165.227.42.204:26656
```

When the proxy is not running the node won't sync state and fetch new blocks.