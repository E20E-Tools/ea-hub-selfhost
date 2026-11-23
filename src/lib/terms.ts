/**
 * Terms of service text (browser-safe). The admin edits it in "Design customisation";
 * an empty saved value falls back to the draft below. Format: lines starting with "## "
 * are section titles, blank lines separate paragraphs.
 */
import { z } from "zod";

export const TERMS_MAX = 20000;

export type TermsContent = { ar: string; en: string; updatedAt: string };

export const DEFAULT_TERMS_AR = `## 1. القبول
باستخدامك منصة E20E Tools (الموقع والأدوات والنماذج) فإنك توافق على هذه الشروط. إذا لم توافق عليها فيُرجى عدم استخدام المنصة.

## 2. الخدمات
تعرض المنصة أدوات متخصصة في البنية المؤسسية وإدارة التقنيات، وتستقبل طلبات الأدوات والتحسينات والدعم وخدمات المؤسسات. وصف الأدوات ومواعيد إطلاقها للعلم فقط وقد تتغير.

## 3. الطلبات والنماذج
عند إرسال طلب تلتزم بأن تكون البيانات صحيحة وأن تملك حق مشاركتها. إرسال الطلب لا يعني قبوله؛ يتواصل معك الفريق لتحديد النطاق والتكلفة والمدة كتابيًا قبل أي التزام.

## 4. خدمات المؤسسات
تُنفَّذ خدمات التنفيذ والتطبيق والتدريب والدعم الفني وفق اتفاق أو عرض مكتوب منفصل يحدد النطاق والمقابل، ويغلب ذلك الاتفاق على هذه الشروط عند التعارض.

## 5. الاستخدام المقبول
يُمنع إساءة استخدام المنصة، أو محاولة الوصول غير المصرّح به، أو تعطيلها، أو رفع محتوى مخالف أو ضار.

## 6. الملكية الفكرية
الأدوات والشعارات والمحتوى ملك لأصحابها. لا يحق نسخها أو إعادة نشرها إلا بإذن أو وفق ترخيص الأداة المعلن.

## 7. البيانات الشخصية
نستخدم البيانات التي ترسلها للرد على طلبك وتقديم الخدمة فقط، ولا نبيعها لأي طرف، وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.

## 8. حدود المسؤولية
تُقدَّم المنصة «كما هي». لا نتحمل مسؤولية الأضرار غير المباشرة الناتجة عن استخدامها، في حدود ما يسمح به النظام.

## 9. التعديلات
قد نحدّث هذه الشروط، ويظهر تاريخ آخر تحديث أعلى الصفحة. استمرارك في الاستخدام يعني قبول التحديث.

## 10. النظام الحاكم
تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص محاكمها بأي نزاع ينشأ عنها.`;

export const DEFAULT_TERMS_EN = `## 1. Acceptance
By using E20E Tools (the website, tools and forms) you agree to these terms. If you do not agree, please do not use the platform.

## 2. Services
The platform presents specialised enterprise architecture and technology management tools, and receives requests for tools, improvements, support and enterprise services. Tool descriptions and launch dates are for information and may change.

## 3. Requests and forms
When you send a request, the information must be accurate and yours to share. Sending a request does not mean it is accepted; the team will agree scope, cost and timing with you in writing before any commitment.

## 4. Enterprise services
Implementation, rollout, training and technical support are delivered under a separate written agreement or quotation that sets scope and fees; that agreement prevails over these terms if they conflict.

## 5. Acceptable use
Do not misuse the platform, attempt unauthorised access, disrupt it, or upload unlawful or harmful content.

## 6. Intellectual property
Tools, logos and content belong to their owners. They may not be copied or republished without permission or the tool's published licence.

## 7. Personal data
We use the information you send only to answer your request and deliver the service, never sell it, and handle it under the Personal Data Protection Law of the Kingdom of Saudi Arabia.

## 8. Limitation of liability
The platform is provided "as is". To the extent the law allows, we are not liable for indirect damages arising from its use.

## 9. Changes
We may update these terms; the last-updated date appears at the top of the page. Continuing to use the platform means you accept the update.

## 10. Governing law
These terms are governed by the laws of the Kingdom of Saudi Arabia, and its courts have jurisdiction over any dispute.`;

export const termsSchema = z.object({
  ar: z.string().max(TERMS_MAX),
  en: z.string().max(TERMS_MAX),
});

export function normalizeTerms(value: unknown): TermsContent {
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, TERMS_MAX) : "");
  return { ar: str(v["ar"]), en: str(v["en"]), updatedAt: str(v["updatedAt"]) };
}

/** Saved text for a language, falling back to Arabic, then to the built-in draft. */
export function termsText(terms: TermsContent, language: "ar" | "en"): string {
  if (language === "en") return terms.en.trim() || DEFAULT_TERMS_EN;
  return terms.ar.trim() || DEFAULT_TERMS_AR;
}

export type TermsBlock = { title: string; paragraphs: string[] };

export function parseTerms(text: string): TermsBlock[] {
  const blocks: TermsBlock[] = [];
  let current: TermsBlock | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      if (!current) blocks.push((current = { title: "", paragraphs: [] }));
      current.paragraphs.push(para.join(" "));
    }
    para = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flush();
      blocks.push((current = { title: line.slice(3).trim(), paragraphs: [] }));
    } else if (!line) flush();
    else para.push(line);
  }
  flush();
  return blocks;
}
