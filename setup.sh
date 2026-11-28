#!/usr/bin/env bash
# EA-Hub self-host setup — asks a few questions, writes .env (Docker Compose) or
# ea-hub-values.yaml (Helm), and can start everything for you.
# معالج إعداد EA-Hub: يسألك بضعة أسئلة، ويكتب ملف الإعداد، ويشغّل الموقع.
#
#   ./setup.sh            interactive
#   ./setup.sh --helm     write Helm values instead of .env
set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fail() { printf '\033[31mx %s\033[0m\n' "$*"; exit 1; }

random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "${1:-32}"
  else head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

# Existing answers become defaults, and existing secrets are kept: the database was
# created with them, and a new APP_ENCRYPTION_KEY would sign everyone out.
# Read once (.env is rewritten at the end). Plain functions: works on macOS's bash 3.2 too.
ENV_SNAPSHOT=$(cat .env 2>/dev/null || true)
old() { # old KEY [default]
  local v
  v=$(printf '%s\n' "$ENV_SNAPSHOT" | grep -E "^$1=" | tail -n 1 | cut -d= -f2-)
  v="${v#\'}"; v="${v%\'}"; v="${v#\"}"; v="${v%\"}"
  printf '%s' "${v:-${2:-}}"
}

ask() { # ask VAR "question" default
  local __var=$1 __q=$2 __def=${3:-} __ans
  if [ -n "$__def" ]; then read -r -p "  $__q [$__def]: " __ans || true; else read -r -p "  $__q: " __ans || true; fi
  __ans=${__ans:-$__def}
  if [[ "$__ans" == *"'"* ]]; then warn "لا تستخدم علامة ' في القيم. Please avoid the ' character."; ask "$@"; return; fi
  printf -v "$__var" '%s' "$__ans"
}
ask_secret() { # ask_secret VAR "question" (empty allowed)
  local __var=$1 __q=$2 __ans
  read -r -s -p "  $__q: " __ans || true; echo
  if [[ "$__ans" == *"'"* ]]; then warn "لا تستخدم علامة ' في القيم. Please avoid the ' character."; ask_secret "$@"; return; fi
  printf -v "$__var" '%s' "$__ans"
}
yes_no() { # yes_no "question" default(y/n)
  local __ans __def=${2:-y}
  read -r -p "  $1 [$( [ "$__def" = y ] && echo 'Y/n' || echo 'y/N')]: " __ans || true
  __ans=${__ans:-$__def}
  [[ "$__ans" =~ ^[YyنN]$ ]] && [[ ! "$__ans" =~ ^[Nn]$ ]]
}

MODE=compose
[ "${1:-}" = "--helm" ] && MODE=helm

echo
bold "EA-Hub — معالج الإعداد / setup"
info "اضغط Enter لقبول القيمة بين القوسين. Press Enter to accept the value in [brackets]."
echo

if [ "$MODE" = compose ]; then
  command -v docker >/dev/null 2>&1 || fail "Docker غير مثبت. ثبّته أولاً: https://docs.docker.com/get-docker/  (Docker is not installed)"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 غير متوفر. حدّث Docker. (docker compose v2 is required)"
fi

# ---------- 1. address ----------
bold "1) عنوان الموقع / Site address"
info "اكتب اسم النطاق (مثل hub.example.com)، أو عنوان IP، أو اتركه فارغاً للتجربة على هذا الجهاز."
info "Domain (hub.example.com), an IP address, or empty to try it on this computer."
default_host=$(old APP_URL "http://localhost" | sed -E 's#^https?://##; s#:[0-9]+$##')
[ "$default_host" = "localhost" ] && default_host=""
ask HOST "العنوان / address" "$default_host"
HOST=$(printf '%s' "$HOST" | sed -E 's#^https?://##; s#/.*$##')
HTTP_PORT=$(old HTTP_PORT 80)
HTTPS_PORT=$(old HTTPS_PORT 443)
if [ -z "$HOST" ] || [ "$HOST" = localhost ] || [[ "$HOST" =~ ^[0-9.]+$ ]] || [[ "$HOST" != *.* ]]; then
  HOST=${HOST:-localhost}
  ask HTTP_PORT "منفذ HTTP / HTTP port" "$HTTP_PORT"
  SITE_ADDRESS=":80"
  APP_URL="http://$HOST$( [ "$HTTP_PORT" = 80 ] || echo ":$HTTP_PORT")"
else
  info "HTTPS مجاني وتلقائي يتطلب أن يشير النطاق إلى هذا الجهاز وأن يكون المنفذان 80 و443 مفتوحين."
  info "Free automatic HTTPS needs DNS pointing here and ports 80 + 443 open."
  if yes_no "تفعيل HTTPS تلقائياً؟ / Enable automatic HTTPS?" y; then
    SITE_ADDRESS="$HOST"; APP_URL="https://$HOST"; HTTP_PORT=80; HTTPS_PORT=443
  else
    ask HTTP_PORT "منفذ HTTP / HTTP port" "$HTTP_PORT"
    SITE_ADDRESS=":80"; APP_URL="http://$HOST$( [ "$HTTP_PORT" = 80 ] || echo ":$HTTP_PORT")"
  fi
fi
info "→ $APP_URL"
echo

# ---------- 2. admin ----------
bold "2) حساب المدير / Admin account"
while :; do
  ask ADMIN_EMAIL "البريد الإلكتروني للمدير (اسم الدخول) / admin e-mail (sign-in name)" "$(old ADMIN_EMAIL)"
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && break
  warn "بريد غير صالح. Invalid e-mail."
done
PREV_ADMIN_PASSWORD=$(old ADMIN_PASSWORD)
ADMIN_PASSWORD=$PREV_ADMIN_PASSWORD
GENERATED_ADMIN=""
if [ -n "$ADMIN_PASSWORD" ] && ! yes_no "تغيير كلمة مرور المدير المحفوظة؟ / Change the saved admin password?" n; then :; else
  while :; do
    ask_secret ADMIN_PASSWORD "كلمة المرور (10 أحرف على الأقل، Enter = توليد تلقائي) / password (10+ chars, Enter = generate)"
    if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD=$(random_secret 9); GENERATED_ADMIN=1; break; fi
    [ ${#ADMIN_PASSWORD} -ge 10 ] || { warn "قصيرة جداً. Too short."; continue; }
    ask_secret CONFIRM "أعد كتابتها / repeat it"
    [ "$ADMIN_PASSWORD" = "$CONFIRM" ] && break
    warn "غير متطابقتين. They do not match."
  done
fi
echo

# ---------- 3. database ----------
bold "3) قاعدة البيانات / Database"
POSTGRES_PASSWORD=$(old POSTGRES_PASSWORD)
if [ -n "$POSTGRES_PASSWORD" ]; then
  info "كلمة مرور Postgres الحالية محفوظة وستبقى كما هي. Keeping the existing Postgres password."
else
  ask_secret POSTGRES_PASSWORD "كلمة مرور Postgres (Enter = توليد تلقائي، موصى به) / Postgres password (Enter = generate)"
  [ -n "$POSTGRES_PASSWORD" ] || POSTGRES_PASSWORD=$(random_secret 24)
fi
APP_DB_PASSWORD=$(old APP_DB_PASSWORD "$(random_secret 24)")
APP_ENCRYPTION_KEY=$(old APP_ENCRYPTION_KEY "$(random_secret 32)")
CRON_SECRET=$(old CRON_SECRET "$(random_secret 32)")
echo

# ---------- 4. mail ----------
bold "4) البريد (اختياري) / E-mail (optional)"
info "يلزم لاستعادة كلمة المرور والإشعارات. Needed for password reset and notifications."
SMTP_HOST=$(old SMTP_HOST); SMTP_PORT=$(old SMTP_PORT 587); SMTP_USER=$(old SMTP_USER)
SMTP_PASSWORD=$(old SMTP_PASSWORD); SMTP_FROM=$(old SMTP_FROM); SMTP_SECURE=$(old SMTP_SECURE)
if yes_no "إعداد خادم SMTP الآن؟ / Configure SMTP now?" "$( [ -n "$SMTP_HOST" ] && echo y || echo n)"; then
  ask SMTP_HOST "خادم SMTP / SMTP host" "$SMTP_HOST"
  ask SMTP_PORT "المنفذ / port (587 or 465)" "$SMTP_PORT"
  [ "$SMTP_PORT" = 465 ] && SMTP_SECURE=true || SMTP_SECURE=""
  ask SMTP_USER "اسم المستخدم / user" "$SMTP_USER"
  ask_secret NEW_SMTP_PASSWORD "كلمة المرور (Enter = إبقاء الحالية) / password (Enter = keep)"
  [ -n "$NEW_SMTP_PASSWORD" ] && SMTP_PASSWORD=$NEW_SMTP_PASSWORD
  ask SMTP_FROM "المرسل / From" "${SMTP_FROM:-EA-Hub <$SMTP_USER>}"
else
  SMTP_HOST=""
fi
echo

# ---------- 5. optional keys ----------
bold "5) مفاتيح اختيارية / Optional keys"
info "كل ميزة تعمل تلقائياً فقط إذا أدخلت مفتاحها. Each feature turns on only if its key is set."
OPENAI_API_KEY=$(old OPENAI_API_KEY); TURNSTILE_SITE_KEY=$(old TURNSTILE_SITE_KEY); TURNSTILE_SECRET_KEY=$(old TURNSTILE_SECRET_KEY)
ask_secret K "OPENAI_API_KEY — البحث الدلالي / semantic search (Enter = $( [ -n "$OPENAI_API_KEY" ] && echo keep || echo skip))"
[ -n "$K" ] && OPENAI_API_KEY=$K
ask TURNSTILE_SITE_KEY "TURNSTILE_SITE_KEY — حماية من البوتات / bot protection (Enter = $( [ -n "$TURNSTILE_SITE_KEY" ] && echo keep || echo skip))" "$TURNSTILE_SITE_KEY"
if [ -n "$TURNSTILE_SITE_KEY" ]; then
  ask_secret K "TURNSTILE_SECRET_KEY (Enter = keep)"
  [ -n "$K" ] && TURNSTILE_SECRET_KEY=$K
fi
echo

q() { printf "'%s'" "$1"; }

if [ "$MODE" = helm ]; then
  OUT=ea-hub-values.yaml
  umask 077
  cat > "$OUT" <<YAML
# Generated by setup.sh — contains secrets, keep it private. يحتوي أسراراً: احفظه بأمان.
# helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace -f $OUT
appUrl: $(q "$APP_URL")
ingress:
  enabled: true
  host: $(q "$HOST")
  tls: $( [[ "$APP_URL" == https://* ]] && echo true || echo false)
admin:
  email: $(q "$ADMIN_EMAIL")
  password: $(q "$ADMIN_PASSWORD")
secrets:
  postgresPassword: $(q "$POSTGRES_PASSWORD")
  appDbPassword: $(q "$APP_DB_PASSWORD")
  appEncryptionKey: $(q "$APP_ENCRYPTION_KEY")
  cronSecret: $(q "$CRON_SECRET")
smtp:
  host: $(q "$SMTP_HOST")
  port: ${SMTP_PORT:-587}
  secure: $( [ "$SMTP_SECURE" = true ] && echo true || echo false)
  user: $(q "$SMTP_USER")
  password: $(q "$SMTP_PASSWORD")
  from: $(q "$SMTP_FROM")
features:
  openaiApiKey: $(q "$OPENAI_API_KEY")
  turnstileSiteKey: $(q "$TURNSTILE_SITE_KEY")
  turnstileSecretKey: $(q "$TURNSTILE_SECRET_KEY")
YAML
  bold "✓ كُتب $OUT / wrote $OUT"
  info "التثبيت / install:"
  info "  helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace -f $OUT"
  exit 0
fi

umask 077
cat > .env <<ENV
# Generated by setup.sh on $(date -u +%F). Contains secrets — never share or commit it.
# أُنشئ بواسطة setup.sh. يحتوي أسراراً: لا تشاركه ولا ترفعه.
APP_URL=$(q "$APP_URL")
SITE_ADDRESS=$(q "$SITE_ADDRESS")
HTTP_PORT=$HTTP_PORT
HTTPS_PORT=$HTTPS_PORT

ADMIN_EMAIL=$(q "$ADMIN_EMAIL")
ADMIN_PASSWORD=$(q "$ADMIN_PASSWORD")
ADMIN_RESET_PASSWORD=$( [ -n "$PREV_ADMIN_PASSWORD" ] && [ "$PREV_ADMIN_PASSWORD" != "$ADMIN_PASSWORD" ] && echo true || echo false)

POSTGRES_PASSWORD=$(q "$POSTGRES_PASSWORD")
APP_DB_PASSWORD=$(q "$APP_DB_PASSWORD")
APP_ENCRYPTION_KEY=$(q "$APP_ENCRYPTION_KEY")
CRON_SECRET=$(q "$CRON_SECRET")

SMTP_HOST=$(q "$SMTP_HOST")
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=$(q "$SMTP_SECURE")
SMTP_USER=$(q "$SMTP_USER")
SMTP_PASSWORD=$(q "$SMTP_PASSWORD")
SMTP_FROM=$(q "$SMTP_FROM")
RESEND_API_KEY=$(q "$(old RESEND_API_KEY)")

OPENAI_API_KEY=$(q "$OPENAI_API_KEY")
GROQ_API_KEY=$(q "$(old GROQ_API_KEY)")
TURNSTILE_SITE_KEY=$(q "$TURNSTILE_SITE_KEY")
TURNSTILE_SECRET_KEY=$(q "$TURNSTILE_SECRET_KEY")

EA_HUB_IMAGE=$(q "$(old EA_HUB_IMAGE ghcr.io/e20e-tools/ea-hub-selfhost:latest)")
WITH_LOCAL_MODEL=$(old WITH_LOCAL_MODEL 1)
BACKUP_KEEP_DAYS=$(old BACKUP_KEEP_DAYS 14)
BACKUP_HOUR_UTC=$(old BACKUP_HOUR_UTC 1)
ENV
chmod 600 .env
bold "✓ كُتب ملف .env / wrote .env"
if [ -n "$GENERATED_ADMIN" ]; then
  warn "كلمة مرور المدير المولّدة (احفظها الآن، لن تُعرض مرة أخرى): / generated admin password (save it now):"
  printf '    %s\n' "$ADMIN_PASSWORD"
fi
echo

if yes_no "تشغيل EA-Hub الآن؟ / Start EA-Hub now?" y; then
  info "تنزيل الصور أو بناؤها (قد يستغرق دقائق في أول مرة)… Getting images (first time takes a few minutes)…"
  IMAGE=$(old EA_HUB_IMAGE ghcr.io/e20e-tools/ea-hub-selfhost:latest)
  if ! docker pull "$IMAGE"; then
    info "لا يمكن تنزيل صورة التطبيق، سيتم بناؤها محلياً. Building the app image locally…"
    docker compose build
  fi
  docker compose up -d
  info "انتظار جاهزية الموقع… waiting for the site…"
  for _ in $(seq 1 90); do
    if docker compose ps app --format '{{.Health}}' 2>/dev/null | grep -q healthy; then break; fi
    sleep 4
  done
  echo
  bold "✓ EA-Hub يعمل / is running: $APP_URL"
  info "لوحة الإدارة / admin: $APP_URL/admin  ($ADMIN_EMAIL)"
  info "السجلات / logs: docker compose logs -f app"
else
  info "للتشغيل لاحقاً / to start later:  docker compose up -d"
fi
