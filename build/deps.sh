#!/bin/sh
apt update
apt install -y \
  vim jq \
  curl wget unzip \
  procps simpleproxy \
  less iputils-ping iproute2 tcpdump strace netcat-traditional
