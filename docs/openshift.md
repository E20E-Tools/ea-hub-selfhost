# تشغيل EA-Hub على Red Hat OpenShift (أو OKD)

يشغّل OpenShift كل حاوية **بمعرّف مستخدم عشوائي**، وينشر المواقع عبر **Routes**. للـ Helm chart وضع خاص بـ OpenShift يتعامل مع الأمرين، ويُفعَّل بالإعداد `openshift.enabled=true`.

> النسخة الإنجليزية: [en/deploy-openshift.md](en/deploy-openshift.md)

## 1. المتطلبات

### سعة العنقود

| | الحد الأدنى | الموصى به |
|---|---|---|
| المعالج (مجموع الطلبات في المشروع) | 2 vCPU | 4 vCPU |
| الذاكرة | 4 GiB | 8 GiB |
| التخزين الدائم | 35 GiB (`ReadWriteOnce`): 5 للملفات و10 للقاعدة و20 للنسخ الاحتياطية | 60 GiB |

إن كان على مشروعك **ResourceQuota**، فيجب أن يسمح بأربع حاويات على الأقل، وثلاثة أقراص (PVC)، والذاكرة المذكورة أعلاه.

### البرامج والصلاحيات

| المطلوب | الإصدار والتفاصيل | للتحقق |
|---|---|---|
| OpenShift Container Platform أو OKD | **4.14 أو أحدث** (Kubernetes 1.27 أو أحدث) | `oc version` |
| أداة `oc` | بإصدار يطابق العنقود | `oc version --client` |
| Helm | 3.8 أو أحدث، أو 4.x. يمكن الاستغناء عنه بواجهة Developer (انظر أدناه) | `helm version` |
| الصلاحية | إنشاء مشروع، أو صلاحية *admin* على مشروع موجود | `oc auth can-i create deployments -n <project>` |
| StorageClass افتراضي | أي نوع `ReadWriteOnce`، مثل `gp3-csi` أو `thin-csi` أو `ocs-storagecluster-ceph-rbd` من ODF | `oc get storageclass` |
| سياق الأمان | يكفي **restricted-v2** الافتراضي. لا حاجة لـ `anyuid` ولا لصلاحيات مميزة | |
| الوصول إلى الصور | يجب أن يستطيع العنقود سحب `ghcr.io/e20e-tools/ea-hub-selfhost` و`docker.io/library/postgres:16`. في العناقيد المعزولة عن الإنترنت، انسخ الصورتين إلى سجلك الداخلي | |
| النطاق | نطاق التطبيقات في العنقود (مثل `*.apps.cluster.example.com`) أو اسم خاص بك | `oc get ingresses.config cluster -o jsonpath='{.spec.domain}'` |

## 2. سجّل الدخول وأنشئ مشروعاً

```bash
oc login --token=<token> --server=https://api.cluster.example.com:6443   # "Copy login command" in the web console
oc new-project ea-hub
```

## 3. احصل على الكود

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
```

## 4. وفّر صورة التطبيق

اختر **واحداً** من هذه الخيارات.

**أ) الصورة المنشورة (الافتراضي):** الصورة `ghcr.io/e20e-tools/ea-hub-selfhost` عامة، فلا تحتاج إلى أي إعداد. لا يلزمك pull secret إلا إذا كان العنقود يصل إلى GHCR عبر وسيط (proxy) يطلب تسجيل دخول:

```bash
oc create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token-with-read:packages>
oc secrets link default ghcr-pull --for=pull
```

**ب) نسخ الصور إلى سجلك الداخلي** (للعناقيد المعزولة):

```bash
skopeo copy docker://ghcr.io/e20e-tools/ea-hub-selfhost:<version> docker://registry.internal/ea-hub/ea-hub-selfhost:<version>
skopeo copy docker://docker.io/library/postgres:16 docker://registry.internal/ea-hub/postgres:16
```

ثم استخدم في الخطوات التالية `image.repository=registry.internal/ea-hub/ea-hub-selfhost` و`postgres.image=registry.internal/ea-hub/postgres:16`.

**ج) البناء داخل OpenShift** من هذا المستودع:

```bash
oc new-build --name ea-hub --strategy docker --binary
oc start-build ea-hub --from-dir=. --follow
# image: image-registry.openshift-image-registry.svc:5000/ea-hub/ea-hub:latest
```

## 5. اختر العنوان

استخدم اسم الـ Route الافتراضي، أو اسماً خاصاً بك:

```bash
APPS=$(oc get ingresses.config cluster -o jsonpath='{.spec.domain}')
echo "https://ea-hub.$APPS"        # e.g. https://ea-hub.apps.cluster.example.com
```

## 6. اكتب ملف الإعدادات

أنشئ الملف `my-values.yaml`. احفظه خارج المستودع لأنه يحتوي على كلمة مرور:

```yaml
appUrl: https://ea-hub.apps.cluster.example.com

openshift:
  enabled: true              # random UIDs, Debian postgres image, Route
  route:
    enabled: true
    host: ea-hub.apps.cluster.example.com
    tls: true                # edge TLS with the router certificate, HTTP → HTTPS

ingress:
  enabled: false             # the Route replaces the Ingress

admin:
  email: admin@yourcompany.com
  password: choose-a-long-password

image:
  repository: ghcr.io/e20e-tools/ea-hub-selfhost
  tag: "<version>"

# storage:
#   storageClass: thin-csi   # only if there is no default StorageClass
# smtp: { host: smtp.example.com, port: 587, user: …, password: …, from: "EA-Hub <…>" }
```

ما الذي يغيّره الإعداد `openshift.enabled=true` في الموارد الناتجة:

- **معرّفات المستخدمين:** لا يحدد الـ chart القيم `runAsUser` و`runAsGroup` و`fsGroup`، فيعيّنها **restricted-v2** بنفسه. صورة EA-Hub مبنية لتعمل بأي معرّف مستخدم ضمن المجموعة 0.
- **صورة PostgreSQL:** تُستخدم `postgres:16` المبنية على Debian، لأنها تعمل بمعرّفات مستخدمين عشوائية. نسخة Alpine مخصصة لـ Kubernetes العادي فقط.
- **النشر:** يُنشأ **Route** للـ Service مع TLS عند حافة الموجّه (edge).

## 7. التثبيت

```bash
helm upgrade --install ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml
oc -n ea-hub rollout status deploy/ea-hub --timeout=10m
oc -n ea-hub get pods,route
```

```text
NAME                          READY   STATUS    RESTARTS   AGE
pod/ea-hub-5b7d9c6f4-8kx2p    1/1     Running   0          3m
pod/ea-hub-postgres-0         1/1     Running   0          3m

NAME                              HOST/PORT                              SERVICES   PORT   TERMINATION
route.route.openshift.io/ea-hub   ea-hub.apps.cluster.example.com        ea-hub     http   edge/Redirect
```

ما دامت حالة الحاوية `Init:0/1`، يمكنك متابعة تهيئة قاعدة البيانات:

```bash
oc -n ea-hub logs deploy/ea-hub -c migrate -f
```

### بديل: من واجهة الويب دون أداة Helm

1. **أضف مستودع EA-Hub مرة واحدة.** لكل العنقود، وهذا يحتاج صلاحية cluster-admin:

   ```bash
   cat <<'EOF' | oc apply -f -
   apiVersion: helm.openshift.io/v1beta1
   kind: HelmChartRepository
   metadata:
     name: ea-hub
   spec:
     name: EA-Hub
     connectionConfig:
       url: https://e20e-tools.github.io/ea-hub-selfhost
   EOF
   ```

   لإضافته لمشروع واحد فقط دون صلاحية cluster-admin، استخدم `kind: ProjectHelmChartRepository` مع `metadata.namespace: ea-hub`.
2. **ثبّت التطبيق.** افتح منظور **Developer**، واختر المشروع `ea-hub`، ثم **+Add ← Helm Chart**، واختر **EA-Hub** ← **Create**.
   - يُبنى النموذج من مخطط الإعدادات في الـ chart. اضبط فيه `appUrl` و`admin.email` و**`openshift.enabled: true`**.
   - في صفحة التطبيق أمر **Test** يشغّل `helm test` ويفحص `/healthz`.
3. **أو استورد YAML:** اختر **+Add ← Import YAML** والصق ناتج الأمر
   `helm template ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml`.
   لكن هذه الطريقة لا تتتبع الترقيات، والأفضل استخدام أداة Helm.

## 8. افتح الموقع وسجّل الدخول

افتح `https://ea-hub.apps.cluster.example.com/admin`:

![شاشة دخول المدير](en/images/admin-sign-in.jpg)

![لوحة تحكم المدير](en/images/admin-dashboard.jpg)

فحص الصحة: الأمر `curl https://ea-hub.apps.cluster.example.com/healthz` يعيد `{"ok":true,"database":"ok"}`.

## 9. التشغيل اليومي

| المهمة | الأمر |
|---|---|
| الترقية | `helm upgrade ea-hub deploy/helm/ea-hub -n ea-hub -f my-values.yaml --set image.tag=<new>` |
| نسخة احتياطية الآن | `oc -n ea-hub create job --from=cronjob/ea-hub-backup backup-now` |
| السجلات | `oc -n ea-hub logs deploy/ea-hub -f` |
| حفظ نسخة من الأسرار المولّدة | `oc -n ea-hub get secret ea-hub -o yaml > ea-hub-secret-backup.yaml` (احفظه في مكان آمن) |
| إزالة التثبيت مع الإبقاء على البيانات | `helm uninstall ea-hub -n ea-hub` |
| حذف كل شيء | `oc delete project ea-hub` |

لاستخدام شهادتك الخاصة على الـ Route، لديك طريقتان:
- ثبّت cert-manager Operator مع إضافة *openshift-routes*، واضبط `openshift.route.annotations: {cert-manager.io/issuer-name: …}`.
- أو اطلب من مدير العنقود الشهادة العامة (wildcard) الخاصة بالموجّه، فتُستخدم تلقائياً.

## حل المشكلات

| العَرَض | السبب والحل |
|---|---|
| `unable to validate against any security context constraint` | الإعداد `openshift.enabled` ليس `true`، فالوضع الافتراضي يضع معرّفات مستخدمين ثابتة يرفضها restricted-v2 |
| PostgreSQL في حالة `CrashLoopBackOff` مع `could not change permissions of directory` | غيّرت `postgres.image` إلى صورة لا تعمل بمعرّف مستخدم عشوائي. استخدم `postgres:16` (Debian) أو نسخة منها في سجلك |
| `ImagePullBackOff` | اربط الـ pull secret بالأمر `oc secrets link default ghcr-pull --for=pull`، أو انسخ الصور إلى سجلك (الخطوة 4) |
| القرص (PVC) في حالة `Pending` | لا يوجد StorageClass افتراضي. اضبط `storage.storageClass` و`postgres.storage.storageClass` و`backup.storage.storageClass` |
| الـ Route يعرض "Application is not available" | الحاوية لم تجهز بعد. شغّل `oc -n ea-hub get pods`، ثم اقرأ سجلات `migrate` |
| تجاوز حصة الموارد (Quota) | اطلب حصة أكبر، أو خفّض قيم `resources` و`postgres.resources` في ملف الإعدادات |
