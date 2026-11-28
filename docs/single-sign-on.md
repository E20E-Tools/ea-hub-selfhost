# الدخول الموحد (OpenID Connect)

يمكن تسجيل الدخول إلى EA-Hub بحساب المؤسسة عبر أي مزوّد OpenID Connect، مثل Microsoft Entra ID (Azure AD) وKeycloak وOkta وAuth0 وGoogle Workspace وAuthentik وPing. يبقى الدخول بكلمة المرور متاحاً بجانبه.

عند تفعيل الدخول الموحد، يظهر في صفحة دخول المدير زر **Sign in with your organisation account**.

> النسخة الإنجليزية: [en/single-sign-on.md](en/single-sign-on.md)

## كيف يُقرَّر من يدخل

| الشخص | ما يحدث عند الدخول |
|---|---|
| نطاق بريده ليس في `OIDC_ALLOWED_DOMAINS` (عند ضبط هذه القائمة) | يُرفض |
| بريده الموثَّق مذكور في `OIDC_ADMIN_EMAILS`، أو هو عضو في مجموعة مذكورة في `OIDC_ADMIN_GROUPS` | يدخل، ويُنشأ حسابه إن لم يكن موجوداً، ويحصل على دور **المدير** |
| لديه حساب في EA-Hub بالبريد الموثَّق نفسه | يدخل إلى ذلك الحساب، وتبقى أدواره كما هي |
| أي شخص آخر | يُرفض، إلا إن ضُبط `OIDC_AUTO_CREATE=true` **مع** `OIDC_ALLOWED_DOMAINS`، فيُنشأ له حساب بلا أدوار |

قواعد أخرى:

- **البريد الموثَّق فقط:** لا يستخدم EA-Hub عنوان البريد لإيجاد حساب أو إنشائه إلا إن أكّده المزوّد. يقبل أحد أمرين:
  - القيمة `email_verified` مساوية لـ `true`.
  - القيمة `xms_edov` في Microsoft Entra ID مساوية لـ `true`، أي أن نطاق البريد موثَّق في مستأجرك (tenant).
- **البريد غير الموثَّق:** إن لم يرسل مزوّدك أياً منهما، يمكنك ضبط `OIDC_REQUIRE_VERIFIED_EMAIL=false`، لكن مع `OIDC_ALLOWED_DOMAINS` فقط. عندها:
  - لا يُربط البريد غير الموثَّق بأي حساب موجود.
  - لا يطابق `OIDC_ADMIN_EMAILS`، فلا يمنح دور المدير إلا `OIDC_ADMIN_GROUPS`.
- **حدّد النطاقات:** اضبط دائماً `OIDC_ALLOWED_DOMAINS` على نطاقات مؤسستك. هذا مهم خاصة مع المزوّدين المشتركين مثل Google (`https://accounts.google.com`)، الذي يسمح بدخول **أي** حساب Google.
- **صلاحيات المدير تُضاف ولا تُسحب تلقائياً:** لسحبها، احذف الدور من داخل EA-Hub.
- **إيقاف موظف:** إيقاف الشخص عند المزوّد يمنع الدخول الجديد فوراً، لكن جلسته المفتوحة في EA-Hub تبقى حتى ينتهي رمز التحديث، أي حتى 30 يوماً. لإنهائها فوراً، أوقف المستخدم أو احذف حسابه من EA-Hub.
- **فحوص الأمان:**
  - يتم الدخول بتدفق authorization code مع PKCE و`state` و`nonce`.
  - يُتحقق من توقيع رمز الهوية بمفاتيح المزوّد المنشورة، ومن المُصدِر والجمهور وتاريخ الانتهاء.
  - عنوان الرجوع ثابت على `APP_URL`.

## 1. سجّل EA-Hub عند المزوّد

يحتاج كل مزوّد إلى ثلاثة أمور:

- **نوع التطبيق:** تطبيق ويب (confidential client) بتدفق authorization code.
- **عنوان الرجوع (Redirect URI):** `https://<عنوان EA-Hub>/api/selfhost/auth/oidc/callback`، مثل `https://hub.example.com/api/selfhost/auth/oidc/callback`.
- **النطاقات (Scopes):** `openid email profile`، مع إضافة بيانات المجموعات إن كنت ستستخدم `OIDC_ADMIN_GROUPS`.

احتفظ بـ **رابط المُصدِر (issuer)** و**معرّف العميل (client ID)** و**سر العميل (client secret)**.

| المزوّد | رابط المُصدِر | ملاحظات |
|---|---|---|
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | **App registrations ← New registration** بمنصة **Web**، ثم أضف client secret. من **Token configuration ← Add optional claim ← ID** أضف `email` و`xms_edov`. للمجموعات استخدم **Add groups claim**. يرسل Entra **معرّفات** المجموعات (object IDs)، فضعها في `OIDC_ADMIN_GROUPS` |
| Keycloak | `https://<keycloak>/realms/<realm>` | أنشئ client مع تفعيل **Client authentication** و**Standard flow**. للمجموعات أضف mapper من نوع **Group Membership** باسم `groups`، مع إلغاء **Full group path** |
| Okta | `https://<your-org>.okta.com` (أو رابط خادم تفويض مخصص) | أنشئ **OIDC – Web Application**. للمجموعات أضف قيمة `groups` إلى ID token |
| Google Workspace | `https://accounts.google.com` | أنشئ **OAuth client ID** من نوع **Web application**. لا ترسل Google المجموعات، فاستخدم `OIDC_ADMIN_EMAILS` |
| Authentik | `https://<authentik>/application/o/<app-slug>` | أنشئ **OAuth2/OpenID Provider** بنوع عميل **Confidential** |

## 2. اضبط EA-Hub

**Docker Compose:** أضف ما يلي إلى `.env`، ثم شغّل `docker compose up -d`:

```bash
OIDC_ISSUER=https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0
OIDC_CLIENT_ID=11111111-1111-1111-1111-111111111111
OIDC_CLIENT_SECRET=<client secret>
OIDC_ALLOWED_DOMAINS=yourcompany.com
OIDC_ADMIN_EMAILS=you@yourcompany.com
OIDC_ADMIN_GROUPS=                     # optional
```

**Helm:**

```yaml
sso:
  oidc:
    issuer: https://kc.example.com/realms/acme
    clientId: ea-hub
    clientSecret: "<client secret>"     # or key oidc-client-secret in secrets.existingSecret
    allowedDomains: acme.com
    adminGroups: ea-admins
    # adminEmails: you@acme.com
```

**منصات Container-as-a-Service:** اضبط متغيرات `OIDC_*` نفسها، واحفظ `OIDC_CLIENT_SECRET` في مخزن الأسرار الخاص بالمنصة.

## 3. جرّبه

افتح `https://<عنوانك>/admin`، واضغط **Sign in with your organisation account**. بعد صفحة دخول المزوّد تعود إلى لوحة التحكم.

## كل الإعدادات

| المتغير | قيمة Helm | الافتراضي | المعنى |
|---|---|---|---|
| `OIDC_ISSUER` | `sso.oidc.issuer` | – | رابط مُصدِر المزوّد. يقرأ EA-Hub منه `<issuer>/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` | `sso.oidc.clientId` | – | معرّف العميل |
| `OIDC_CLIENT_SECRET` | `sso.oidc.clientSecret` | – | سر العميل، ويُرسل بمصادقة HTTP Basic إلى نقطة الرموز |
| `OIDC_SCOPES` | `sso.oidc.scopes` | `openid email profile` | النطاقات المطلوبة |
| `OIDC_BUTTON_LABEL` | `sso.oidc.buttonLabel` | `Sign in with your organisation account` | نص الزر |
| `OIDC_ADMIN_EMAILS` | `sso.oidc.adminEmails` | – | عناوين بريد يحصل أصحابها على دور المدير، مفصولة بفواصل |
| `OIDC_ADMIN_GROUPS` | `sso.oidc.adminGroups` | – | مجموعات يحصل أعضاؤها على دور المدير، مفصولة بفواصل |
| `OIDC_GROUPS_CLAIM` | `sso.oidc.groupsClaim` | `groups` | اسم الحقل في ID token الذي يحتوي على المجموعات |
| `OIDC_ALLOWED_DOMAINS` | `sso.oidc.allowedDomains` | – | نطاقات البريد المسموح لها بالدخول، مفصولة بفواصل (موصى به) |
| `OIDC_AUTO_CREATE` | `sso.oidc.autoCreate` | `false` | إنشاء حساب بلا أدوار لأي شخص من `OIDC_ALLOWED_DOMAINS` |
| `OIDC_REQUIRE_VERIFIED_EMAIL` | `sso.oidc.requireVerifiedEmail` | `true` | اشتراط أن تكون `email_verified` (أو `xms_edov` في Entra) مساوية لـ `true` |

## حل المشكلات

| الرسالة في صفحة الدخول | السبب |
|---|---|
| *ليس لحساب مؤسستك صلاحية دخول EA-Hub بعد* | الشخص ليس لديه حساب في EA-Hub وليس مذكوراً كمدير، أو نطاق بريده ليس في `OIDC_ALLOWED_DOMAINS`. أنشئ له حساباً في EA-Hub، أو أضفه إلى القائمة |
| *لم تؤكد مؤسستك عنوان بريدك* | رمز الهوية لا يحتوي على `email_verified=true` ولا `xms_edov=true`. في Entra ID أضف الحقل الاختياري `xms_edov` |
| *لم يكتمل الدخول الموحد* | ابحث في سجلات التطبيق عن `[selfhost] SSO sign-in failed:`. الأسباب الشائعة: عنوان رجوع لا يطابق `APP_URL`، أو سر عميل خاطئ، أو فرق في الساعة أكثر من دقيقتين |
| *الدخول الموحد غير متاح حالياً* | لم يستطع EA-Hub الوصول إلى `<issuer>/.well-known/openid-configuration`. تحقق من رابط المُصدِر ومن اتصال الخادم بالإنترنت |
