#!/usr/bin/env bash
# Rotates EA-Hub secrets of a Docker Compose installation without data loss.
#
#   selfhost/scripts/rotate-secrets.sh app-db      the app's database password (eahub_app)
#   selfhost/scripts/rotate-secrets.sh postgres    the PostgreSQL superuser password
#   selfhost/scripts/rotate-secrets.sh cron        the scheduled-jobs secret
#   selfhost/scripts/rotate-secrets.sh metrics     the /metrics token (prints the new one)
#   selfhost/scripts/rotate-secrets.sh all         all of the above
#
# APP_ENCRYPTION_KEY is never rotated: sessions, signed links and saved keys depend on it.
# New values are written to .env (a copy of the old file is kept as .env.bak-<time>).
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo ".env not found: run this from the EA-Hub folder"; exit 1; }
WHAT=${1:?usage: rotate-secrets.sh app-db|postgres|cron|metrics|all}
log() { echo "[rotate] $*"; }

random() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24
  else LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 48; fi
}
set_env() { # key value: replace or append, without printing the value
  if grep -qE "^$1=" .env; then
    awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    echo "$1=$2" >> .env
  fi
}
psql_admin() { docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d "${POSTGRES_DB:-eahub}" -qtAc "$1"; }

cp .env ".env.bak-$(date -u +%Y%m%d%H%M%S)"
chmod 600 .env .env.bak-* 2>/dev/null || true

rotate_app_db() {
  set_env APP_DB_PASSWORD "$(random)"
  # migrate sets eahub_app's password from APP_DB_PASSWORD; then the app reconnects with it.
  BACKUP_BEFORE_MIGRATE=0 docker compose run --rm migrate >/dev/null
  docker compose up -d --force-recreate app cron >/dev/null
  log "app database password rotated"
}
rotate_postgres() {
  local new; new=$(random)
  psql_admin "alter role postgres with password '${new}'"
  set_env POSTGRES_PASSWORD "$new"
  docker compose up -d --force-recreate backup >/dev/null
  log "PostgreSQL superuser password rotated"
}
rotate_cron() {
  set_env CRON_SECRET "$(random)"
  docker compose up -d --force-recreate app cron >/dev/null
  log "scheduled-jobs secret rotated"
}
rotate_metrics() {
  local new; new=$(random)
  set_env METRICS_TOKEN "$new"
  docker compose up -d --force-recreate app >/dev/null
  log "metrics token rotated; update your Prometheus scrape config with the value in .env (METRICS_TOKEN)"
}

case "$WHAT" in
  app-db) rotate_app_db ;;
  postgres) rotate_postgres ;;
  cron) rotate_cron ;;
  metrics) rotate_metrics ;;
  all) rotate_postgres; rotate_app_db; rotate_cron; rotate_metrics ;;
  *) echo "unknown secret: $WHAT"; exit 2 ;;
esac
for i in $(seq 1 30); do
  docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null && break
  sleep 3
done
log "the site is healthy again"
