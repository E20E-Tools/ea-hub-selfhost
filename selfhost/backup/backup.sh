#!/bin/sh
# EA-Hub backups (runs inside the postgres:16 image; PG* variables come from compose/Helm).
#
#   backup.sh loop              daily backup at BACKUP_HOUR_UTC, keeps BACKUP_KEEP_DAYS days
#   backup.sh now               one backup right now
#   backup.sh list              list backups
#   backup.sh restore <name>    restore database (+ uploads if present) from /backups/<name>
#
# A backup is a folder /backups/<YYYY-MM-DD_HHMM>/ with:
#   database.dump   pg_dump custom format (pg_restore can read it)
#   storage.tar.gz  uploaded files (when /data/storage is mounted)
set -eu

BACKUPS=${BACKUP_DIR:-/backups}
STORAGE=${STORAGE_DIR:-/data/storage}
KEEP=${BACKUP_KEEP_DAYS:-14}
HOUR=${BACKUP_HOUR_UTC:-1}

log() { echo "[backup] $(date -u +%FT%TZ) $*"; }

backup_now() {
  name=$(date -u +%Y-%m-%d_%H%M)
  dir="$BACKUPS/$name"
  mkdir -p "$dir.partial"
  pg_dump --format=custom --no-owner --file="$dir.partial/database.dump"
  if [ -d "$STORAGE" ]; then
    tar -czf "$dir.partial/storage.tar.gz" -C "$STORAGE" .
  fi
  rm -rf "$dir"
  mv "$dir.partial" "$dir"
  log "saved $name ($(du -sh "$dir" | cut -f1))"
  # Keep the newest backups only.
  find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP" -exec rm -rf {} + || true
}

case "${1:-now}" in
  now)
    backup_now
    ;;
  list)
    ls -1 "$BACKUPS" | grep -v partial || echo "(no backups yet)"
    ;;
  restore)
    name=${2:?usage: backup.sh restore <backup-folder-name>}
    dir="$BACKUPS/$name"
    if [ ! -f "$dir/database.dump" ] && [ -f "$dir/database.dump.enc" ]; then
      echo "backup $name is encrypted: decrypt it first (docs/backup.md, backup-crypt.mjs decrypt-dir)"; exit 1
    fi
    [ -f "$dir/database.dump" ] || { echo "no such backup: $dir"; exit 1; }
    log "restoring database from $name …"
    # --clean replaces existing objects; roles and the Supabase-compatible schemas are
    # recreated by the migrate step, so run `migrate` first on a brand-new server.
    pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "$dir/database.dump" || \
      log "pg_restore reported warnings (usually harmless 'does not exist' notices)"
    if [ -f "$dir/storage.tar.gz" ]; then
      if [ -w "$STORAGE" ]; then
        log "restoring uploads …"
        find "$STORAGE" -mindepth 1 -delete
        tar -xzf "$dir/storage.tar.gz" -C "$STORAGE"
      else
        log "uploads volume is read-only here; skipped (see docs/backup.md)"
      fi
    fi
    log "restore finished"
    ;;
  loop)
    log "daily backups at ${HOUR}:00 UTC, keeping ${KEEP} days, into $BACKUPS"
    last=""
    while true; do
      today=$(date -u +%F)
      if [ "$(date -u +%H | sed 's/^0//')" = "$HOUR" ] && [ "$last" != "$today" ]; then
        backup_now || log "backup failed"
        last=$today
      fi
      sleep 60
    done
    ;;
  *)
    echo "usage: backup.sh loop|now|list|restore <name>"
    exit 2
    ;;
esac
