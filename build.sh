#!/bin/sh
set -ex
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
buildah pull "$IMAGE" || true
export PARAMS="--layers --cache-from=$CACHE --cache-to=$CACHE --network=host --cache-from=$OCI_NAME -f Dockerfile"

buildah build $PARAMS -t "$IMAGE" .
buildah push "$IMAGE"

export VARIANT="$IMAGE-all-direct"
export PEERS="$(docker run -eBUILD_COLOR_VARIANT=direct -v $PWD:/app denoland/deno:1.46.3 run --allow-read=peers.json --allow-env=BUILD_COLOR_VARIANT /app/src/peers.js)"
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"

export VARIANT="$IMAGE-all-green"
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"

export VARIANT="$IMAGE-all-blue"
export PEERS="$(docker run -eBUILD_COLOR_VARIANT=blue -v $PWD:/app denoland/deno:1.46.3 run --allow-read=peers.json --allow-env=BUILD_COLOR_VARIANT /app/src/peers.js)"
echo "Building $VARIANT with persistent peers $PEERS"
buildah build $PARAMS -t "$VARIANT" --build-arg "PEERS=$PEERS" .
buildah push "$VARIANT"
