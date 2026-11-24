import { adminDictionaries, type AdminCopyKey } from "./admin-copy";
import { TAB_LABELS, type AdminTab } from "./admin-sections";
import { FEATURE_KEYS, FEATURE_LABELS } from "./site-features";
export const SETTINGS_SEARCH_ENTRIES: {
  tab: AdminTab;
  label: AdminCopyKey;
  control?: string;
  keywords: string;
}[] = [
  {
    tab: "general",
    label: "logo",
    control: "settings-logo",
    keywords: "logo image brandmark شعار لوجو",
  },
  {
    tab: "general",
    label: "siteName",
    control: "identity-name-ar",
    keywords: "identity brand title name هوية اسم عنوان",
  },
  {
    tab: "general",
    label: "tagline",
    control: "identity-tagline-ar",
    keywords: "tagline slogan السطر التعريفي",
  },
  {
    tab: "general",
    label: "footerText",
    control: "identity-footer-ar",
    keywords: "footer تذييل",
  },
  {
    tab: "archy",
    label: "tabArchy",
    control: "archy-voice",
    keywords: "archy robot greeting voice sound صوت ترحيب أرشي روبوت مساعد",
  },
  { tab: "ai", label: "settingsTestChat", control: "archy-test-input",
    keywords: "compare test chat replies Archy OpenAI local اختبار تجربة مقارنة المحادثة الردود ارشي البحث المحلي" },
  { tab: "ai", label: "settingsVisitorEngine", control: "archy-engine",
    keywords: "visitor engine provider Archy OpenAI local default محرك الزوار افتراضي ارشي البحث المحلي" },
  ...FEATURE_KEYS.map((key) => ({
    tab: "features" as const,
    label: `feature_${key}` as const,
    control: `feature-${key}`,
    keywords: `${key} ${FEATURE_LABELS[key].ar} ${FEATURE_LABELS[key].en} enable disable تفعيل تعطيل تشغيل إيقاف`,
  })),
  {
    tab: "ai",
    label: "aiBaseUrl",
    control: "ai-url",
    keywords: "provider endpoint integration مزود تكامل ذكاء",
  },
  { tab: "ai", label: "aiModel", control: "ai-model", keywords: "model نموذج" },
  {
    tab: "ai",
    label: "aiKey",
    control: "ai-key",
    keywords: "api key credential مفتاح اتصال",
  },
  {
    tab: "contact",
    label: "publicContact",
    control: "c-email",
    keywords: "public email contact site address بريد تواصل موقع عنوان",
  },
  {
    tab: "notifications",
    label: "recipientEmail",
    control: "n-email",
    keywords: "mail email notifications sender domain بريد إشعارات نطاق إرسال",
  },
  {
    tab: "navigation",
    label: "tabNavigation",
    keywords: "menu links navigation القائمة الرئيسية قائمة روابط تنقل الشريط العلوي ترتيب الأزرار header reorder buttons",
  },
  {
    tab: "appearance",
    label: "tabAppearance",
    control: "theme-anim",
    keywords: "theme animation motion font colors مظهر ألوان خطوط حركة تصميم",
  },
  {
    tab: "customize",
    label: "tabCustomize",
    keywords: "design customization تخصيص",
  },
  {
    tab: "terms",
    label: "termsTitle",
    keywords: "terms policy legal conditions شروط خدمة سياسة أحكام",
  },
  {
    tab: "status",
    label: "tabFeatureStatus",
    keywords: "service feature status availability حالة الخدمة الميزات",
  },
  {
    tab: "journey",
    label: "journeyMetrics",
    keywords: "journey analytics funnel conversion visitor تحليل قياسات زائر رحلة",
  },
  {
    tab: "testimonials",
    label: "tabTestimonials",
    keywords: "testimonials reviews شهادات آراء",
  },
  {
    tab: "history",
    label: "opsHistory",
    keywords: "rollback restore version history استعادة إصدارات سجل رجوع",
  },
  {
    tab: "retention",
    label: "opsRetention",
    keywords: "retention cleanup deletion data احتفاظ تنظيف حذف بيانات",
  },
  {
    tab: "health",
    label: "opsHealth",
    keywords: "health failures duration troubleshooting صحة إخفاق زمن أعطال",
  },
];
const normalize = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/ـ/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
export function searchSettings(query: string) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return words.length
    ? SETTINGS_SEARCH_ENTRIES.filter((e) =>
        words.every((w) =>
          normalize(
            `${adminDictionaries.ar[e.label]} ${adminDictionaries.en[e.label]} ${adminDictionaries.ar[TAB_LABELS[e.tab]]} ${adminDictionaries.en[TAB_LABELS[e.tab]]} ${e.keywords}`,
          ).includes(w),
        ),
      )
    : [];
}
