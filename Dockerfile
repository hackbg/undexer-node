FROM ghcr.io/anoma/namada:v0.43.0 AS namada

USER root
RUN apt update \
 && apt install -y vim curl wget unzip 
RUN cd /tmp \
 && wget https://github.com/denoland/deno/releases/download/v1.46.3/deno-x86_64-unknown-linux-gnu.zip \
 && unzip deno-x86_64-unknown-linux-gnu.zip \
 && mv deno /usr/local/bin \
 && rm deno-x86_64-unknown-linux-gnu.zip

USER namada

ENV NAMADA_NETWORK_CONFIGS_SERVER="https://testnet.knowable.run/configs"
ENV CHAIN_ID="housefire-head.a03c8e8948ed20b"
ENV DATA_DIR=/home/namada/.local/share/namada/$CHAIN_ID
ENV WASM_DIR=$DATA_DIR/wasm
ENV CONFIG_DIR=$DATA_DIR/config.toml
RUN namadac utils join-network --chain-id $CHAIN_ID --wasm-dir $WASM_DIR
RUN sed -i 's#persistent_peers = ".*"#persistent_peers = "tcp://d6691dc866be3de0be931d2018e8fdc6a564de20@localhost:26666"#' $CONFIG_DIR
ADD control.js /control.js 
ENTRYPOINT [ "/bin/bash" ]
CMD [ "-c", "/control.js" ]
