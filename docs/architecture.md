# كيف تعمل نسخة الاستضافة الذاتية (للمطورين)

## الفكرة

كُتب EA-Hub الأصلي فوق Supabase (Auth وPostgREST وStorage وRealtime) وVercel (الاستضافة وCron). هذه النسخة تستبدل الاثنين دون إعادة كتابة كود التطبيق:

- **`@supabase/supabase-js` لم يعد يُشحن.** يحوّل `vite.config.ts` اسم الحزمة (alias) إلى [`src/selfhost/supabase-js`](../src/selfhost/supabase-js)، وهو بديل صغير ينفّذ الجزء الذي يستخدمه التطبيق فقط من الواجهة نفسها: `from().select().eq()…` و`rpc` و`auth` و`storage` و`channel`. لذلك تبقى أسطر الاستيراد في الكود الأصلي كما هي. الحزمة الحقيقية مثبتة فقط للأنواع (devDependency)، ولا تدخل في البناء.
- **على الخادم** ينفّذ [`src/selfhost/server`](../src/selfhost/server) الطلبات مباشرة على PostgreSQL، داخل معاملة تنتحل دور الطلب كما يفعل PostgREST:
  ```sql
  set_config('role', 'anon' | 'authenticated' | 'service_role', true)
  set_config('request.jwt.claims', '{...}', true)
  ```
  النتيجة: سياسات RLS والدوال `auth.uid()` و`auth.role()` و`auth.jwt()` المكتوبة في الـ migrations الأصلية تعمل كما هي، بالحماية نفسها.
- **في المتصفح** تذهب كل الطلبات إلى التطبيق نفسه تحت `/api/selfhost/*` (نفس الأصل origin، بلا مفاتيح في الحزمة). يعمل الخادم بدور `anon`، أو `authenticated` عند وجود جلسة صالحة.

## مكوّنات الاستبدال

| Supabase / Vercel | البديل | الملف |
|---|---|---|
| المنصة: الأدوار `anon`/`authenticated`/`service_role`، ومخطط `auth`، ومخطط `storage`، والنشر `supabase_realtime` | SQL عادي يُطبَّق قبل الـ migrations | [`selfhost/db/00-bootstrap.sql`](../selfhost/db/00-bootstrap.sql) |
| PostgREST | مترجم QuerySpec → SQL بمعاملات مربوطة، والمعرّفات تُتحقق من الـ catalog | `server/compile.ts` و`server/execute.ts` |
| GoTrue (Auth) | `auth.users` مع scrypt، وJWT HS256، وrefresh tokens مدوّرة ومخزّنة كـ hash، وروابط استعادة لمرة واحدة، وتحديد معدل المحاولات | `server/auth.ts` |
| Storage | ملفات على قرص دائم، والبيانات الوصفية في `storage.objects` (سياسات RLS للتخزين تبقى فعالة)، وروابط موقّعة بـ HMAC | `server/storage.ts` |
| Realtime | trigger يرسل `NOTIFY` لجداول `supabase_realtime`، والمتصفح يتلقى SSE، ويُعاد قراءة كل صف بدور المشترك، فتقرر RLS ما يراه | `server/realtime.ts` و`selfhost/db/90-post-migrate.sql` |
| Vercel Cron | خدمة `cron` في Compose (`selfhost/scripts/cron.mjs`)، وCronJob في Helm | |
| Vercel IP header | `X-Forwarded-For` من الوكيل الموثوق (`TRUST_PROXY_HOPS`) يتحول إلى `cf-connecting-ip` الذي يقرؤه الكود الأصلي | `server/http.ts` |
| Resend فقط | جسر يحوّل طلبات Resend إلى SMTP عند ضبط `SMTP_HOST` | `server/mail.ts` |

الأسرار الداخلية (توقيع JWT، وتوقيع روابط الملفات، و"مفتاح الخدمة") مشتقة بـ HKDF من `APP_ENCRYPTION_KEY`، فلا يحتاج المستخدم إلى إدخال مفاتيح إضافية.

## قاعدة البيانات والأدوار

- `postgres` (المالك): يشغّل الـ migrations فقط.
- `eahub_app`: دور الدخول الذي يستخدمه التطبيق. ليس superuser، وعضو في `anon` و`authenticated` و`service_role` ليتمكن من انتحالها. له `BYPASSRLS` فقط للاستعلامات المباشرة التي كانت تعمل كمالك على Supabase (النشرة وتجارب الفرق). كل طلب عبر طبقة الاستبدال يُنفَّذ بدور أقل صلاحية، وفيه تُطبَّق RLS.
- الـ migrations الأصلية في `drizzle/migrations` تُطبَّق كما هي بـ drizzle-orm. لا يوجد أي تعديل عليها.

## ما الذي عدّلناه في ملفات الأصل؟

ثلاثة ملفات فقط، وبسطور قليلة معلّمة بكلمة `Self-host`:

- `vite.config.ts`: الـ alias وقيم VITE الافتراضية.
- `src/server.ts`: تمرير الطلب أولاً إلى `selfhostFetch`.
- `package.json`: نقل supabase-js إلى devDependencies، وإضافة `nodemailer` و`postgres` و`drizzle-orm` كاعتماديات تشغيل، وسكربت `selfhost:migrate`.

أما `README.md` و`.env.example` فمستبدلة بالكامل، ومحمية عند المزامنة عبر `.gitattributes`.

## حدود معروفة

- يدعم المترجم ما يستخدمه EA-Hub من PostgREST: الفلاتر الأساسية، و`or()` المتداخلة، والتضمين many-to-one وone-to-many مع `!inner`، و`count`، و`range`، و`single`. إذا احتاج الأصل ميزة جديدة، تُرجع رسالة خطأ واضحة وتفشل الاختبارات، فتُضاف.
- Realtime يدعم `postgres_changes` بفلتر بسيط (`col=eq.value`)، وهو ما تستخدمه لوحة الدردشة المباشرة.
- الملفات على قرص واحد. لتشغيل أكثر من نسخة من التطبيق يلزم قرص مشترك (RWX).
- التشغيل المحلي القديم (`npm start` مع Tinbase) خاص بالأصل. للتطوير هنا استخدم PostgreSQL حقيقية كما في README.

## الاختبارات

- `src/selfhost/test/compile.test.ts`: المترجم دون قاعدة بيانات.
- `src/selfhost/test/adapter.integration.test.ts`: مع قاعدة حقيقية بدور `eahub_app` (`SELFHOST_TEST_DATABASE_URL`)، ويغطي القراءة والكتابة وRLS وrpc والدخول والتجديد والخروج والملفات والتضمين وRealtime.
- CI ([`ci.yml`](../.github/workflows/ci.yml)) يشغّل أيضاً كل اختبارات الأصل، و`docker compose up` من الصفر، و`helm lint` و`helm template`، وتثبيتاً حقيقياً على kind.
