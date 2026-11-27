# التثبيت على Kubernetes بدون Helm (ملفات YAML خام)

الملف [`deploy/kubernetes/ea-hub.yaml`](../deploy/kubernetes/ea-hub.yaml) مولَّد تلقائياً من الـ Helm chart. يُعاد توليده مع كل تحديث للفرع الرئيسي، لذا هو دائماً مطابق للـ chart. ولا يحتوي أي كلمة مرور: الأسرار تضعها أنت في ملف منفصل.

## الخطوات

1. **أنشئ مساحة الأسماء:**
   ```bash
   kubectl apply -f deploy/kubernetes/namespace.yaml
   ```

2. **جهّز الأسرار:** انسخ [`secret.example.yaml`](../deploy/kubernetes/secret.example.yaml) إلى ملف خارج المستودع، مثل `~/ea-hub-secret.yaml`، واستبدل كل `CHANGE_ME` بقيمة عشوائية. لتوليد قيمة:
   ```bash
   openssl rand -hex 32
   ```
   ثم طبّق الملف:
   ```bash
   kubectl apply -f ~/ea-hub-secret.yaml
   ```

3. **عدّل العنوان:** افتح `deploy/kubernetes/ea-hub.yaml` وابحث عن `ea-hub.local` (في `APP_URL` وفي الـ Ingress)، واستبدله باسم موقعك. وابحث عن `admin@example.com` (`ADMIN_EMAIL`) واستبدله ببريد المدير.

4. **طبّق باقي الموارد:**
   ```bash
   kubectl apply -f deploy/kubernetes/ea-hub.yaml
   kubectl -n ea-hub rollout status deploy/ea-hub
   ```

5. **للتجربة بدون Ingress:**
   ```bash
   kubectl -n ea-hub port-forward svc/ea-hub 8080:80
   ```
   ثم افتح `http://localhost:8080`.

## التحديث

اسحب أحدث نسخة من المستودع، ثم أعد تطبيق الملف:

```bash
git pull
kubectl apply -f deploy/kubernetes/ea-hub.yaml
```

بعدها أعد تعديلات العنوان من الخطوة 3. لهذا السبب Helm أريح على المدى الطويل: انظر [helm.md](helm.md).
