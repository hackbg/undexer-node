#!/bin/sh
namadac-1.0.0 utils join-network --chain-id "$CHAIN_ID" --wasm-dir "$WASM_DIR"
sed -i.bak "s#^log_level *=.*#log_level = \"debug\"#" "$CONFIG_DIR"
sed -i.bak "s#^laddr = \"tcp://127.0.0.1:26657\"#laddr = \"tcp://0.0.0.0:26657\"#" "$CONFIG_DIR"
sed -i.bak "s#^persistent_peers_max_dial_period *=.*#persistent_peers_max_dial_period = \"5000ms\"#" "$CONFIG_DIR"
sed -i.bak "s#^handshake_timeout *=.*#handshake_timeout = \"60000ms\"#" "$CONFIG_DIR"
sed -i.bak "s#^dial_timeout *=.*#dial_timeout = \"10000ms\"#" "$CONFIG_DIR"
echo "Configuring persistent_peers: $PEERS"
sed -i.bak "s#^persistent_peers *=.*#persistent_peers = \"$PEERS\"#" $CONFIG_DIR
#?RUN sed -ie "s#^seeds *=.*#seeds = \"tcp://836a25b5c465352adf17430135888689b9a0f1d6@namada-seed-housefire.mandragora.io:21656\"#" $CONFIG_DIR
#?ADD addrbook.json $DATA_DIR/cometbft/config/addrbook.json
