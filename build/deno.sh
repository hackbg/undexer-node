#!/bin/sh
cd /tmp
wget https://github.com/denoland/deno/releases/download/v2.1.10/deno-x86_64-unknown-linux-gnu.zip
unzip deno-x86_64-unknown-linux-gnu.zip
mv deno /usr/local/bin
rm deno-x86_64-unknown-linux-gnu.zip
