import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — E20E Tools | سياسة الخصوصية" },
      {
        name: "description",
        content:
          "What E20E Tools collects, why, and how to ask for it to be deleted. ما الذي نجمعه ولماذا وكيف تطلب حذفه.",
      },
      { property: "og:title", content: "Privacy policy — E20E Tools | سياسة الخصوصية" },
      { property: "og:url", content: pageUrl("/privacy") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/privacy") }],
  }),
  component: PrivacyPage,
});

type Section = { title: string; body: string[] };

const CONTACT = "ea@e20e.tools";

const sections: Record<"ar" | "en", Section[]> = {
  ar: [
    {
      title: "ما الذي نجمعه",
      body: [
        "عند إرسال طلب أو رسالة: الاسم والبريد الإلكتروني، واسم الجهة إن أضفته، ورقم الهاتف لطلبات الدعم الفني، ونص الطلب والصور التي ترفقها.",
        "عند محادثة Archy: نص المحادثة، لنتمكّن من الرد ومتابعة طلبك.",
        "عند الاشتراك في النشرة: بريدك الإلكتروني ولغتك، بعد تأكيدك الاشتراك من رسالة التأكيد.",
        "عدّاد الزيارات يحسب كل متصفح مرة واحدة يوميًا بتوقيت الرياض، ولا يحفظ عنوان IP ولا هويتك.",
      ],
    },
    {
      title: "لماذا نستخدمها",
      body: [
        "للرد على طلبك وتنفيذه ومتابعته معك، ولتحسين الأدوات بناءً على الطلبات الواردة.",
        "لا نبيع بياناتك ولا نشاركها لأغراض إعلانية.",
      ],
    },
    {
      title: "الإحصاءات المجهولة",
      body: [
        "نحسب خطوات الاستخدام بشكل إجمالي مجهول الهوية فقط إذا سمحت بذلك. يمكنك إيقافها من «تفضيلات المسودة والخصوصية» في نموذج الطلب.",
        "إذا كان متصفحك يرسل إشارة Global Privacy Control أو Do Not Track فلا نحسب شيئًا.",
      ],
    },
    {
      title: "ما يُحفظ في متصفحك",
      body: [
        "الأدوات المحفوظة والمقارنات واللغة والمظهر ومسودات النماذج تُحفظ في متصفحك فقط، ولا تصلنا. يمكنك حذفها بمسح بيانات الموقع من المتصفح.",
      ],
    },
    {
      title: "مزودو الخدمة",
      body: [
        "نستضيف الموقع وقاعدة البيانات لدى مزودي خدمات سحابية، ونرسل نص محادثة Archy إلى مزود نموذج الذكاء الاصطناعي لتوليد الرد.",
      ],
    },
    {
      title: "حقوقك",
      body: [
        `يمكنك طلب نسخة من بياناتك أو تصحيحها أو حذفها بمراسلتنا على ${CONTACT}.`,
      ],
    },
  ],
  en: [
    {
      title: "What we collect",
      body: [
        "When you send a request or message: your name and email, your organisation if you add it, a phone number for technical support requests, and the text and images you attach.",
        "When you chat with Archy: the conversation text, so we can reply and follow up on your request.",
        "When you subscribe to the newsletter: your email and language, after you confirm from the confirmation email.",
        "The visitor counter counts each browser once a day on Riyadh time and stores no IP address or identity.",
      ],
    },
    {
      title: "Why we use it",
      body: [
        "To answer, carry out and follow up on your request, and to improve the tools based on what people ask for.",
        "We do not sell your data or share it for advertising.",
      ],
    },
    {
      title: "Anonymous statistics",
      body: [
        "We count usage steps in aggregate, without identity, only if you allow it. You can switch this off under “Draft and privacy preferences” on the request form.",
        "If your browser sends Global Privacy Control or Do Not Track, we count nothing.",
      ],
    },
    {
      title: "Stored in your browser",
      body: [
        "Saved tools, comparisons, language, appearance and form drafts stay in your browser and never reach us. Clear the site's data in your browser to remove them.",
      ],
    },
    {
      title: "Service providers",
      body: [
        "The site and database are hosted with cloud providers, and Archy conversation text is sent to an AI model provider to generate replies.",
      ],
    },
    {
      title: "Your rights",
      body: [`You can ask for a copy of your data, a correction, or deletion by emailing ${CONTACT}.`],
    },
  ],
};

function PrivacyPage() {
  const { dir, language } = useLanguage();
  const lang = language === "en" ? "en" : "ar";
  const ar = lang === "ar";
  return (
    <main className="library-page ea-workspace ea-terms" dir={dir}>
      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-10 border-b border-border pb-8">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck size={16} aria-hidden="true" /> {ar ? "الخصوصية" : "Privacy"}
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">
            {ar ? "سياسة الخصوصية" : "Privacy policy"}
          </h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            {ar
              ? "ما الذي نجمعه عند استخدامك E20E Tools، ولماذا، وكيف تطلب حذفه."
              : "What we collect when you use E20E Tools, why, and how to ask for it to be deleted."}
          </p>
        </header>
        <div className="grid gap-8">
          {sections[lang].map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
              <ul className="grid list-disc gap-2 ps-5 leading-8">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm text-muted-foreground">
            {ar ? "للتواصل بشأن الخصوصية: " : "Privacy questions: "}
            <a href={`mailto:${CONTACT}`} dir="ltr" className="underline">
              {CONTACT}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
