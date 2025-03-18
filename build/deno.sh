#!/bin/sh
set -e
cd /tmp
wget https://github.com/denoland/deno/releases/download/v2.2.4/deno-x86_64-unknown-linux-gnu.zip
unzip deno-x86_64-unknown-linux-gnu.zip
mv deno /usr/local/bin
rm deno-x86_64-unknown-linux-gnu.zip
