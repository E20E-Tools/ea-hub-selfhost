#!/usr/bin/env bash
# Imports the images of an EA-Hub offline bundle.
#   ./load.sh                       load into the local Docker (then: docker compose up -d)
#   ./load.sh registry.internal:5000/ea-hub
#                                   also re-tag and push every image to an internal registry
#                                   (for Kubernetes/OpenShift; see README.md for the Helm values)
set -euo pipefail
cd "$(dirname "$0")"
REGISTRY=${1:-}
sha256sum -c ../"$(basename "$PWD")".tar.gz.sha256 2>/dev/null || true
echo "[load] loading images (a few minutes)"
gunzip -c images/images.tar.gz | docker load
if [ -n "$REGISTRY" ]; then
  while read -r img; do
    [ -n "$img" ] || continue
    target="$REGISTRY/${img##*/}"
    echo "[load] $img -> $target"
    docker tag "$img" "$target"
    docker push "$target"
  done < images/list.txt
fi
echo "[load] done. Next: cp .env.example .env (or ./setup.sh), then docker compose up -d"
