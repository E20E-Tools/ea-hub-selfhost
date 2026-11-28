# عدة بيئات عبر GitOps (Argo CD وRancher Fleet)

يشرح هذا الدليل تشغيل EA-Hub في أكثر من بيئة، مثل بيئة الاختبار (staging) وبيئة الإنتاج (production)، بحيث يمر كل تغيير عبر Git. يأتي الـ chart من المستودع المنشور، فلا تحتفظ في مستودع الإعدادات الخاص بك إلا **بملفات الإعدادات (values)**.

> النسخة الإنجليزية والملفات: [deploy/gitops](../deploy/gitops/README.md)

```
deploy/gitops/
  values/staging.yaml       نسخة واحدة من التطبيق، والقاعدة المدمجة
  values/production.yaml    نسختان من التطبيق مع الملفات على S3، وCloudNativePG بثلاث نسخ،
                            ونسخ احتياطي خارجي، ودخول موحد، ومراقبة وتنبيهات ولوحة Grafana
  argocd/ea-hub-<env>.yaml  تطبيقات Argo CD (الـ chart من OCI مع إعداداتك)
  fleet/<env>/fleet.yaml    حزم Rancher Fleet (الـ chart من مستودع Helm مع إعداداتك)
```

يُختبر عرض (render) ملفي الإعدادات في CI، فيبقيان صالحين مع كل تغيير في الـ chart.

## 1. انسخ ملفات الإعدادات إلى مستودعك

انسخ مجلد `values/` إلى `ea-hub/values/` في مستودع الإعدادات، ثم عدّل فيه أسماء النطاقات والبريد وأسماء حاويات التخزين ومعرّفات الدخول الموحد.

## 2. الأسرار: لا تضعها في Git أبداً

ملفات الإعدادات تستخدم `secrets.create: false` و`existingSecret: ea-hub-secrets`. أنشئ هذا الـ Secret بأداة **Sealed Secrets** أو **External Secrets**، التي تقرأ من Vault أو Azure Key Vault أو AWS Secrets Manager أو غيرها.

**المفاتيح المطلوبة:**
- `postgres-password`
- `app-db-password`
- `app-encryption-key` (32 حرفاً على الأقل، ولا يُغيَّر أبداً)
- `cron-secret`

**المفاتيح الاختيارية:**
- `admin-password`
- `smtp-password`
- `openai-api-key`
- `turnstile-secret-key`
- `s3-access-key-id` و`s3-secret-access-key` (لحفظ الملفات على S3)
- `oidc-client-secret` (للدخول الموحد)
- `metrics-token`

**أسرار إضافية لإعدادات الإنتاج:**
- **CloudNativePG:** Secret من نوع `kubernetes.io/basic-auth` باسم `ea-hub-secrets-pg-superuser`، فيه `username: postgres`، و`password` **بالقيمة نفسها** الموجودة في `postgres-password`.
- **النسخ الخارجي:** Secret باسم `ea-hub-offsite` فيه المفتاحان `ACCESS_KEY_ID` و`SECRET_ACCESS_KEY`.

## 3أ. Argo CD

```bash
kubectl apply -f deploy/gitops/argocd/ea-hub-staging.yaml     # after editing repoURL of your config repo
kubectl apply -f deploy/gitops/argocd/ea-hub-production.yaml
```

للترقية: ارفع قيمة `targetRevision` (مثلاً من `1.1.0` إلى `1.2.0`) في طلب دمج. أثناء المزامنة تؤخذ نسخة احتياطية تلقائياً قبل الترقية.

## 3ب. Rancher Fleet

في Rancher:
1. افتح **Continuous Delivery ← Git Repos ← Add Repository**.
2. اجعله يشير إلى مستودع الإعدادات، بالمسارين `ea-hub/fleet/staging` و`ea-hub/fleet/production`.
3. وجّه كل مسار إلى مجموعة العناقيد المناسبة.

## طريقة الترقية بين البيئات

1. ارفع إصدار الـ chart في `staging` وادمج التغيير.
2. تحقق من صفحة **Settings ← Application health** في لوحة الإدارة، فهي تعرض حالة الخادم.
3. ارفع الإصدار نفسه في `production` وادمج التغيير.
