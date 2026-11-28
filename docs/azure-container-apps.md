# تشغيل EA-Hub على Azure Container Apps

تشغّل خدمة Container Apps حاوية EA-Hub دون خوادم أو Kubernetes تديرها بنفسك. تُستخدم معها ثلاث خدمات أخرى من Azure:

| جزء EA-Hub | خدمة Azure |
|---|---|
| تطبيق الويب (HTTPS والتوسع) | **Azure Container Apps** |
| قاعدة البيانات | **Azure Database for PostgreSQL – Flexible Server** (الإصدار 16) |
| الملفات المرفوعة (`/data/storage`) | مشاركة ملفات **Azure Files** مربوطة بالتطبيق |
| المهام اليومية | **Container Apps Jobs** بتشغيل مجدول |
| النسخ الاحتياطية | نسخ PostgreSQL المدمجة، ولقطات مشاركة Azure Files |

> النسخة الإنجليزية: [en/deploy-azure-container-apps.md](en/deploy-azure-container-apps.md)

> **الحالة:** تتبع هذه الخطوات أوامر Azure CLI الموثقة. الحاوية نفسها، ووضع المالك لـ PostgreSQL المُدارة، وخيار `MIGRATE_ON_START`، كلها مختبرة في CI على PostgreSQL 16 عادية. لكن Azure نفسها لم تُختبر من البداية إلى النهاية بعد. إن وجدت اختلافاً في اشتراكك فافتح بلاغاً (issue).

## 1. المتطلبات

### موارد Azure وأحجامها

| المورد | الحجم المبدئي | ملاحظات |
|---|---|---|
| Container App | **1 vCPU و2 GiB**، نسخة واحدة على الأقل و3 على الأكثر | نسخة واحدة على الأقل تبقي المحادثة المباشرة والمهام الخلفية سريعة الاستجابة |
| PostgreSQL Flexible Server | **Burstable B1ms** (1 vCore و2 GiB)، وتخزين 32 GiB، الإصدار **16** | General Purpose D2ds_v5 للإنتاج |
| حساب تخزين ومشاركة ملفات | Standard LRS بحصة **5 GiB** | Premium إن كان رفع الملفات كثيفاً |
| Container Apps Jobs | 0.25 vCPU و0.5 GiB لكل مهمة | 3 مهام تعمل مرة يومياً |

التكلفة التقريبية بهذه الأحجام: بين 40 و70 دولاراً شهرياً، حسب المنطقة وحجم الاستخدام.

### الأدوات والصلاحيات

| المطلوب | التفاصيل |
|---|---|
| اشتراك Azure | دور **Contributor** على مجموعة موارد (أو على الاشتراك) |
| Azure CLI | 2.60 أو أحدث مع الإضافة: `az extension add --name containerapp --upgrade` |
| تسجيل المزوّدين | `az provider register -n Microsoft.App` و`-n Microsoft.OperationalInsights` |
| الصورة | `ghcr.io/e20e-tools/ea-hub-selfhost:<version>`. الصورة عامة، ويمكنك أيضاً نسخها إلى Azure Container Registry: `az acr import -n <acr> --source ghcr.io/e20e-tools/ea-hub-selfhost:<version>` |
| نطاق خاص (اختياري) | لاستخدام `hub.example.com` بدل العنوان المولّد `*.azurecontainerapps.io` |
| openssl | لتوليد الأسرار |

## 2. اضبط المتغيرات

```bash
RG=ea-hub-rg; LOC=westeurope
ENV=ea-hub-env; APP=ea-hub
PG=ea-hub-pg-$RANDOM; PG_ADMIN=eahubadmin; PG_PASS=$(openssl rand -hex 24)
SA=eahubfiles$RANDOM; SHARE=uploads
IMAGE=ghcr.io/e20e-tools/ea-hub-selfhost:<version>
ENC_KEY=$(openssl rand -hex 32); CRON_SECRET=$(openssl rand -hex 24)
ADMIN_EMAIL=admin@yourcompany.com; ADMIN_PASSWORD='choose-a-long-password'
az group create -n $RG -l $LOC
```

احفظ الآن `PG_PASS` و`ENC_KEY` و`CRON_SECRET` في مدير كلمات المرور. **لا تغيّر `ENC_KEY` أبداً** بعد أن يعمل التطبيق أول مرة.

## 3. أنشئ قاعدة البيانات

```bash
az postgres flexible-server create -g $RG -n $PG -l $LOC \
  --version 16 --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
  --admin-user $PG_ADMIN --admin-password "$PG_PASS" \
  --public-access 0.0.0.0          # allows Azure services only; use --vnet for private networking
az postgres flexible-server db create -g $RG -s $PG -d eahub
```

حساب المدير في الخادم المُدار ليس superuser. يكتشف EA-Hub ذلك ويعمل في **وضع المالك**: يتصل التطبيق بحساب المدير الذي يملك الجداول، فلا يلزم أي إعداد إضافي.

## 4. أنشئ مشاركة الملفات المرفوعة

```bash
az storage account create -g $RG -n $SA -l $LOC --sku Standard_LRS --kind StorageV2
az storage share-rm create -g $RG --storage-account $SA -n $SHARE --quota 5
SA_KEY=$(az storage account keys list -g $RG -n $SA --query [0].value -o tsv)
```

## 5. أنشئ بيئة Container Apps واربط المشاركة بها

```bash
az containerapp env create -g $RG -n $ENV -l $LOC
az containerapp env storage set -g $RG -n $ENV --storage-name uploads \
  --azure-file-account-name $SA --azure-file-account-key "$SA_KEY" \
  --azure-file-share-name $SHARE --access-mode ReadWrite
```

## 6. أنشئ التطبيق

ربط القرص يتطلب تعريفاً بصيغة YAML. أنشئ الملف `ea-hub-app.yaml`، وستملأ الأداة `envsubst` قيم `${…}` لاحقاً:

```yaml
properties:
  configuration:
    ingress: { external: true, targetPort: 3000, transport: auto, allowInsecure: false }
    secrets:
      - { name: db-password, value: "${PG_PASS}" }
      - { name: enc-key, value: "${ENC_KEY}" }
      - { name: cron-secret, value: "${CRON_SECRET}" }
      - { name: admin-password, value: "${ADMIN_PASSWORD}" }
  template:
    containers:
      - name: ea-hub
        image: "${IMAGE}"
        resources: { cpu: 1.0, memory: 2Gi }
        env:
          - { name: APP_URL, value: "${APP_URL}" }
          - { name: DB_HOST, value: "${PG}.postgres.database.azure.com" }
          - { name: DB_NAME, value: eahub }
          - { name: DB_SSLMODE, value: require }
          - { name: APP_DB_USER, value: "${PG_ADMIN}" }
          - { name: APP_DB_PASSWORD, secretRef: db-password }
          - { name: APP_ENCRYPTION_KEY, secretRef: enc-key }
          - { name: CRON_SECRET, secretRef: cron-secret }
          - { name: MIGRATE_ON_START, value: "true" }
          - { name: ADMIN_EMAIL, value: "${ADMIN_EMAIL}" }
          - { name: ADMIN_PASSWORD, secretRef: admin-password }
          - { name: TRUST_PROXY_HOPS, value: "1" }
        volumeMounts:
          - { volumeName: uploads, mountPath: /data/storage }
        probes:
          - { type: Liveness, httpGet: { path: /healthz, port: 3000 }, periodSeconds: 30 }
          - { type: Readiness, httpGet: { path: /healthz, port: 3000 }, periodSeconds: 10 }
          - { type: Startup, httpGet: { path: /healthz, port: 3000 }, periodSeconds: 10, failureThreshold: 30 }
    scale: { minReplicas: 1, maxReplicas: 3 }
    volumes:
      - name: uploads
        storageType: AzureFile
        storageName: uploads
        mountOptions: "uid=1000,gid=0,dir_mode=0775,file_mode=0664"
```

أنشئ التطبيق. العنوان غير معروف بعد، فيُستخدم عنوان مؤقت أولاً:

```bash
export PG PG_ADMIN PG_PASS ENC_KEY CRON_SECRET ADMIN_EMAIL ADMIN_PASSWORD IMAGE
export APP_URL=https://placeholder.invalid
envsubst < ea-hub-app.yaml > /tmp/app.yaml
az containerapp create -g $RG -n $APP --environment $ENV --yaml /tmp/app.yaml
```

ثم اضبط العنوان الحقيقي وحدّث التطبيق:

```bash
FQDN=$(az containerapp show -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)
export APP_URL=https://$FQDN
envsubst < ea-hub-app.yaml > /tmp/app.yaml
az containerapp update -g $RG -n $APP --yaml /tmp/app.yaml
echo $APP_URL
```

في التشغيل الأول يهيئ التطبيق قاعدة البيانات خلال دقيقة أو دقيقتين، وينشئ حساب المدير. تابع ذلك بالأمر:

```bash
az containerapp logs show -g $RG -n $APP --follow
# [migrate] 91 migrations applied in total … [migrate] owner mode: … [migrate] admin account created … Listening on: http://0.0.0.0:3000/
```

## 7. المهام المجدولة (بديل Vercel Cron)

```bash
for JOB in "newsletter|0 6 * * *" "daily-cleanup|30 2 * * *" "semantic-index|15 3 * * *"; do
  NAME=${JOB%%|*}; CRON=${JOB#*|}
  az containerapp job create -g $RG -n ea-hub-$NAME --environment $ENV \
    --trigger-type Schedule --cron-expression "$CRON" --replica-timeout 900 --replica-retry-limit 1 \
    --image $IMAGE --cpu 0.25 --memory 0.5Gi \
    --secrets cron-secret=$CRON_SECRET \
    --env-vars JOB_BASE_URL=$APP_URL CRON_SECRET=secretref:cron-secret \
    --command node --args selfhost/scripts/run-job.mjs $NAME
done
```

المواعيد بتوقيت UTC. لتجربة مهمة الآن:

```bash
az containerapp job start -g $RG -n ea-hub-daily-cleanup
```

## 8. نطاقك الخاص (اختياري)

```bash
az containerapp hostname add -g $RG -n $APP --hostname hub.example.com
# create the DNS records it prints (CNAME to the app + TXT asuid.hub.example.com), then:
az containerapp hostname bind -g $RG -n $APP --hostname hub.example.com --environment $ENV --validation-method CNAME
```

بعدها:
- اضبط `APP_URL=https://hub.example.com`، وحدّث التطبيق كما في الخطوة 6.
- اضبط `JOB_BASE_URL` في المهام الثلاث: `az containerapp job update … --set-env-vars JOB_BASE_URL=…`.

## 9. افتح الموقع وسجّل الدخول

افتح `$APP_URL/admin` وسجّل الدخول بـ `ADMIN_EMAIL` و`ADMIN_PASSWORD`:

![شاشة دخول المدير](en/images/admin-sign-in.jpg)

![لوحة تحكم المدير](en/images/admin-dashboard.jpg)

بعد ذلك:
1. غيّر كلمة المرور من **My account**.
2. احذف من التطبيق الـ secret المسمى `admin-password` والمتغير `ADMIN_PASSWORD`.

## 10. التشغيل اليومي

| المهمة | الطريقة |
|---|---|
| الترقية | `az containerapp update -g $RG -n $APP --image ghcr.io/e20e-tools/ea-hub-selfhost:<new>`. تُحدَّث قاعدة البيانات عند التشغيل |
| السجلات | `az containerapp logs show -g $RG -n $APP --follow`، أو Log Analytics |
| نسخ قاعدة البيانات | تلقائية، بين 7 و35 يوماً (`az postgres flexible-server update --backup-retention 14`). الاستعادة بـ `az postgres flexible-server restore` |
| نسخ الملفات | حساب التخزين ← File shares ← `uploads` ← **Snapshots**، أو Azure Backup للمشاركات |
| التوسع | غيّر `minReplicas` و`maxReplicas`. النسخ المتعددة تتشارك مشاركة الملفات وقاعدة البيانات نفسها |
| حذف كل شيء | `az group delete -n $RG` |

## حل المشكلات

| العَرَض | الحل |
|---|---|
| فشل الإصدار، والسجلات تعرض `password authentication failed` | قيمة `APP_DB_USER` أو كلمة المرور خاطئة. استخدم اسم مدير Flexible Server دون اللاحقة `@server` |
| `no pg_hba.conf entry … SSL off` | الإعداد `DB_SSLMODE=require` غير موجود |
| `connection timed out` عند الاتصال بالقاعدة | اسمح لخدمات Azure من صفحة **Networking** في الخادم، أو استخدم ربط الشبكة الافتراضية (VNet) |
| فشل الرفع مع `EACCES` | يجب أن تعطي خيارات ربط المشاركة صلاحية الكتابة للمستخدم 1000 (`mountOptions` في الخطوة 6) |
| كل الزوار يتشاركون حد طلبات واحداً | يُقرأ عنوان الزائر من `X-Forwarded-For`. أبقِ `TRUST_PROXY_HOPS=1`، أو اجعله `2` إن وضعت Azure Front Door أمام التطبيق |
| المهام تفشل برمز HTTP 401 | قيمة `CRON_SECRET` في المهام تختلف عنها في التطبيق |
