# EA-Hub Studio

واجهة عربية وإنجليزية لأدوات E20E في البنية المؤسسية. المشروع مستقل عن مسار الهجرة، ويعمل على الجهاز بعنوان [المعاينة](http://127.0.0.1:4175/). يمكن فتح [لوحة التحوّل](http://127.0.0.1:4175/#board) أو [استوديو الحركة](http://127.0.0.1:4175/design-lab) مباشرة.

## التشغيل على هذا الجهاز

افتح `Start-EA-Hub.cmd` أو نفّذ `npm start` من مجلد المشروع. تستخدم النسخة المبنية المنفذ 4175 للموقع و54365 لقاعدة البيانات المحلية. بعد تعديل الواجهة استخدم `npm run build:local` ثم أعد تشغيل المعاينة. للتطوير مع التحديث التلقائي استخدم `npm run dev` بعد إغلاق النسخة العاملة.

صفحة الإدارة في `/admin`. بيانات دخول المدير التجريبي محفوظة في `.local/admin.json` على الجهاز، والمجلد `.local` مستثنى من git. تحفظ قاعدة البيانات والملفات المرفوعة وحسابات الاختبار داخل `.local`. يبدأ المشروع بكتالوج المنصة ووسائطها ومحتواها العام. اختبارات المتصفح تستخدم حسابات وطلبات محلية.

## مكونات المشروع

- بُنيت الواجهة الرئيسية وشريط التنقل ومكتبة الأدوات وواجهة الخدمات المؤسسية في `src/studio`. تعتمد البطاقات والمرشحات على كتالوج قاعدة البيانات.
- احتفظت النسخة بمشهد لوحة التحوّل الأصلي في `src/themes/transformation-board`، وبجولة أرشي وملفات النموذج الثلاثي الأبعاد والفيلم. أُعيد استخدام منطق الطلبات والإيصالات والمفضلة والمقارنة والإدارة والدردشة حفاظًا على سلوك الخدمات.
- يستخدم التشغيل المحلي PostgreSQL عبر محاكي Tinbase ويدعم عميل Supabase نفسه. يبني `scripts/local.mjs` قاعدة معزولة من `local-backend/supabase/migrations`، ويجهّز حاويتين خاصتين ويرفع وسائط البداية من `local-backend/media`، ويحفظ مفاتيح محلية منفصلة في `.local`.
- النشرة البريدية وتجارب الفرق تحتاج اتصال Postgres مباشرًا (`POSTGRES_URL`)، فلا تعمل في التشغيل المحلي وتظهر غير متاحة.
- عند غياب مفتاح مزوّد توليدي، يبحث أرشي محليًا في أوصاف الأدوات باستخدام نموذج MiniLM متعدد اللغات. يردّ بالأدوات المتاحة ووصفها من الكتالوج. يدعم المشروع أيضًا الاتصال بمزوّد محادثة متوافق مع OpenAI من إعدادات الإدارة.
- تعرض صفحة `design-lab.html` ثلاث أفكار مستقبلية متحركة. لكل معاينة زر تشغيل وإيقاف، وتراعي المعاينات تفضيل تقليل الحركة.

## إعداد جهاز تطوير جديد

المتطلبات Node.js 24 أو أحدث وBun وgit. نفّذ من مجلد المشروع:

```sh
bun install --frozen-lockfile
npm --prefix local-backend ci --include=optional
node scripts/prepare-model.mjs
npm run build:local
npm start
```

قبل الفحص والدمج شغّل `npx tsc --noEmit` و`npm run lint` و`npm test`.

لإنشاء حساب المدير على قاعدة محلية جديدة، نفّذ `node scripts/local-admin.mjs` أثناء تشغيل التطبيق. يحمل إعداد النموذج الأوزان مرة واحدة. تُنفّذ الاستدلالات التالية على الجهاز. [بطاقة النموذج](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)

## النشر لاحقًا

أمر بناء الاستضافة هو `npm run build`. عند البناء داخل Vercel يختار Nitro إعداد Vercel تلقائيًا، ويشغّل `vercel.json` اختبارات الإصدار قبل البناء. كل متغيرات البيئة موثّقة في [`.env.example`](.env.example) مع تمييز العام من السري. الحد الأدنى للتشغيل: `VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY` عند البناء، و`SUPABASE_URL` و`SUPABASE_PUBLISHABLE_KEY` و`SUPABASE_SERVICE_ROLE_KEY` للخادم. يُفضَّل ضبط `APP_ENCRYPTION_KEY` مستقلًا عن مفتاح الخدمة.

يجدول `vercel.json` مهمتين يوميتين: النشرة البريدية `/api/public/jobs/newsletter` (06:00 UTC) والتنظيف وسياسات الاحتفاظ `/api/public/jobs/daily-cleanup` (02:30 UTC). ترسل Vercel الترويسة `Authorization: Bearer $CRON_SECRET`، فاضبط `CRON_SECRET` وإلا رُفضت المهمتان.

ملفات الـ migrations في `drizzle/migrations` هي المرجع للإنتاج، وكل ملف مسجّل في `meta/_journal.json`. ابتداءً من `0076` يُنسخ كل ملف أيضًا إلى `local-backend/supabase/migrations` برقم تالٍ، ويتحقق `src/test/migrations-consistency.test.ts` من ذلك. للتطبيق على قاعدة بعيدة: `DATABASE_MIGRATION_URL=... npx drizzle-kit migrate`.

ملف النموذج وقاعدة الاختبار وبيانات المدير وملف `scripts/local.mjs` مستثناة من رفع Vercel.

## صورة الغلاف

حُفظت صورة الغلاف التي ولّدتها أداة توليد الصور المدمجة في `public/studio/robotics-lab.webp`. استُخدم الوصف التالي:

> Wide editorial photograph, 21:9 composition for an enterprise architecture and machine intelligence studio. Left and center: a single intricately engineered graphite and brushed titanium industrial robot arm with warm amber joints and an articulated precision gripper hovering over a translucent miniature three-dimensional architectural circuit-board city under construction. Low three-quarter isometric camera, long lens, sharp fine machining, ceramic joints, restrained orange copper light paths, subtle cool teal reflected highlights, matte dark-teal studio laboratory background. Intentional generous near-black teal negative space on the right third for later text. High-end professional technical photography, believable materials and studio lighting, high local contrast, no text, no lettering, no labels, no logos, no people, no watermark.
