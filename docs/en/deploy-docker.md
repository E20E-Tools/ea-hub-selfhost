# Deploying EA-Hub with Docker (one machine)

The simplest way to run EA-Hub, on a laptop to try it out, on an office server for internal use, or on a cloud virtual machine for the internet. A setup wizard asks a few questions and starts everything with one command.

## What runs

| Service | Purpose |
|---|---|
| `db` | PostgreSQL 16. Data is kept in the Docker volume `db-data` |
| `migrate` | Prepares the database and the first admin, then **exits**. That is normal |
| `app` | The EA-Hub web app. Uploads are kept in the volume `storage-data` |
| `caddy` | Front web server, with automatic free HTTPS when you use a domain name |
| `cron` | Daily jobs: newsletter, cleanup, search index |
| `backup` | Daily backup of the database and uploads into `./backups` |

## 1. Requirements

### Hardware

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 cores | 4 cores |
| Memory | 4 GB (2 GB works for a quick try) | 8 GB |
| Disk | 10 GB free | 30 GB+ SSD (backups grow over time) |
| Architecture | x86-64 (amd64) | arm64 works when you build the image yourself |

### Software

| Software | Linux server | Windows 10/11 | macOS |
|---|---|---|---|
| Docker Engine 24+ with **Compose v2** | `curl -fsSL https://get.docker.com \| sh` | [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL 2 backend) | Docker Desktop |
| git (optional) | `sudo apt install git` | [git for Windows](https://git-scm.com/download/win) | `xcode-select --install` |

Check:

```bash
docker version          # Server: Docker Engine 24 or newer
docker compose version  # Docker Compose version v2.x
```

### Network (only for internet access with HTTPS)

- A domain or sub-domain (e.g. `hub.example.com`) with a DNS **A record** pointing to the machine's public IP.
- Ports **80** and **443** open to the internet: `sudo ufw allow 80,443/tcp` on Ubuntu, plus your cloud's firewall or security group.

## 2. Get the code

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
```

Without git: download the ZIP from the repository page (**Code → Download ZIP**) and extract it.

## 3. Run the setup wizard

```bash
./setup.sh                 # Linux / macOS
```

```powershell
.\setup.ps1                # Windows PowerShell
# if blocked: powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

The wizard asks:

| Question | Example | Notes |
|---|---|---|
| Site address | `hub.example.com`, `192.168.1.10`, or empty | With a domain it offers automatic HTTPS |
| Admin e-mail and password | `admin@company.com` | Press Enter to generate a password; it is shown once |
| Postgres password | Enter | Generated (recommended) |
| SMTP | optional | Needed for "forgot password" e-mails |
| OpenAI / Turnstile keys | optional | Each feature turns on only if its key is set |

It writes everything to `.env`, including random `APP_ENCRYPTION_KEY`, `CRON_SECRET` and database passwords. Then it asks **"Start EA-Hub now?"**: answer yes.

The first start downloads or builds the image, which takes 3–10 minutes. If the published image cannot be downloaded, the wizard builds it on your machine automatically.

### Without the wizard

```bash
cp .env.example .env
# edit .env: APP_URL, SITE_ADDRESS, ADMIN_EMAIL, ADMIN_PASSWORD, and four random values:
#   POSTGRES_PASSWORD, APP_DB_PASSWORD, APP_ENCRYPTION_KEY, CRON_SECRET   (openssl rand -hex 32)
docker compose up -d
```

## 4. Check that it runs

```bash
docker compose ps
```

```text
NAME               SERVICE   STATUS
ea-hub-app-1       app       Up 2 minutes (healthy)
ea-hub-backup-1    backup    Up 2 minutes
ea-hub-caddy-1     caddy     Up 2 minutes
ea-hub-cron-1      cron      Up 2 minutes
ea-hub-db-1        db        Up 2 minutes (healthy)
```

`migrate` is not in the list because it has finished, which is expected. See what it did with `docker compose logs migrate`:

```text
[migrate] 91 migrations applied in total
[migrate] admin account created
[migrate] done
```

Then check the health endpoint:

```bash
curl http://localhost/healthz        # {"ok":true,"database":"ok"}
```

## 5. Open the site and sign in

Open the address the wizard printed, e.g. `http://localhost` or `https://hub.example.com`, then go to **`/admin`**:

![Admin sign-in](images/admin-sign-in.jpg)

Sign in with the admin e-mail and password:

![Admin dashboard](images/admin-dashboard.jpg)

Afterwards, change the password under **My account**, then clear `ADMIN_PASSWORD` in `.env`. The account already exists, so the value is no longer needed.

## 6. HTTPS options

| Situation | What to enter in the wizard |
|---|---|
| Public domain, internet access | the domain, answer **yes** to automatic HTTPS (Let's Encrypt via Caddy) |
| Internal network, no domain | the server's IP address; the site runs on HTTP inside the network |
| Internal name with HTTPS | the name, answer **no**; then set `SITE_ADDRESS=https://hub.corp.local` and `APP_URL=https://hub.corp.local` in `.env` and uncomment `tls internal` in `deploy/compose/Caddyfile` |
| Port 80 already in use | enter another HTTP port (e.g. 8080) when asked |

## 7. Day-to-day operations

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| Live app log | `docker compose logs -f app` |
| Update to the newest version | `git pull && docker compose pull && docker compose up -d` (if you build locally, use `docker compose build` instead of `pull`) |
| Backup now | `docker compose exec backup sh /backup/backup.sh now` |
| List backups | `docker compose exec backup sh /backup/backup.sh list` |
| Restore | `docker compose stop app cron` → `docker compose exec backup sh /backup/backup.sh restore <name>` → `docker compose start app cron` |
| Change a setting | edit `.env` (or rerun the wizard, which keeps existing secrets), then `docker compose up -d` |
| Reset the admin password | put the new password in `ADMIN_PASSWORD`, set `ADMIN_RESET_PASSWORD=true`, then run `docker compose up -d --force-recreate migrate app`; set it back to `false` afterwards |
| Stop (keeps all data) | `docker compose down` |
| Delete everything, **including data** | `docker compose down -v` |

Backups are written to `./backups` every day at `BACKUP_HOUR_UTC` (01:00 by default) and kept for `BACKUP_KEEP_DAYS` (14). **Copy that folder and your `.env` off the machine regularly.**

> **Never change** `APP_ENCRYPTION_KEY` or `POSTGRES_PASSWORD` after the first start.

### Rotate secrets

```bash
selfhost/scripts/rotate-secrets.sh all        # or: app-db | postgres | cron | metrics
```

The script writes new random values to `.env` (the old file is kept as `.env.bak-<time>`), changes the database passwords in PostgreSQL, and recreates the containers that use them. Nothing is printed. After rotating `metrics`, copy the new `METRICS_TOKEN` from `.env` into your Prometheus scrape config. `APP_ENCRYPTION_KEY` is never rotated.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `APP_URL is missing — run ./setup.sh` | There is no `.env` yet: run the wizard |
| `migrate` exited with an error | `docker compose logs migrate`. `password authentication failed` means `POSTGRES_PASSWORD` changed after the first start: restore it |
| Site unreachable from other machines | Open the firewall port; check that `curl http://localhost/healthz` works on the server itself |
| No HTTPS certificate | The DNS A record must point to this machine and ports 80/443 must be reachable; see `docker compose logs caddy` |
| `denied` when pulling `ghcr.io/…` | Run `docker login ghcr.io`, or build locally with `docker compose build` |
| Links or images use the wrong address | `APP_URL` must be exactly what users type; fix it, then `docker compose up -d` |

More, with explanations in Arabic: [docs/troubleshooting.md](../troubleshooting.md).
