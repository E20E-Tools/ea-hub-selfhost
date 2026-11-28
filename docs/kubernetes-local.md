# تشغيل EA-Hub على Kubernetes محلي (Docker Desktop وkind وminikube وk3s)

يشرح هذا الدليل تشغيل الـ Helm chart الحقيقي على جهازك دون حساب سحابي، للتعلم أو تجربة التعديلات أو عرض EA-Hub. لبيئة الإنتاج اتبع [helm.md](helm.md) أو الدليل الإنجليزي [en/deploy-kubernetes.md](en/deploy-kubernetes.md). الخطوات نفسها، مع نطاق حقيقي وHTTPS.

> النسخة الإنجليزية: [en/deploy-kubernetes-local.md](en/deploy-kubernetes-local.md)

## 1. المتطلبات

### العتاد (جهازك)

| | الحد الأدنى | الموصى به |
|---|---|---|
| المعالج | 4 أنوية | 6 أنوية أو أكثر |
| الذاكرة | 8 GB، تخصّص منها **4 GB** لـ Docker أو العنقود | 16 GB، تخصّص منها 6 GB للعنقود |
| مساحة القرص المتاحة | 20 GB | 40 GB |

### البرامج

| الأداة | الإصدار | التثبيت |
|---|---|---|
| Docker | Docker Desktop 4.x، أو Docker Engine 24 أو أحدث | [docker.com](https://www.docker.com/products/docker-desktop/) |
| عنقود محلي **واحد** | انظر الجدول التالي | |
| kubectl | 1.27 أو أحدث | يأتي مع Docker Desktop، وإلا فمن [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |
| Helm | 3.8 أو أحدث، أو 4.x | `winget install Helm.Helm` · `brew install helm` · [helm.sh](https://helm.sh/docs/intro/install/) |
| git | أي إصدار | |

| العنقود المحلي | مناسب لـ | التثبيت |
|---|---|---|
| **Kubernetes في Docker Desktop** | مستخدمي Windows وmacOS الذين لديهم Docker Desktop | Docker Desktop ← Settings ← Kubernetes ← *Enable Kubernetes* |
| **kind** | الأسرع في الإنشاء والحذف، وهو ما نستخدمه في CI | `winget install Kubernetes.kind` · `brew install kind` |
| **minikube** | إضافات كثيرة مثل ingress وdashboard | `winget install Kubernetes.minikube` · `brew install minikube` |
| **k3s** | جهاز Linux أو آلة افتراضية، والأقرب لخادم إنتاج صغير | `curl -sfL https://get.k3s.io \| sh -` |

الأربعة تأتي مع StorageClass افتراضي، وهو ما يحتاجه EA-Hub لأقراصه.

## 2. أنشئ العنقود أو شغّله

```bash
# kind
kind create cluster --name ea-hub

# minikube
minikube start --memory 6g --cpus 4

# Docker Desktop: enable Kubernetes in Settings, then select its context
kubectl config use-context docker-desktop

# k3s: already running after installation
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER ~/.kube/config
```

للتحقق:

```bash
kubectl get nodes           # STATUS Ready
kubectl get storageclass    # one is marked (default)
```

## 3. احصل على الكود وابنِ الصورة

البناء المحلي يغنيك عن سحب الصورة المنشورة.

```bash
git clone https://github.com/E20E-Tools/ea-hub-selfhost.git
cd ea-hub-selfhost
docker build --build-arg WITH_LOCAL_MODEL=0 -t ea-hub-selfhost:local .
```

الإعداد `WITH_LOCAL_MODEL=0` يجعل الصورة أصغر بنحو 120 MB لأنه يستبعد نموذج البحث المحلي. يستغرق البناء أول مرة بين 5 و10 دقائق.

اجعل الصورة متاحة للعنقود:

| العنقود | الأمر |
|---|---|
| kind | `kind load docker-image ea-hub-selfhost:local --name ea-hub` |
| minikube | `minikube image load ea-hub-selfhost:local` |
| Docker Desktop | لا شيء، فالعنقود يستخدم صور Docker مباشرة |
| k3s | `docker save ea-hub-selfhost:local \| sudo k3s ctr images import -` |

## 4. التثبيت بـ Helm

```bash
helm upgrade --install ea-hub deploy/helm/ea-hub \
  --namespace ea-hub --create-namespace \
  --set image.repository=ea-hub-selfhost \
  --set image.tag=local \
  --set image.pullPolicy=Never \
  --set appUrl=http://localhost:8080 \
  --set admin.email=admin@example.com \
  --set admin.password='choose-a-long-password' \
  --set backup.storage.size=2Gi --set storage.size=1Gi --set postgres.storage.size=2Gi
```

انتظر حتى يجهز التطبيق. التشغيل الأول يهيئ قاعدة البيانات، ويستغرق بين دقيقة وثلاث دقائق:

```bash
kubectl -n ea-hub rollout status deploy/ea-hub --timeout=10m
kubectl -n ea-hub get pods
```

```text
NAME                      READY   STATUS    RESTARTS   AGE
ea-hub-6d8f9c7b8d-q4z2n   1/1     Running   0          2m
ea-hub-postgres-0         1/1     Running   0          2m
```

## 5. افتح الموقع

```bash
kubectl -n ea-hub port-forward svc/ea-hub 8080:80
```

اترك هذا الأمر يعمل، ثم افتح **http://localhost:8080/admin** وسجّل الدخول بالبريد وكلمة المرور من الخطوة 4.

![شاشة دخول المدير](en/images/admin-sign-in.jpg)

![لوحة تحكم المدير](en/images/admin-dashboard.jpg)

> يجب أن يطابق `appUrl` العنوان الذي تفتحه (`http://localhost:8080`)، وإلا أشارت الروابط والصور المرفوعة إلى مكان آخر.

### اختياري: Ingress بدل port-forward

- **minikube:** شغّل `minikube addons enable ingress`، ثم أضف `--set ingress.enabled=true --set ingress.host=ea-hub.local --set appUrl=http://ea-hub.local`. اجعل `ea-hub.local` يشير إلى ناتج `minikube ip` في ملف hosts.
- **k3s:** يأتي Traefik مدمجاً. استخدم الإعدادات نفسها مع `ingress.className=traefik`، واجعل الاسم يشير إلى عنوان IP للجهاز.

## 6. جرّب المهام المجدولة والنسخة الاحتياطية

```bash
kubectl -n ea-hub create job --from=cronjob/ea-hub-daily-cleanup cleanup-now
kubectl -n ea-hub create job --from=cronjob/ea-hub-backup backup-now
kubectl -n ea-hub wait --for=condition=complete job/cleanup-now job/backup-now --timeout=5m
kubectl -n ea-hub logs job/backup-now
```

## 7. التعديل والترقية والإزالة

```bash
# after rebuilding the image with a new tag (e.g. local2) and loading it again:
helm upgrade ea-hub deploy/helm/ea-hub -n ea-hub --reset-then-reuse-values --set image.tag=local2

# remove everything, including the data
helm uninstall ea-hub -n ea-hub
kubectl delete namespace ea-hub

# delete the cluster itself
kind delete cluster --name ea-hub     # or: minikube delete
```

## حل المشكلات

| العَرَض | الحل |
|---|---|
| الحاوية في حالة `Pending` | ذاكرة العنقود لا تكفي. خصّص لـ Docker Desktop أو minikube ذاكرة أكثر من Settings ← Resources |
| `ErrImageNeverPull` | لم تُحمَّل الصورة إلى العنقود (الخطوة 3)، أو الوسم مختلف |
| `Init:0/1` لمدة طويلة | الأمر `kubectl -n ea-hub logs deploy/ea-hub -c migrate` يعرض تقدم تهيئة قاعدة البيانات |
| المنفذ 8080 مستخدم | استخدم منفذاً محلياً آخر: `port-forward svc/ea-hub 9090:80` مع `appUrl=http://localhost:9090` |
