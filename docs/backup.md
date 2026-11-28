# النسخ الاحتياطي والاستعادة

## ما الذي يُنسخ؟

كل نسخة مجلد باسم التاريخ والوقت (UTC)، مثل `backups/2026-12-01_0100/`، وفيه:

| الملف | المحتوى |
|---|---|
| `database.dump` | قاعدة البيانات كاملة: المحتوى والطلبات والحسابات والإعدادات |
| `storage.tar.gz` | الملفات المرفوعة: الشعارات وصور الأدوات والمرفقات |

> احفظ أيضاً ملف `.env` في مكان آمن خارج الخادم. بدون `APP_ENCRYPTION_KEY` الموجود فيه لا يمكن قراءة المفاتيح المحفوظة المشفرة بعد الاستعادة.

## Docker Compose

النسخ الاحتياطي **تلقائي يومياً** في الساعة `BACKUP_HOUR_UTC` (الافتراضي 01:00 UTC)، ويحتفظ بآخر `BACKUP_KEEP_DAYS` يوماً (الافتراضي 14). النسخ تُحفظ في المجلد `backups/` بجانب المشروع.

| المطلوب | الأمر |
|---|---|
| نسخة الآن | `docker compose exec backup sh /backup/backup.sh now` |
| عرض النسخ | `docker compose exec backup sh /backup/backup.sh list` |

**انسخ المجلد `backups/` دورياً إلى مكان آخر**، مثل قرص خارجي أو تخزين سحابي. النسخة على الخادم نفسه لا تحميك إذا تعطل الخادم.

### الاستعادة على الخادم نفسه

```bash
docker compose stop app cron                              # أوقف الموقع مؤقتاً
docker compose exec backup sh /backup/backup.sh list      # اختر اسم النسخة
docker compose exec backup sh /backup/backup.sh restore 2026-12-01_0100
docker compose start app cron
```

### النقل إلى خادم جديد

1. على الخادم الجديد: ثبّت Docker، ونزّل المشروع، وانسخ إليه ملف `.env` القديم **كما هو** ومجلد `backups/`.
2. جهّز قاعدة فارغة:
   ```bash
   docker compose up -d db
   docker compose run --rm migrate
   ```
3. استعد النسخة:
   ```bash
   docker compose up -d backup
   docker compose exec backup sh /backup/backup.sh restore <اسم-النسخة>
   ```
4. شغّل الباقي:
   ```bash
   docker compose up -d
   ```

## Helm / Kubernetes

يعمل CronJob باسم `ea-hub-backup` يومياً، ويحفظ النسخ على قرص `ea-hub-backups`.

```bash
# نسخة الآن
kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now
# استعادة: أوقف التطبيق، ثم شغّل حاوية استعادة على القرص نفسه
kubectl -n ea-hub scale deploy/ea-hub --replicas=0
kubectl -n ea-hub run restore --rm -it --restart=Never --image=postgres:16-alpine \
  --overrides='{"spec":{"containers":[{"name":"restore","image":"postgres:16-alpine","stdin":true,"tty":true,
  "command":["sh"],"env":[{"name":"PGHOST","value":"ea-hub-postgres"},{"name":"PGUSER","value":"postgres"},
  {"name":"PGDATABASE","value":"eahub"},{"name":"PGPASSWORD","valueFrom":{"secretKeyRef":{"name":"ea-hub","key":"postgres-password"}}}],
  "volumeMounts":[{"name":"b","mountPath":"/backups"},{"name":"s","mountPath":"/backup"}]}],
  "volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"ea-hub-backups"}},{"name":"s","configMap":{"name":"ea-hub-backup"}}]}}'
# داخل الحاوية:  sh /backup/backup.sh list   ثم   sh /backup/backup.sh restore <اسم-النسخة>
kubectl -n ea-hub scale deploy/ea-hub --replicas=1
```

لنسخ ملف النسخة إلى جهازك، استخدم `kubectl cp` من حاوية تربط القرص `ea-hub-backups`.

## تشفير النسخ الاحتياطية

يمكن تشفير كل نسخة احتياطية بمفتاح عام، فلا يقرؤها إلا من يملك المفتاح الخاص، حتى لو تسرّب الخادم أو التخزين الخارجي.

1. **أنشئ زوج مفاتيح مرة واحدة:**
   ```bash
   docker compose run --rm --no-deps migrate node selfhost/scripts/backup-crypt.mjs keygen
   ```
   احفظ `BACKUP_PRIVATE_KEY` خارج الخادم، في مدير كلمات المرور أو في خزنة، لأنه لازم للاستعادة ولا يُستعاد إن ضاع.
2. **فعّل التشفير:**
   - **Docker Compose:** ضع `BACKUP_PUBLIC_KEY=…` في `.env`، وأضف `encrypt` إلى `COMPOSE_PROFILES`، مثل `COMPOSE_PROFILES=offsite,encrypt`، ثم `docker compose up -d`. تشفّر خدمة `backup-crypt` كل نسخة جديدة خلال دقيقة، وتحذف الملفات غير المشفرة. ولا يُنسخ إلى الخارج إلا الملفات المشفرة.
   - **Helm:** اضبط `backup.encryption.publicKey`، فتُضاف خطوة تشفير بعد النسخ وقبل النسخ الخارجي.
3. **للاستعادة:** فك تشفير النسخة أولاً، ثم استعدها كالمعتاد:
   ```bash
   docker compose --profile encrypt run --rm -e BACKUP_PRIVATE_KEY='…' backup-crypt \
     node selfhost/scripts/backup-crypt.mjs decrypt-dir /backups/<اسم-النسخة>
   docker compose exec backup sh /backup/backup.sh restore <اسم-النسخة>
   ```

يستخدم التشفير X25519 وAES-256-GCM، ويكشف أي تعديل على الملف أو اقتطاع منه.

## نسخ احتياطي خارج الخادم (موصى به)

النسخ المحفوظة على الخادم نفسه تضيع إذا ضاع الخادم. لذلك يمكن نسخ كل نسخة تلقائياً إلى تخزين كائنات خارجي، مثل S3 أو MinIO أو Azure Blob أو Google Cloud Storage، باستخدام أداة rclone.

**Docker Compose:** أضف إلى `.env`:

```bash
COMPOSE_PROFILES=offsite
OFFSITE_PATH=my-bucket/ea-hub
OFFSITE_TYPE=s3
OFFSITE_PROVIDER=AWS          # أو Minio، أو Other لأي خدمة متوافقة مع S3
OFFSITE_REGION=eu-central-1
OFFSITE_ENDPOINT=             # فقط لغير AWS، مثل https://minio.example.com
OFFSITE_ACCESS_KEY_ID=...
OFFSITE_SECRET_ACCESS_KEY=...
```

ثم شغّل `docker compose up -d`. تنسخ خدمة `offsite` مجلد `./backups` إلى الحاوية مرة كل ساعة.

**Helm:** فعّل `backup.offsite`. التفاصيل في `values.yaml`، وفي الدليل الإنجليزي `docs/en/deploy-kubernetes.md` (قسم Backup).

لا تُحذف النسخ القديمة من الحاوية الخارجية، فاضبط قاعدة حذف تلقائي (lifecycle) فيها، مثلاً بعد 90 يوماً. للاستعادة، انسخ مجلد النسخة من الحاوية إلى مجلد `backups` بالأمر `rclone copy`، ثم اتبع خطوات الاستعادة أعلاه.
