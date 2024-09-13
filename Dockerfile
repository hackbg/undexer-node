FROM ghcr.io/anoma/namada:v0.43.0 AS namada

USER root
RUN apt update && apt install -y vim curl wget

USER namada
ENV NAMADA_NETWORK_CONFIGS_SERVER="https://testnet.knowable.run/configs"
RUN namadac utils join-network --chain-id housefire-head.a03c8e8948ed20b --wasm-dir $HOME/.local/share/namada/housefire-head.a03c8e8948ed20b/wasm

RUN sed -i 's#persistent_peers = ".*"#persistent_peers = "tcp://d6691dc866be3de0be931d2018e8fdc6a564de20@localhost:26666"#' $HOME/.local/share/namada/housefire-head.a03c8e8948ed20b/config.toml

CMD ["node","ledger","run"]
