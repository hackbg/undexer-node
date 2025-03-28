#!/bin/sh
set -euxo pipefail
apk add --no-cache buildah fuse-overlayfs netavark iptables
echo "$OCI_PASS" | \
  buildah login -u "$OCI_USER" --password-stdin "https://$OCI_HOST"
echo "$OCI_CACHE_PASS" | \
  buildah login -u "$OCI_CACHE_USER" --password-stdin "https://$OCI_CACHE_HOST"

export DISTRO="$1"
export VERSION="$(date -u +%Y%m%d%H%M%S).0.0-$(echo $DRONE_COMMIT_SHA|head -c8)-$DRONE_BUILD_NUMBER"
export TAG="$(cat BRANCH | tr '/' '_' | tr '\n' ' ')"
export CACHE="$OCI_CACHE_HOST/$OCI_NAME"
export IMAGE="$OCI_HOST/$OCI_NAME:$TAG"
#export IMAGE="$OCI_$OCI_NAME:$VERSION-$DISTRO"

printf "Name: $OCI_NAME\nImage: $IMAGE\n"
export PARAMS="--layers --cache-from=$CACHE --cache-to=$CACHE --network=host --cache-from=$OCI_NAME -f Dockerfile"

buildah build $PARAMS -t "$IMAGE" .
buildah push "$IMAGE"

export BUILD_COLOR_VARIANT="direct"
export VARIANT="$IMAGE-all-$BUILD_COLOR_VARIANT"
export PEERS="$(cd src && deno run --allow-read=peers.json peers.js)"
[[ -z "$PEERS" ]] && echo "No persistent peers could be provided for $BUILD_COLOR_VARIANT" && exit 1
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"

export BUILD_COLOR_VARIANT="green"
export VARIANT="$IMAGE-all-$BUILD_COLOR_VARIANT"
export PEERS="$(cd src && deno run --allow-read=peers.json peers.js)"
[[ -z "$PEERS" ]] && echo "No persistent peers could be provided for $BUILD_COLOR_VARIANT" && exit 1
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"

export BUILD_COLOR_VARIANT="blue"
export VARIANT="$IMAGE-all-$BUILD_COLOR_VARIANT"
export PEERS="$(cd src && deno run --allow-read=peers.json peers.js)"
[[ -z "$PEERS" ]] && echo "No persistent peers could be provided for $BUILD_COLOR_VARIANT" && exit 1
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"
