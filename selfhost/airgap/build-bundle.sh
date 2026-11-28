#!/usr/bin/env bash
# Builds an offline (air-gapped) installation bundle for one CPU architecture:
#   selfhost/airgap/build-bundle.sh <version> <amd64|arm64> [output-dir]
# The bundle (ea-hub-airgap-<version>-<arch>.tar.gz) contains every container image, the Helm
# chart, the Docker Compose files and setup scripts, and load.sh to import the images on a
# machine without internet access (or push them to an internal registry).
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION=${1:?usage: build-bundle.sh <version> <amd64|arm64> [output-dir]}
ARCH=${2:?arch: amd64 or arm64}
OUT=${3:-dist}
NAME="ea-hub-airgap-${VERSION}-${ARCH}"
WORK="$(mktemp -d)/$NAME"
mkdir -p "$WORK/images" "$OUT"

# Every image the compose file and the Helm chart can use (pinned versions).
IMAGES=(
  "ghcr.io/e20e-tools/ea-hub-selfhost:${VERSION}"
  "postgres:16-alpine"
  "postgres:16"
  "caddy:2-alpine"
  "rclone/rclone:1.76.0"
)
for img in "${IMAGES[@]}"; do
  echo "[bundle] pulling $img ($ARCH)"
  docker pull --platform "linux/$ARCH" "$img" >/dev/null
done
echo "[bundle] saving images"
docker save "${IMAGES[@]}" | gzip -1 > "$WORK/images/images.tar.gz"
printf '%s\n' "${IMAGES[@]}" > "$WORK/images/list.txt"

echo "[bundle] chart and files"
helm package deploy/helm/ea-hub --version "$VERSION" --app-version "$VERSION" -d "$WORK" >/dev/null
cp docker-compose.yml .env.example setup.sh setup.ps1 "$WORK/"
mkdir -p "$WORK/deploy" "$WORK/selfhost/scripts"
cp -r deploy/compose "$WORK/deploy/"              # same paths as in the repository
cp -r selfhost/backup "$WORK/selfhost/"
cp selfhost/scripts/pg-major-upgrade.sh selfhost/scripts/rotate-secrets.sh "$WORK/selfhost/scripts/"
cp selfhost/airgap/load.sh selfhost/airgap/README.md "$WORK/"
sed -i "s#^EA_HUB_IMAGE=.*#EA_HUB_IMAGE=ghcr.io/e20e-tools/ea-hub-selfhost:${VERSION}#" "$WORK/.env.example"
echo "$VERSION $ARCH $(date -u +%FT%TZ)" > "$WORK/BUNDLE"

tar -C "$(dirname "$WORK")" -czf "$OUT/$NAME.tar.gz" "$NAME"
(cd "$OUT" && sha256sum "$NAME.tar.gz" > "$NAME.tar.gz.sha256")
echo "[bundle] $OUT/$NAME.tar.gz ($(du -h "$OUT/$NAME.tar.gz" | cut -f1))"
