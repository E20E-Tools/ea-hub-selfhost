#!/usr/bin/env bash
# Upgrades the Docker Compose PostgreSQL to a new MAJOR version (e.g. 16 -> 17) by dump and
# restore. The old data volume is kept untouched, so you can always go back.
#
#   selfhost/scripts/pg-major-upgrade.sh 17          asks for confirmation
#   selfhost/scripts/pg-major-upgrade.sh 17 --yes    no questions
#
# Steps: backup -> stop the app -> keep the old volume (renamed copy) -> start the new
# PostgreSQL on an empty volume -> prepare roles/schemas (migrate) -> restore -> start all.
# Rollback is printed at the end.
set -euo pipefail
cd "$(dirname "$0")/../.."

NEW=${1:?usage: selfhost/scripts/pg-major-upgrade.sh <new-major> [--yes]   e.g. 17}
[[ "$NEW" =~ ^[0-9]+$ ]] || { echo "the new version must be a major number, e.g. 17"; exit 2; }
YES=${2:-}
PROJECT=ea-hub
VOLUME="${PROJECT}_db-data"
NEW_IMAGE="postgres:${NEW}-alpine"
current_image() { grep -E '^POSTGRES_IMAGE=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
OLD_IMAGE=$(current_image); OLD_IMAGE=${OLD_IMAGE:-postgres:16-alpine}
OLD=$(echo "$OLD_IMAGE" | sed -E 's/^postgres:([0-9]+).*/\1/')
log() { echo "[pg-upgrade] $*"; }

[ -f .env ] || { echo ".env not found: run this from the EA-Hub folder after setup"; exit 1; }
if [ "$NEW" -le "$OLD" ]; then echo "PostgreSQL $OLD is already >= $NEW"; exit 1; fi
SAVED="${VOLUME}-pg${OLD}"
if docker volume inspect "$SAVED" >/dev/null 2>&1; then
  echo "a saved volume $SAVED already exists (from an earlier attempt); remove or rename it first"; exit 1
fi

log "PostgreSQL $OLD ($OLD_IMAGE) -> $NEW ($NEW_IMAGE)"
log "The site is offline for a few minutes. The old data stays in volume $SAVED."
if [ "$YES" != "--yes" ]; then
  read -r -p "Continue? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "cancelled"; exit 1; }
fi

log "1/7 backup"
docker compose up -d db backup >/dev/null
docker compose exec -T backup sh /backup/backup.sh now
NAME=$(docker compose exec -T backup sh /backup/backup.sh list | grep -E '^20' | tail -1 | tr -d '\r')
[ -n "$NAME" ] || { echo "no backup found"; exit 1; }
log "    backup: $NAME"

log "2/7 stop the app"
docker compose stop app cron caddy migrate backup >/dev/null 2>&1 || true
docker compose stop db >/dev/null

log "3/7 keep the old data in $SAVED"
docker volume create "$SAVED" >/dev/null
docker run --rm -v "$VOLUME":/from:ro -v "$SAVED":/to "$OLD_IMAGE" sh -c 'cp -a /from/. /to/'

log "4/7 empty volume for PostgreSQL $NEW"
docker compose rm -f -s db >/dev/null
docker volume rm "$VOLUME" >/dev/null

log "5/7 start PostgreSQL $NEW"
if grep -qE '^POSTGRES_IMAGE=' .env; then
  sed -i.bak -E "s|^POSTGRES_IMAGE=.*|POSTGRES_IMAGE=${NEW_IMAGE}|" .env && rm -f .env.bak
else
  echo "POSTGRES_IMAGE=${NEW_IMAGE}" >> .env
fi
docker compose up -d db >/dev/null
for i in $(seq 1 60); do
  docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done

log "6/7 prepare roles and schemas, then restore $NAME"
BACKUP_BEFORE_MIGRATE=0 docker compose run --rm migrate >/dev/null
docker compose up -d --no-deps backup >/dev/null
docker compose exec -T backup sh /backup/backup.sh restore "$NAME"
# Migrations again: a no-op unless the backup predates the current version.
BACKUP_BEFORE_MIGRATE=0 docker compose run --rm migrate >/dev/null

log "7/7 start everything"
docker compose up -d
log "done: $(docker compose exec -T db psql -U postgres -tAc 'select version()' | cut -c1-40)"
cat <<EOF

Rollback (only if something is wrong):
  docker compose down
  docker volume rm ${VOLUME}
  docker volume create ${VOLUME}
  docker run --rm -v ${SAVED}:/from:ro -v ${VOLUME}:/to ${OLD_IMAGE} sh -c 'cp -a /from/. /to/'
  set POSTGRES_IMAGE=${OLD_IMAGE} in .env, then: docker compose up -d

When everything works, free the space with:  docker volume rm ${SAVED}
EOF
