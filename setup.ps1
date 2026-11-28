# EA-Hub self-host setup for Windows (PowerShell 5.1+).
# معالج إعداد EA-Hub على ويندوز: يسألك بضعة أسئلة، ويكتب ملف الإعداد، ويشغّل الموقع.
#
#   .\setup.ps1          Docker Compose (.env)
#   .\setup.ps1 -Helm    Helm values (ea-hub-values.yaml)
#
# If Windows blocks the script:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
param([switch]$Helm)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Say([string]$t) { Write-Host "  $t" }
function Title([string]$t) { Write-Host ""; Write-Host $t -ForegroundColor Cyan }
function Warn([string]$t) { Write-Host "! $t" -ForegroundColor Yellow }

function New-Secret([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Existing answers become defaults; existing secrets are kept (the database uses them).
$old = @{}
if (Test-Path .env) {
  foreach ($line in Get-Content .env -Encoding UTF8) {
    if ($line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
      $v = $Matches[2].Trim()
      if ($v.Length -ge 2 -and (($v[0] -eq "'" -and $v[-1] -eq "'") -or ($v[0] -eq '"' -and $v[-1] -eq '"'))) { $v = $v.Substring(1, $v.Length - 2) }
      $old[$Matches[1]] = $v
    }
  }
}
function Old([string]$k, [string]$d = '') { if ($old.ContainsKey($k) -and $old[$k]) { return $old[$k] } else { return $d } }

function Ask([string]$q, [string]$def = '') {
  while ($true) {
    $p = if ($def) { "  $q [$def]" } else { "  $q" }
    $a = Read-Host $p
    if (-not $a) { $a = $def }
    if ($a -notmatch "'") { return $a }
    Warn "لا تستخدم علامة ' في القيم. Please avoid the ' character."
  }
}
function Ask-Secret([string]$q) {
  while ($true) {
    $s = Read-Host "  $q" -AsSecureString
    $a = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
    if ($a -notmatch "'") { return $a }
    Warn "لا تستخدم علامة ' في القيم. Please avoid the ' character."
  }
}
function Yes([string]$q, [bool]$def = $true) {
  $hint = if ($def) { 'Y/n' } else { 'y/N' }
  $a = Read-Host "  $q [$hint]"
  if (-not $a) { return $def }
  return ($a -match '^[Yyن]')
}
function Q([string]$v) { return "'" + $v + "'" }

Write-Host ""
Write-Host "EA-Hub — معالج الإعداد / setup" -ForegroundColor Green
Say "اضغط Enter لقبول القيمة بين القوسين. Press Enter to accept the value in [brackets]."

if (-not $Helm) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Warn "Docker غير مثبت. ثبّت Docker Desktop أولاً: https://docs.docker.com/desktop/setup/install/windows-install/"
    exit 1
  }
  docker compose version *> $null
  if ($LASTEXITCODE -ne 0) { Warn "Docker Compose v2 غير متوفر. حدّث Docker Desktop."; exit 1 }
}

# ---------- 1. address ----------
Title "1) عنوان الموقع / Site address"
Say "اكتب اسم النطاق (مثل hub.example.com)، أو عنوان IP، أو اتركه فارغاً للتجربة على هذا الجهاز."
Say "Domain (hub.example.com), an IP address, or empty to try it on this computer."
$defHost = (Old 'APP_URL' 'http://localhost') -replace '^https?://', '' -replace ':\d+$', ''
if ($defHost -eq 'localhost') { $defHost = '' }
$hostName = (Ask "العنوان / address" $defHost) -replace '^https?://', '' -replace '/.*$', ''
$httpPort = Old 'HTTP_PORT' '80'
$httpsPort = Old 'HTTPS_PORT' '443'
if (-not $hostName -or $hostName -eq 'localhost' -or $hostName -match '^[0-9.]+$' -or $hostName -notmatch '\.') {
  if (-not $hostName) { $hostName = 'localhost' }
  $httpPort = Ask "منفذ HTTP / HTTP port" $httpPort
  $siteAddress = ':80'
  $appUrl = "http://$hostName" + $(if ($httpPort -ne '80') { ":$httpPort" } else { '' })
} else {
  Say "HTTPS مجاني وتلقائي يتطلب أن يشير النطاق إلى هذا الجهاز وأن يكون المنفذان 80 و443 مفتوحين."
  if (Yes "تفعيل HTTPS تلقائياً؟ / Enable automatic HTTPS?" $true) {
    $siteAddress = $hostName; $appUrl = "https://$hostName"; $httpPort = '80'; $httpsPort = '443'
  } else {
    $httpPort = Ask "منفذ HTTP / HTTP port" $httpPort
    $siteAddress = ':80'
    $appUrl = "http://$hostName" + $(if ($httpPort -ne '80') { ":$httpPort" } else { '' })
  }
}
Say "→ $appUrl"

# ---------- 2. admin ----------
Title "2) حساب المدير / Admin account"
do {
  $adminEmail = Ask "البريد الإلكتروني للمدير (اسم الدخول) / admin e-mail" (Old 'ADMIN_EMAIL')
  $ok = $adminEmail -match '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  if (-not $ok) { Warn "بريد غير صالح. Invalid e-mail." }
} until ($ok)
$adminPassword = Old 'ADMIN_PASSWORD'
$generatedAdmin = $false
if (-not $adminPassword -or (Yes "تغيير كلمة مرور المدير المحفوظة؟ / Change the saved admin password?" $false)) {
  while ($true) {
    $adminPassword = Ask-Secret "كلمة المرور (10 أحرف على الأقل، Enter = توليد تلقائي) / password (10+ chars, Enter = generate)"
    if (-not $adminPassword) { $adminPassword = New-Secret 9; $generatedAdmin = $true; break }
    if ($adminPassword.Length -lt 10) { Warn "قصيرة جداً. Too short."; continue }
    $confirm = Ask-Secret "أعد كتابتها / repeat it"
    if ($confirm -eq $adminPassword) { break }
    Warn "غير متطابقتين. They do not match."
  }
}

# ---------- 3. database ----------
Title "3) قاعدة البيانات / Database"
$pgPassword = Old 'POSTGRES_PASSWORD'
if ($pgPassword) {
  Say "كلمة مرور Postgres الحالية محفوظة وستبقى كما هي. Keeping the existing Postgres password."
} else {
  $pgPassword = Ask-Secret "كلمة مرور Postgres (Enter = توليد تلقائي، موصى به) / Postgres password (Enter = generate)"
  if (-not $pgPassword) { $pgPassword = New-Secret 24 }
}
$appDbPassword = Old 'APP_DB_PASSWORD' (New-Secret 24)
$encKey = Old 'APP_ENCRYPTION_KEY' (New-Secret 32)
$cronSecret = Old 'CRON_SECRET' (New-Secret 32)

# ---------- 4. mail ----------
Title "4) البريد (اختياري) / E-mail (optional)"
Say "يلزم لاستعادة كلمة المرور والإشعارات. Needed for password reset and notifications."
$smtpHost = Old 'SMTP_HOST'; $smtpPort = Old 'SMTP_PORT' '587'; $smtpUser = Old 'SMTP_USER'
$smtpPassword = Old 'SMTP_PASSWORD'; $smtpFrom = Old 'SMTP_FROM'; $smtpSecure = ''
if (Yes "إعداد خادم SMTP الآن؟ / Configure SMTP now?" ([bool]$smtpHost)) {
  $smtpHost = Ask "خادم SMTP / SMTP host" $smtpHost
  $smtpPort = Ask "المنفذ / port (587 or 465)" $smtpPort
  if ($smtpPort -eq '465') { $smtpSecure = 'true' }
  $smtpUser = Ask "اسم المستخدم / user" $smtpUser
  $p = Ask-Secret "كلمة المرور (Enter = إبقاء الحالية) / password (Enter = keep)"
  if ($p) { $smtpPassword = $p }
  $defFrom = if ($smtpFrom) { $smtpFrom } else { "EA-Hub <$smtpUser>" }
  $smtpFrom = Ask "المرسل / From" $defFrom
} else { $smtpHost = '' }

# ---------- 5. optional keys ----------
Title "5) مفاتيح اختيارية / Optional keys"
Say "كل ميزة تعمل تلقائياً فقط إذا أدخلت مفتاحها. Each feature turns on only if its key is set."
$openai = Old 'OPENAI_API_KEY'; $tsSite = Old 'TURNSTILE_SITE_KEY'; $tsSecret = Old 'TURNSTILE_SECRET_KEY'
$k = Ask-Secret "OPENAI_API_KEY — البحث الدلالي / semantic search (Enter = keep/skip)"
if ($k) { $openai = $k }
$tsSite = Ask "TURNSTILE_SITE_KEY — حماية من البوتات / bot protection (Enter = keep/skip)" $tsSite
if ($tsSite) { $k = Ask-Secret "TURNSTILE_SECRET_KEY (Enter = keep)"; if ($k) { $tsSecret = $k } }

$utf8 = New-Object System.Text.UTF8Encoding $false

if ($Helm) {
  $tls = if ($appUrl.StartsWith('https://')) { 'true' } else { 'false' }
  $secure = if ($smtpSecure -eq 'true') { 'true' } else { 'false' }
  $yaml = @"
# Generated by setup.ps1 — contains secrets, keep it private. يحتوي أسراراً: احفظه بأمان.
# helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace -f ea-hub-values.yaml
appUrl: $(Q $appUrl)
ingress:
  enabled: true
  host: $(Q $hostName)
  tls: $tls
admin:
  email: $(Q $adminEmail)
  password: $(Q $adminPassword)
secrets:
  postgresPassword: $(Q $pgPassword)
  appDbPassword: $(Q $appDbPassword)
  appEncryptionKey: $(Q $encKey)
  cronSecret: $(Q $cronSecret)
smtp:
  host: $(Q $smtpHost)
  port: $smtpPort
  secure: $secure
  user: $(Q $smtpUser)
  password: $(Q $smtpPassword)
  from: $(Q $smtpFrom)
features:
  openaiApiKey: $(Q $openai)
  turnstileSiteKey: $(Q $tsSite)
  turnstileSecretKey: $(Q $tsSecret)
"@
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'ea-hub-values.yaml'), $yaml, $utf8)
  Write-Host "✓ كُتب ea-hub-values.yaml / wrote ea-hub-values.yaml" -ForegroundColor Green
  Say "helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace -f ea-hub-values.yaml"
  exit 0
}

$reset = if ((Old 'ADMIN_PASSWORD') -and (Old 'ADMIN_PASSWORD') -ne $adminPassword) { 'true' } else { 'false' }
$image = Old 'EA_HUB_IMAGE' 'ghcr.io/e20e-tools/ea-hub-selfhost:latest'
$envText = @"
# Generated by setup.ps1 on $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')). Contains secrets — never share or commit it.
# أُنشئ بواسطة setup.ps1. يحتوي أسراراً: لا تشاركه ولا ترفعه.
APP_URL=$(Q $appUrl)
SITE_ADDRESS=$(Q $siteAddress)
HTTP_PORT=$httpPort
HTTPS_PORT=$httpsPort

ADMIN_EMAIL=$(Q $adminEmail)
ADMIN_PASSWORD=$(Q $adminPassword)
ADMIN_RESET_PASSWORD=$reset

POSTGRES_PASSWORD=$(Q $pgPassword)
APP_DB_PASSWORD=$(Q $appDbPassword)
APP_ENCRYPTION_KEY=$(Q $encKey)
CRON_SECRET=$(Q $cronSecret)

SMTP_HOST=$(Q $smtpHost)
SMTP_PORT=$smtpPort
SMTP_SECURE=$(Q $smtpSecure)
SMTP_USER=$(Q $smtpUser)
SMTP_PASSWORD=$(Q $smtpPassword)
SMTP_FROM=$(Q $smtpFrom)
RESEND_API_KEY=$(Q (Old 'RESEND_API_KEY'))

OPENAI_API_KEY=$(Q $openai)
GROQ_API_KEY=$(Q (Old 'GROQ_API_KEY'))
TURNSTILE_SITE_KEY=$(Q $tsSite)
TURNSTILE_SECRET_KEY=$(Q $tsSecret)

EA_HUB_IMAGE=$(Q $image)
WITH_LOCAL_MODEL=$(Old 'WITH_LOCAL_MODEL' '1')
BACKUP_KEEP_DAYS=$(Old 'BACKUP_KEEP_DAYS' '14')
BACKUP_HOUR_UTC=$(Old 'BACKUP_HOUR_UTC' '1')
"@
[IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $envText, $utf8)
Write-Host "✓ كُتب ملف .env / wrote .env" -ForegroundColor Green
if ($generatedAdmin) {
  Warn "كلمة مرور المدير المولّدة (احفظها الآن، لن تُعرض مرة أخرى): / generated admin password (save it now):"
  Write-Host "    $adminPassword"
}

if (Yes "تشغيل EA-Hub الآن؟ / Start EA-Hub now?" $true) {
  Say "تنزيل الصور أو بناؤها (قد يستغرق دقائق في أول مرة)… Getting images (first time takes a few minutes)…"
  docker image inspect $image *> $null
  $haveLocal = ($LASTEXITCODE -eq 0)
  docker pull $image
  if ($LASTEXITCODE -ne 0 -and $haveLocal) {
    Say "استخدام الصورة الموجودة محلياً (تثبيت دون إنترنت). Using the local image (offline install)."
  } elseif ($LASTEXITCODE -ne 0) {
    Say "لا يمكن تنزيل صورة التطبيق، سيتم بناؤها محلياً. Building the app image locally…"
    docker compose build
    if ($LASTEXITCODE -ne 0) { Warn "فشل البناء. Build failed."; exit 1 }
  }
  docker compose up -d
  if ($LASTEXITCODE -ne 0) { Warn "فشل التشغيل. راجع: docker compose logs"; exit 1 }
  Say "انتظار جاهزية الموقع… waiting for the site…"
  for ($i = 0; $i -lt 90; $i++) {
    $h = docker compose ps app --format '{{.Health}}' 2>$null
    if ($h -match 'healthy') { break }
    Start-Sleep -Seconds 4
  }
  Write-Host ""
  Write-Host "✓ EA-Hub يعمل / is running: $appUrl" -ForegroundColor Green
  Say "لوحة الإدارة / admin: $appUrl/admin  ($adminEmail)"
  Say "السجلات / logs: docker compose logs -f app"
} else {
  Say "للتشغيل لاحقاً / to start later:  docker compose up -d"
}
