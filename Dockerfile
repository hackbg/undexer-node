FROM ghcr.io/anoma/namada:v0.46.0 AS namada

# Install system dependencies
USER root
RUN apt update \
 && apt install -y vim curl wget unzip procps simpleproxy jq less iputils-ping iproute2 tcpdump strace
RUN cd /tmp \
 && wget https://github.com/denoland/deno/releases/download/v1.46.3/deno-x86_64-unknown-linux-gnu.zip \
 && unzip deno-x86_64-unknown-linux-gnu.zip \
 && mv deno /usr/local/bin \
 && rm deno-x86_64-unknown-linux-gnu.zip

# Configure node
USER namada
ENV NAMADA_NETWORK_CONFIGS_SERVER="https://testnet.namada-dryrun.tududes.com/configs"
ENV CHAIN_ID="namada-dryrun.abaaeaf7b78cb3ac"
ENV DATA_DIR="/home/namada/.local/share/namada/$CHAIN_ID"
ENV WASM_DIR="$DATA_DIR/wasm"
ENV CONFIG_DIR="$DATA_DIR/config.toml"
RUN namadac utils join-network --chain-id $CHAIN_ID --wasm-dir $WASM_DIR
RUN sed -i.bak "s#^log_level *=.*#log_level = \"debug\"#" $CONFIG_DIR
RUN sed -i.bak "s#^persistent_peers *=.*#persistent_peers = \"tcp://11e59922aa59989811fdb3bc1e22b85cbbe5a14e@namada-peer.mandragora.io:26656\"#" $CONFIG_DIR
RUN sed -i.bak "s#^laddr = \"tcp://127.0.0.1:26657\"#laddr = \"tcp://0.0.0.0:26657\"#" $CONFIG_DIR
#RUN sed -ie "s#^seeds *=.*#seeds = \"tcp://836a25b5c465352adf17430135888689b9a0f1d6@namada-seed-housefire.mandragora.io:21656\"#" $CONFIG_DIR
#ADD addrbook.json $DATA_DIR/cometbft/config/addrbook.json

# Install control script
ADD deno.json deno.lock deps.js /
RUN deno cache --import-map=/deno.json --lock=/deno.lock deps.js
ADD lib.js services.js status.js rpc_proxy.js control_node.js sync_proxy.js peers.json /
ENTRYPOINT [ "/bin/bash" ]
CMD [ "-c", "/control.js" ]
