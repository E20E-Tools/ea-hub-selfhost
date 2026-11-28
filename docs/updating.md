# التحديث

## تحديث موقعك إلى آخر نسخة

### Docker Compose

```bash
cd ea-hub-selfhost
git pull                      # آخر ملفات الإعداد والتوثيق
docker compose pull           # آخر صورة للتطبيق
docker compose up -d          # إعادة التشغيل بالنسخة الجديدة
```

إذا كنت تبني الصورة بنفسك، فاستبدل `docker compose pull` بالأمر `docker compose build`.

تُطبَّق تحديثات قاعدة البيانات تلقائياً عبر خدمة `migrate` قبل أن يبدأ التطبيق. بياناتك وملفاتك تبقى كما هي.

> نصيحة: خذ نسخة احتياطية قبل كل تحديث كبير:
> ```bash
> docker compose exec backup sh /backup/backup.sh now
> ```

### تثبيت نسخة محددة بدلاً من الأحدث دائماً

في `.env` استبدل `latest` برقم الإصدار، مثل `EA_HUB_IMAGE=ghcr.io/e20e-tools/ea-hub-selfhost:1.2.0`، ثم نفّذ `docker compose up -d`.

### Helm

```bash
git pull
helm upgrade ea-hub ./deploy/helm/ea-hub -n ea-hub --reuse-values
```

---

### نسخة احتياطية تلقائية قبل كل ترقية

قبل تطبيق تحديثات قاعدة البيانات تؤخذ نسخة احتياطية تلقائياً، فإن فشلت الترقية تعود إلى ما كنت عليه:

- **Docker Compose:** في كل `docker compose up` تحفظ الخدمة `backup-before-migrate` نسخة في `./backups` قبل خدمة `migrate`. لإيقافها اضبط `BACKUP_BEFORE_MIGRATE=0` في `.env`.
- **Helm:** في كل `helm upgrade` تأخذ مهمة `ea-hub-backup-before-upgrade` نسخة قبل الترقية. لإيقافها اضبط `backup.beforeUpgrade=false`.

**للتراجع عن ترقية فاشلة:**
1. أعد الصورة إلى وسمها السابق (`EA_HUB_IMAGE` في `.env`، أو `helm rollback ea-hub`).
2. استعد آخر نسخة كما في [backup.md](backup.md): `backup.sh list` ثم `backup.sh restore <اسم-النسخة>`.

## لمشرفي هذا المستودع: متابعة المشروع الأصلي

المستودع الأصلي `E20E-Tools/ea-hub-v2` هو المصدر (upstream). سير العمل [`upstream-sync.yml`](../.github/workflows/upstream-sync.yml) يعمل يومياً كالتالي:

1. يجلب `upstream/main`.
2. يدمجه في الفرع `upstream-sync`.
3. يفتح طلب دمج (PR) إلى `main`، أو يحدّث الطلب المفتوح.

لا يُدمج أي شيء تلقائياً. راجع الطلب، وانتظر نجاح CI (الاختبارات وCompose وkind)، ثم ادمجه.

لنشر صورة جديدة على GHCR أنشئ وسماً (tag) برقم الإصدار، مثل `git tag v1.0.0 && git push origin v1.0.0`. النشر يكون مع الوسوم فقط، توفيراً لحصة التخزين المجانية.

### إعداد مرة واحدة: صلاحية قراءة المستودع الأصلي

المستودع الأصلي خاص، ولهذا يحتاج سير العمل token:

1. في GitHub افتح: **Settings ← Developer settings ← Fine-grained tokens ← Generate new token**.
2. اختر المالك `E20E-Tools`، ثم المستودعين `ea-hub-v2` و`ea-hub-selfhost`.
3. الصلاحيات:
   - على `ea-hub-v2`: **Contents: Read**.
   - على `ea-hub-selfhost`: **Contents: Read and write** و**Pull requests: Read and write** و**Workflows: Read and write**.
4. في `ea-hub-selfhost` افتح **Settings ← Secrets and variables ← Actions ← New repository secret**، وسمِّ السر `UPSTREAM_TOKEN` والصق الـ token.
5. جرّب يدوياً: **Actions ← Upstream sync ← Run workflow**.

### إذا ظهر تعارض (conflict)

الملفات الخاصة بهذه النسخة، مثل `README.md` و`.env.example` و`Dockerfile` و`docker-compose.yml`، تُحفظ تلقائياً بنسختنا عبر `.gitattributes`. إذا تعارض ملف آخر، يفتح سير العمل طلباً **مسودّة (draft)** عنوانه `DO NOT MERGE` من الفرع `upstream-sync-conflicts`. **لا تدمج هذا الطلب أبداً**، فدمجه يحذف طبقة الاستضافة الذاتية. بدلاً من ذلك، حُلّ التعارض يدوياً ثم أغلق المسودّة:

```bash
git fetch origin
git checkout -B upstream-sync origin/main
git config merge.ours.driver true
git remote add upstream https://github.com/E20E-Tools/ea-hub-v2.git   # مرة واحدة
git fetch upstream main
git merge upstream/main          # حُلّ التعارضات ثم:
git commit
git push --force origin upstream-sync
gh pr create --head upstream-sync --base main --title "Sync with upstream"   # أو من واجهة GitHub
```

أكثر ما قد يتعارض هو `src/server.ts` و`vite.config.ts` و`package.json`، وفيها سطور قليلة مضافة لهذه النسخة ومعلّمة بكلمة `Self-host`. أبقِ تلك السطور، وخذ الباقي من الأصل.

### متى يجب تعديل طبقة الاستبدال؟

إذا أضاف الأصل استخداماً جديداً لـ Supabase غير مدعوم في [`src/selfhost`](../src/selfhost)، مثل دالة جديدة في `supabase-js`، فستفشل الاختبارات في CI برسالة واضحة. عندها أضف الدعم في `src/selfhost/supabase-js` أو `src/selfhost/server`. التفاصيل في [architecture.md](architecture.md).
