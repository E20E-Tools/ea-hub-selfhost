# التثبيت على Kubernetes باستخدام Helm

استخدم هذا الطريق إذا كان لديك عنقود Kubernetes. إن لم يكن لديك عنقود وتريد التجربة على خادم واحد، فيمكنك تثبيت [k3s](https://k3s.io) بأمر واحد:

```bash
curl -sfL https://get.k3s.io | sh -
```

بعدها ثبّت [Helm](https://helm.sh/docs/intro/install/).

## ماذا يثبّت الـ chart

| المورد | الوظيفة |
|---|---|
| Deployment | التطبيق، مع init container يجهّز القاعدة قبل كل تشغيل (آمن مهما تكرر) |
| Service | وصول داخلي إلى التطبيق على المنفذ 80 |
| Ingress (اختياري) | الوصول من الخارج باسم نطاق، مع TLS عند الطلب |
| Secret | كلمات المرور والمفاتيح، وتُولَّد تلقائياً إن تركتها فارغة |
| PVC | الملفات المرفوعة (`storage`) والنسخ الاحتياطية (`backups`) |
| StatefulSet | PostgreSQL 16 بقرص خاص بها، ويمكن تعطيلها لاستخدام قاعدة خارجية |
| Job (اختياري) | تشغيل التهيئة كـ Helm hook عند التثبيت والترقية |
| CronJob ×4 | النشرة والتنظيف وفهرسة البحث (بدلاً من Vercel Cron)، والنسخ الاحتياطي |

## الطريقة الأسهل: المعالج

```bash
./setup.sh --helm          # ويندوز: .\setup.ps1 -Helm
helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace -f ea-hub-values.yaml
```

يكتب المعالج ملف `ea-hub-values.yaml` وفيه كل الإجابات والأسرار. احفظه في مكان آمن ولا ترفعه إلى أي مستودع.

## من مستودع Helm مباشرة (دون نسخ المستودع)

الـ chart منشور مع كل إصدار، فيكفي هذا الأمر دون نسخ الكود:

```bash
helm install ea-hub oci://ghcr.io/e20e-tools/charts/ea-hub -n ea-hub --create-namespace   --set appUrl=https://hub.example.com --set ingress.enabled=true --set ingress.host=hub.example.com   --set admin.email=admin@example.com
```

- **بلا كلمة مرور للمدير:** إن لم تحدد `admin.password` تُولَّد كلمة مرور تلقائياً، ويطبع Helm بعد التثبيت أمر قراءتها.
- **المستودع التقليدي:** يمكنك أيضاً استخدام `helm repo add ea-hub https://e20e-tools.github.io/ea-hub-selfhost`.
- **Rancher:** أضف هذا الرابط من Apps ← Repositories، فيظهر EA-Hub في قائمة Charts مع نموذج إعداد بالواجهة.
- **OpenShift:** أضفه كـ `HelmChartRepository`، فيظهر في Developer Catalog.

## أو بأمر واحد من نسخة الكود

```bash
helm upgrade --install ea-hub ./deploy/helm/ea-hub -n ea-hub --create-namespace \
  --set appUrl=https://hub.example.com \
  --set ingress.enabled=true --set ingress.host=hub.example.com --set ingress.tls=true \
  --set admin.email=admin@example.com --set admin.password='كلمة-مرور-طويلة'
```

القيم السرية التي لا تحددها (`secrets.*`) تُولَّد عشوائياً في أول تثبيت، ثم **تبقى كما هي** في كل ترقية لاحقة. يُخزَّن الـ Secret بخاصية `keep` حتى لا يُحذف إذا أزلت التثبيت بالخطأ.

بعد التثبيت يطبع Helm الخطوات التالية (ملف `NOTES.txt`)، وتشمل أمر المتابعة ورابط الدخول.

```bash
kubectl -n ea-hub rollout status deploy/ea-hub
```

## أهم القيم

كل القيم مشروحة بالتعليقات في [`deploy/helm/ea-hub/values.yaml`](../deploy/helm/ea-hub/values.yaml)، ويتحقق Helm منها تلقائياً عبر `values.schema.json`.

| القيمة | المعنى |
|---|---|
| `appUrl` | **إلزامية.** الرابط الذي يفتحه الناس |
| `admin.email` / `admin.password` | حساب المدير الأول (يُنشأ مرة واحدة) |
| `ingress.enabled` / `host` / `tls` / `className` / `annotations` | الوصول من الخارج |
| `smtp.*` | البريد |
| `features.openaiApiKey` و`turnstile*` و`groqApiKey` | الميزات الاختيارية؛ كل منها يعمل فقط عند وجود مفتاحه |
| `storage.size` / `storageClass` / `accessMode` | قرص الملفات المرفوعة |
| `postgres.enabled=false` + `externalDatabase.*` | استخدام PostgreSQL خارجية (16 أو أحدث) |
| `backup.schedule` / `keepDays` | النسخ الاحتياطي |
| `secrets.create=false` + `secrets.existingSecret` | إدارة الأسرار بنفسك (Vault أو SealedSecrets…) |

### HTTPS تلقائي عبر cert-manager

إذا كان [cert-manager](https://cert-manager.io) مثبتاً ولديك ClusterIssuer:

```yaml
ingress:
  enabled: true
  className: nginx
  host: hub.example.com
  tls: true
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
```

### صورة خاصة (إن نسختها إلى سجل خاص)

```bash
kubectl -n ea-hub create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token-read:packages>
helm upgrade ea-hub ./deploy/helm/ea-hub -n ea-hub --reuse-values --set 'imagePullSecrets[0].name=ghcr-pull'
```

### مفاتيح الـ Secret إن أدرته بنفسك

`postgres-password` و`app-db-password` و`app-encryption-key` (32 حرفاً على الأقل) و`cron-secret` إلزامية. أما `admin-password` و`smtp-password` و`resend-api-key` و`openai-api-key` و`groq-api-key` و`turnstile-secret-key` فاختيارية. يوجد مثال كامل في [`deploy/kubernetes/secret.example.yaml`](../deploy/kubernetes/secret.example.yaml).

## الترقية

```bash
git pull
helm upgrade ea-hub ./deploy/helm/ea-hub -n ea-hub --reuse-values
```

تعمل تهيئة القاعدة تلقائياً قبل أن يبدأ الإصدار الجديد.

## ملاحظات

- قرص الملفات افتراضياً `ReadWriteOnce`، لذا اترك `replicaCount: 1`. لتشغيل أكثر من نسخة اختر `storage.accessMode: ReadWriteMany` مع storageClass يدعمه (NFS أو Longhorn RWX…).
- قاعدة البيانات المدمجة نسخة واحدة بلا تكرار، وتكفي لمعظم الاستخدامات. للتوافر العالي استخدم قاعدة خارجية مُدارة.
- نسخة احتياطية الآن:
  ```bash
  kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now
  ```
