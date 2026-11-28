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

### تشغيل أكثر من نسخة من التطبيق (الملفات على S3)

افتراضياً تُحفظ الملفات المرفوعة على قرص لا يُربط إلا بحاوية واحدة، فيعمل التطبيق بنسخة واحدة. لتشغيل أكثر من نسخة، احفظ الملفات في حاوية تخزين متوافقة مع S3، مثل AWS S3 أو MinIO أو Ceph:

```bash
--set replicaCount=2 --set storage.backend=s3 --set storage.s3.bucket=ea-hub-uploads --set storage.s3.region=eu-central-1 --set storage.s3.accessKeyId=… --set storage.s3.secretAccessKey=…
# لغير AWS:  --set storage.s3.endpoint=https://minio.example.com
```

تظل الملفات تُقدَّم عبر التطبيق، فتبقى صلاحيات الوصول والروابط الموقعة كما هي، ويمكن أن تبقى الحاوية خاصة. في هذا الوضع لا تشمل النسخة الاحتياطية الليلية إلا قاعدة البيانات، لذا فعّل خاصية الإصدارات (versioning) أو النسخ المتماثل في الحاوية لحماية الملفات.

### توفر عالٍ لقاعدة البيانات (CloudNativePG)

القاعدة المدمجة حاوية واحدة. للانتقال التلقائي إلى نسخة احتياطية عند تعطل القاعدة، ثبّت مشغّل [CloudNativePG](https://cloudnative-pg.io) مرة واحدة في العنقود، ثم:

```bash
--set postgres.cloudnativepg.enabled=true --set postgres.cloudnativepg.instances=3
```

ينشئ الـ chart عندها Cluster من نوع CloudNativePG فيه نسخة رئيسية ونسختان متزامنتان، ويتصل التطبيق تلقائياً بالنسخة الرئيسية الحالية. يُختبر ذلك في CI، بما في ذلك حذف النسخة الرئيسية أثناء عمل التطبيق.

### عدة بيئات عبر GitOps

لإدارة بيئة اختبار وبيئة إنتاج عبر Git، توجد أمثلة Argo CD وRancher Fleet مع ملفي إعدادات جاهزين لكل بيئة في [deploy/gitops](../deploy/gitops/README.md).

### صفحة حالة الخادم

في لوحة الإدارة، تعرض صفحة **Settings ← Application health** حالة الخادم: الإصدار، وقاعدة البيانات، والتحديثات المطبقة، والتخزين، والبريد، والدخول الموحد، والمهام المجدولة، والمقاييس، والبحث.

### التوسع التلقائي والتتبع

- **`autoscaling.enabled=true`:** يزيد عدد نسخ التطبيق وينقصه حسب استهلاك المعالج. يحتاج حفظ الملفات على S3 (`storage.backend=s3`) أو قرصاً من نوع ReadWriteMany.
- **`tracing.otlpEndpoint`:** يرسل تتبع كل طلب بمعيار OpenTelemetry إلى Jaeger أو Tempo أو Datadog أو Azure Monitor عبر collector.

### المراقبة والتنبيهات

- **`metrics.enabled=true`:** يفعّل مقاييس Prometheus.
- **`metrics.prometheusRule.enabled=true`:** يضيف تنبيهات لتوقف التطبيق، وتوقف القاعدة أو بطئها، وارتفاع الذاكرة، وفشل النسخ الاحتياطي، وغيابه يومين.
- **`metrics.grafanaDashboard.enabled=true`:** يضيف لوحة Grafana جاهزة.

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
helm upgrade ea-hub ./deploy/helm/ea-hub -n ea-hub --reset-then-reuse-values --set 'imagePullSecrets[0].name=ghcr-pull'
```

### مفاتيح الـ Secret إن أدرته بنفسك

`postgres-password` و`app-db-password` و`app-encryption-key` (32 حرفاً على الأقل) و`cron-secret` إلزامية. أما `admin-password` و`smtp-password` و`resend-api-key` و`openai-api-key` و`groq-api-key` و`turnstile-secret-key` فاختيارية. يوجد مثال كامل في [`deploy/kubernetes/secret.example.yaml`](../deploy/kubernetes/secret.example.yaml).

## الترقية

```bash
git pull
helm upgrade ea-hub ./deploy/helm/ea-hub -n ea-hub --reset-then-reuse-values
```

تعمل تهيئة القاعدة تلقائياً قبل أن يبدأ الإصدار الجديد.

## ملاحظات

- قرص الملفات افتراضياً `ReadWriteOnce`، لذا اترك `replicaCount: 1`. لتشغيل أكثر من نسخة اختر `storage.accessMode: ReadWriteMany` مع storageClass يدعمه (NFS أو Longhorn RWX…).
- قاعدة البيانات المدمجة نسخة واحدة بلا تكرار، وتكفي لمعظم الاستخدامات. للتوافر العالي استخدم قاعدة خارجية مُدارة.
- نسخة احتياطية الآن:
  ```bash
  kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now
  ```
