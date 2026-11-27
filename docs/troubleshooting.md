# حل المشكلات الشائعة

ابدأ دائماً بهذين الأمرين:

```bash
docker compose ps                  # أي خدمة متوقفة أو غير "healthy"؟
docker compose logs --tail=100 app migrate caddy
```

في Kubernetes استبدلهما بالأوامر التالية:

```bash
kubectl -n ea-hub get pods
kubectl -n ea-hub logs deploy/ea-hub -c migrate
kubectl -n ea-hub logs deploy/ea-hub
```

---

### `APP_URL is missing — run ./setup.sh`
لا يوجد ملف `.env`، أو ينقصه متغير. شغّل `./setup.sh`، أو انسخ `.env.example` إلى `.env` واملأه.

### خدمة `migrate` توقفت، والتطبيق لا يبدأ
اقرأ سجلها: `docker compose logs migrate`.

| الرسالة | الحل |
|---|---|
| `password authentication failed` | غُيّرت `POSTGRES_PASSWORD` بعد أول تشغيل. أعدها إلى قيمتها الأصلية. القاعدة تحفظ كلمة المرور الأولى |
| `ADMIN_PASSWORD must be at least 10 characters` | كلمة مرور المدير قصيرة. صحّحها في `.env` ثم نفّذ `docker compose up -d` |
| `waiting for database` ثم توقف | القاعدة لم تبدأ. انظر `docker compose logs db`، وغالباً السبب امتلاء القرص |

ملاحظة: حالة `migrate` تكون `exited (0)` بعد النجاح، وهذا طبيعي.

### الموقع لا يفتح من المتصفح
- تأكد أن الخدمات تعمل: `docker compose ps`.
- على الخادم نفسه جرّب `curl http://localhost/healthz` (أو مع المنفذ الذي اخترته). إن نجح هذا ولم يفتح الموقع من جهاز آخر، فافتح المنفذ في جدار الحماية: `sudo ufw allow 80,443/tcp`.
- إذا كان المنفذ 80 مستخدماً من برنامج آخر (IIS أو Apache)، فشغّل `./setup.sh` واختر منفذاً آخر مثل 8080.

### شهادة HTTPS لا تصدر
- يجب أن يشير سجل DNS من نوع A إلى IP الخادم. تحقق بالأمر `nslookup hub.example.com`.
- يجب أن يصل المنفذان 80 و443 إلى الخادم من الإنترنت.
- اقرأ السجل: `docker compose logs caddy`.
- داخل شبكة مغلقة بلا إنترنت لا يمكن الحصول على شهادة عامة. استخدم `tls internal` كما في [install-docker.md](install-docker.md).

### "بيانات الدخول غير صحيحة" مع كلمة مرور صحيحة
- البريد يجب أن يطابق `ADMIN_EMAIL`.
- بعد 10 محاولات فاشلة خلال 15 دقيقة يُمنع الدخول مؤقتاً، فانتظر ربع ساعة.
- **إعادة تعيين كلمة مرور المدير:** ضع كلمة جديدة في `ADMIN_PASSWORD`، واضبط `ADMIN_RESET_PASSWORD=true` في `.env`، ثم نفّذ:
  ```bash
  docker compose up -d --force-recreate migrate app
  ```
  بعد الدخول أعد القيمة إلى `ADMIN_RESET_PASSWORD=false`.

### "نسيت كلمة المرور" لا يرسل بريداً
لم يُضبط SMTP. أضف `SMTP_HOST` و`SMTP_USER` و`SMTP_PASSWORD` و`SMTP_FROM` إلى `.env` ثم نفّذ `docker compose up -d`. للمدير استخدم طريقة إعادة التعيين السابقة.

### الروابط في الرسائل أو الصور تشير إلى عنوان خاطئ
`APP_URL` يجب أن يطابق العنوان الذي يفتحه الناس تماماً، بما في ذلك `https` والمنفذ إن وُجد. صحّحه ثم نفّذ `docker compose up -d`.

### الصور المرفوعة لا تظهر بعد تغيير العنوان
الروابط الموقّعة مرتبطة بـ `APP_URL`. بعد تصحيحه أعد تحميل الصفحة، فالروابط تتجدد تلقائياً.

### رفع ملف كبير يفشل
الحد الافتراضي 10 ميجابايت. غيّره عبر `STORAGE_MAX_UPLOAD_MB` في `.env`.

### البحث الدلالي أو المساعد أو Turnstile لا يعمل
هذه ميزات اختيارية، وتعمل فقط حين تضع مفاتيحها في `.env` (انظر [install-docker.md](install-docker.md#الميزات-الاختيارية)) ثم تعيد التشغيل.

### القرص امتلأ
- راجع حجم النسخ الاحتياطية: `du -sh backups/*`. قلّل `BACKUP_KEEP_DAYS` أو انقل النسخ القديمة.
- نظّف صور Docker القديمة: `docker image prune -f`.

### تنزيل الصورة `ghcr.io/...` يفشل بالخطأ `denied` أو `unauthorized`
المستودع خاص. لديك حلان:
- سجّل الدخول: `docker login ghcr.io`، واستخدم token فيه صلاحية `read:packages`.
- أو ابنِ الصورة محلياً: `docker compose build && docker compose up -d`.

---

لا تزال المشكلة قائمة؟ افتح Issue في المستودع، وأرفق ناتج `docker compose ps` و`docker compose logs --tail=200 app migrate`. **احذف أي كلمة مرور قبل النشر.**
