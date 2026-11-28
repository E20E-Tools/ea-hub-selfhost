# EA-Hub — نسخة الاستضافة الذاتية

نسخة من منصة **EA-Hub** تعمل على أي خادم تملكه، داخل شبكة مؤسستك أو على الإنترنت، **دون Vercel ودون Supabase**. كل ما تحتاجه هو Docker، أو عنقود Kubernetes إن كان متاحاً لديك.

- **حاويتان أساسيتان:** التطبيق (Node.js) وقاعدة بيانات PostgreSQL 16 الرسمية.
- **ثلاث طرق للتشغيل:** Docker Compose (الأسهل)، أو Helm، أو ملفات Kubernetes جاهزة.
- **معالج إعداد بالعربية** يسألك بضعة أسئلة ويجهّز كل شيء، ويولّد كلمات المرور والمفاتيح السرية تلقائياً.
- **HTTPS مجاني وتلقائي** عبر Caddy عند استخدام اسم نطاق.
- **نسخ احتياطي يومي** للقاعدة والملفات المرفوعة، مع أمر للاستعادة.
- **تحديثات مستمرة** من المشروع الأصلي عبر طلب دمج (PR) يُفتح تلقائياً كل يوم.

> هذا المستودع مشتق من المستودع الأصلي `E20E-Tools/ea-hub-v2`، ولا يغيّر فيه شيئاً.

---

## التشغيل في 3 خطوات (Docker Compose)

**المتطلبات:** جهاز أو خادم عليه [Docker](https://docs.docker.com/get-docker/)، وذاكرة 2 جيجابايت على الأقل، ومساحة 10 جيجابايت.

```bash
# 1) نزّل المشروع
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost

# 2) شغّل معالج الإعداد وأجب عن الأسئلة (ويندوز: .\setup.ps1)
./setup.sh

# 3) لا شيء آخر: المعالج يشغّل الموقع في النهاية ويعرض رابطه
```

بعدها افتح الرابط الذي يظهر لك، وادخل إلى لوحة الإدارة من `/admin` بالبريد وكلمة المرور اللذين أدخلتهما.

الشرح الكامل خطوة بخطوة، ويشمل تثبيت Docker وربط اسم النطاق: **[docs/install-docker.md](docs/install-docker.md)**

### يسألك المعالج عن

| السؤال | مثال | ملاحظة |
|---|---|---|
| عنوان الموقع | `hub.example.com` أو اتركه فارغاً | مع اسم نطاق يُفعَّل HTTPS تلقائياً |
| بريد المدير وكلمة مروره | `admin@company.com` | هذا هو حساب الدخول الأول |
| كلمة مرور قاعدة البيانات | Enter | تُولَّد تلقائياً (موصى به) |
| البريد SMTP | اختياري | لازم لاستعادة كلمة المرور والإشعارات |
| مفاتيح اختيارية | `OPENAI_API_KEY` وTurnstile | كل ميزة تعمل فقط إذا أدخلت مفتاحها |

يولّد المعالج تلقائياً `APP_ENCRYPTION_KEY` و`CRON_SECRET` وكلمات مرور القاعدة، ويحفظ كل شيء في ملف `.env`. لا تشارك هذا الملف مع أحد.

---

## طرق التشغيل الأخرى

| الطريقة | لمن؟ | الدليل |
|---|---|---|
| Docker Compose | خادم واحد، الأسهل للجميع | [docs/install-docker.md](docs/install-docker.md) |
| Helm | من لديه Kubernetes (k3s، أو AKS/EKS/GKE…) | [docs/helm.md](docs/helm.md) |
| ملفات Kubernetes خام | Kubernetes بدون Helm | [docs/kubernetes.md](docs/kubernetes.md) |
| Kubernetes محلي | التجربة على جهازك: Docker Desktop وkind وminikube وk3s | [docs/kubernetes-local.md](docs/kubernetes-local.md) |
| Red Hat OpenShift | المؤسسات التي تعتمد OpenShift أو OKD | [docs/openshift.md](docs/openshift.md) |
| Rancher | العناقيد التي يديرها Rancher، مع تثبيت من كتالوج التطبيقات | [docs/rancher.md](docs/rancher.md) |
| Azure Container Apps | حاويات بلا خوادم على Azure | [docs/azure-container-apps.md](docs/azure-container-apps.md) |
| AWS ECS على Fargate | حاويات بلا خوادم على AWS | [docs/aws-ecs-fargate.md](docs/aws-ecs-fargate.md) |
| Google Cloud Run | حاويات بلا خوادم على Google Cloud | [docs/google-cloud-run.md](docs/google-cloud-run.md) |
| قوالب السحابة بخطوة واحدة | Azure (زر Deploy to Azure) وAWS وGoogle | [docs/cloud-templates.md](docs/cloud-templates.md) |
| عدة بيئات عبر GitOps | Argo CD وRancher Fleet لبيئتي الاختبار والإنتاج | [docs/gitops.md](docs/gitops.md) |
| **English guides** (كل ما سبق بالإنجليزية، مع PDF وWord) | for new teams | [docs/en/README.md](docs/en/README.md) |

## إدارة التشغيل اليومي

- **التحديث إلى نسخة أحدث:** [docs/updating.md](docs/updating.md)
- **النسخ الاحتياطي والاستعادة والنقل إلى خادم آخر:** [docs/backup.md](docs/backup.md)
- **تثبيت دون إنترنت:** مع كل إصدار حزمة فيها كل الصور والـ chart وملفات Compose، انظر [selfhost/airgap](selfhost/airgap/README.md).
- **الدخول الموحد (Entra ID وKeycloak وOkta وGoogle…):** [docs/single-sign-on.md](docs/single-sign-on.md)
- **حل المشكلات الشائعة:** [docs/troubleshooting.md](docs/troubleshooting.md)
- **كيف استُبدل Supabase، وما الذي تغيّر تقنياً:** [docs/architecture.md](docs/architecture.md)

### أوامر سريعة (Docker Compose)

| الأمر | ماذا يفعل |
|---|---|
| `docker compose ps` | حالة الخدمات |
| `docker compose logs -f app` | سجل التطبيق المباشر |
| `docker compose pull && docker compose up -d` | التحديث إلى آخر نسخة |
| `docker compose exec backup sh /backup/backup.sh now` | نسخة احتياطية الآن |
| `docker compose down` | إيقاف الموقع (البيانات تبقى) |

صفحة الصحة: `https://عنوانك/healthz` تعيد `{"ok":true}` حين يعمل التطبيق وقاعدة البيانات.

---

## ما الفرق عن النسخة الأصلية؟

| الأصل (Vercel + Supabase) | هنا |
|---|---|
| Supabase Auth | حسابات وجلسات داخل PostgreSQL نفسها (كلمات المرور مشفّرة بـ scrypt) |
| Supabase Database + PostgREST + RLS | PostgreSQL 16 عادية؛ سياسات RLS نفسها تعمل كما هي |
| Supabase Storage | ملفات على قرص دائم (volume/PVC) بروابط موقّعة مؤقتة |
| Supabase Realtime | تحديث مباشر عبر LISTEN/NOTIFY وServer-Sent Events |
| Vercel Cron | خدمة `cron` في Compose، أو CronJob في Kubernetes |
| Resend فقط للبريد | SMTP مع أي مزود (أو Resend) |

كود التطبيق الأصلي لم يتغير تقريباً. الاستبدال كله في مجلد [`src/selfhost`](src/selfhost)، وهذا ما يجعل متابعة تحديثات الأصل سهلة.

## للمطورين

```bash
bun install
docker run -d --name ea-hub-dev-db -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=eahub postgres:16-alpine
DB_HOST=localhost POSTGRES_PASSWORD=dev APP_DB_PASSWORD=dev-app npm run selfhost:migrate
npx vitest run
```

لاختبارات التكامل مع قاعدة حقيقية اضبط `SELFHOST_TEST_DATABASE_URL`. سير العمل في [`.github/workflows`](.github/workflows) يبني الصورة، ويختبر Compose من الصفر، ويثبّت الـ chart على عنقود kind.
