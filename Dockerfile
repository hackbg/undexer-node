# Install all versions of Namada across hard forks:
FROM ghcr.io/anoma/namada:v1.0.0 AS namada-1.0.0
FROM ghcr.io/anoma/namada:v1.1.2 AS namada-1.1.2
USER root
RUN mv /usr/local/bin/namada   /usr/local/bin/namada-1.1.2 \
 && mv /usr/local/bin/namadac /usr/local/bin/namadac-1.1.2 \
 && mv /usr/local/bin/namadan /usr/local/bin/namadan-1.1.2 \
 && mv /usr/local/bin/namadaw /usr/local/bin/namadaw-1.1.2
COPY --from=namada-1.0.0 /usr/local/bin/namada   /usr/local/bin/namada-1.0.0
COPY --from=namada-1.0.0 /usr/local/bin/namadac /usr/local/bin/namadac-1.0.0
COPY --from=namada-1.0.0 /usr/local/bin/namadan /usr/local/bin/namadan-1.0.0
COPY --from=namada-1.0.0 /usr/local/bin/namadaw /usr/local/bin/namadaw-1.0.0

# Create and enter service root directory (where our sources will be installed)
RUN mkdir -p /srv
WORKDIR /srv

# Install OS packages
ADD build/deps.sh .
RUN /srv/deps.sh && rm /srv/deps.sh

# Install Deno
ADD build/deno.sh .
RUN /srv/deno.sh && rm /srv/deno.sh

# Configure node
USER namada
ARG PEERS
ENV PEERS=${PEERS}
ENV NAMADA_NETWORK_CONFIGS_SERVER="https://github.com/anoma/namada-mainnet-genesis/releases/download/mainnet-genesis"
ENV CHAIN_ID="namada.5f5de2dd1b88cba30586420"
ENV DATA_DIR="/home/namada/.local/share/namada/$CHAIN_ID"
ENV WASM_DIR="$DATA_DIR/wasm"
ENV CONFIG_DIR="$DATA_DIR/config.toml"
ADD build/init.sh .
RUN /srv/init.sh
USER 0
RUN rm /srv/init.sh
USER namada

# Install control script
ADD deno.json deno.lock deps.js /
RUN deno cache --import-map=/deno.json --lock=/deno.lock deps.js
ADD src/* .
ENTRYPOINT [ "/bin/bash" ]
CMD [ "-c", "/srv/control_node.js" ]
