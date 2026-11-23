import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Info, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { FeatureGate } from "@/components/feature-gate";
import { IntroVideoCard } from "@/components/intro-video";
import { PlatformMark } from "@/components/platform-mark";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { featureEnabled } from "@/lib/site-features";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "About E20E Tools — Built by EA, for EA | من نحن" },
      {
        name: "description",
        content:
          "Who we are: E20E Tools brings enterprise architecture and technology management tools together. Watch the one-minute introduction. Available in Arabic and English.",
      },
      {
        property: "og:title",
        content: "About E20E Tools — Built by EA, for EA",
      },
      {
        property: "og:description",
        content:
          "Our mission, what we offer and the platform's tools, with a one-minute introduction video.",
      },
      { property: "og:url", content: pageUrl("/about") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/about") }],
  }),
  component: About,
});

const scenarios: Record<string, { image: string; ar: [string, string]; en: [string, string] }> = {
  archone: {
    image: "/__l5e/assets-v1/901c8a9b-5dbd-4f86-8fa5-181674e46db9/archone-transformation-board.jpg",
    ar: ["ما أثر تغيير هذه العملية؟", "اربط العملية بالقدرات والتطبيقات التي تدعمها لتحديد ما يحتاج إلى مراجعة قبل التغيير."],
    en: ["What would a process change affect?", "Trace a process to the capabilities and applications that support it before deciding what to change."],
  },
  landscape: {
    image: "/images/decisions/application-overlap.webp",
    ar: ["أين تتكرر التطبيقات؟", "اربط التطبيقات بالقدرات التي تدعمها لتكتشف التداخل قبل الاستثمار في تطبيق جديد."],
    en: ["Where do applications overlap?", "Map applications to the capabilities they support before investing in another tool."],
  },
  radar: {
    image: "/images/decisions/technology-radar.webp",
    ar: ["أي تقنية تستحق التجربة؟", "سجّل موقف الفريق من كل تقنية وسبب القرار، ثم راجعه في الاجتماع القادم."],
    en: ["Which technology should we trial?", "Record the team’s position on each technology and revisit the reasoning at your next review."],
  },
};

function About() {
  const { language, dir, t } = useLanguage();
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const products = catalog.products.map((item) =>
    localizedProduct(item, language),
  );
  const ar = language === "ar";
  const available = products.filter((product) => !product.comingSoon).length;
  const showRoadmap = featureEnabled(catalog.settings.featureFlags, "roadmap");
  const stats = [
    { value: products.length, label: t("aboutStatTools") },
    { value: available, label: t("aboutStatAvailable") },
    { value: products.length - available, label: t("aboutStatSoon") },
    { value: 2, label: t("aboutStatLanguages") },
  ];

  return (
    <FeatureGate featureKey="blog">
      <main className="roadmap-page about-page ea-workspace ea-about" dir={dir}>
        <header className="about-hero">
          <div className="about-hero-copy">
            <PlatformMark />
            <span className="about-eyebrow">
              <Info size={16} aria-hidden="true" />
              {t("aboutEyebrow")}
            </span>
            <h1>
              {ar
                ? "أدوات معمارية المؤسسات من واقع عمل المعماريين"
                : "Enterprise architecture tools built by practising architects"}
            </h1>
            <p>
              {ar
                ? "نساعد فرق المعمارية والتقنية على فهم محفظة التطبيقات واتخاذ قرارات تقنية يمكن توضيح أسبابها ومراجعتها."
                : "We help architecture and technology teams understand their application portfolios and make technology decisions they can explain and revisit."}
            </p>
            <div className="about-actions">
              <Button asChild>
                <a href="/#catalog">{t("requestBrowse")}</a>
              </Button>
              <Button asChild variant="outline">
                <Link to="/request" search={{ type: "new" }}>
                  {t("requestCta")}
                </Link>
              </Button>
            </div>
          </div>
          <IntroVideoCard />
        </header>

        <section className="about-stats" aria-label={t("aboutStatsLabel")}>
          <dl>
            {stats.map((stat) => (
              <div key={stat.label}>
                <dd>{stat.value}</dd>
                <dt>{stat.label}</dt>
              </div>
            ))}
          </dl>
        </section>

        <section className="about-section">
          <h2>
            {ar ? "أي قرار تواجهه اليوم؟" : "What decision are you facing?"}
          </h2>
          <div className="about-purpose">
            {products.map((product) => {
              const scenario = scenarios[product.id];
              if (!scenario) return null;
              const copy = scenario[language];
              return (
                <article className="about-card" key={product.id}>
                  <img className="ea-decision-image" loading="lazy" decoding="async"
                    src={scenario.image} alt="" width={900} height={500} />
                  <small><bdi>{product.name}</bdi></small>
                  <h3>{copy[0]}</h3>
                  <p>{copy[1]}</p>
                  <div className="about-tool-links">
                    <a href={"/product/" + encodeURIComponent(product.id)}>{ar ? "استكشف" : "Explore"} {product.name}</a>
                    {!product.comingSoon && /^https?:\/\//i.test(product.url) && (
                      <a href={product.url}>{ar ? "افتح الأداة" : "Launch tool"} ↗</a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <Link to="/discover">
            {ar ? "ساعدني في اختيار أداة" : "Help me choose a tool"} →
          </Link>
        </section>
        <section className="about-section" aria-labelledby="archy-services-report">
          <h2 id="archy-services-report">{ar ? "كيف يساعدك Archy؟" : "How can Archy help?"}</h2>
          <p>{ar ? "اطّلع على خدمات المحادثة ومراجعة بطاقات العمل وتلخيص تجارب الفريق، وكيف تتحكم المنصة في مشاركة البيانات." : "Explore tool guidance, work card reviews and team trial summaries, including how data sharing is controlled."}</p>
          <a className="underline" href="/guide/EA-Hub-AI-Services-AR.pdf">{ar ? "تقرير خدمات الذكاء الاصطناعي (PDF بالعربية)" : "AI services report (PDF in Arabic)"}</a>
        </section>
        <details className="about-section about-card" id="decision-record">
          <summary>{ar ? "من سجل المنصة: تحديث حالة إطلاق ArchONE" : "Platform notes: updating the ArchONE launch status"}</summary>
          <p>{ar?"عند مراجعة الإطلاق، كان رابط ArchONE يفتح لوحة المنتج، بينما ظل الدليل يعرض حالة «قريبًا». تحقّق الفريق من رابط التشغيل ثم حدّث سجل المنتج الذي تستخدمه صفحات الموقع. ويمكن الآن ضبط إتاحة التدريب والتنفيذ بصورة مستقلة عن حالة الإطلاق.":"During the launch review, ArchONE’s public URL opened its dashboard while the directory still showed Coming soon. The team verified the launch URL and updated the product record used by the site. Professional service availability can now be managed independently of the launch status."}</p>
          <a className="underline" href="/product/archone">{ar?"اطّلع على سجل المنتج الحالي":"View the current product record"} ↗</a> · <a className="underline" href="/archone-coming-soon">{ar?"تحقق من مسار صفحة الإطلاق السابقة":"Check the former launch-page route"} ↗</a>
        </details>
        <section className="about-cta" aria-labelledby="about-cta">
          <div>
            <h2 id="about-cta">{t("aboutCtaTitle")}</h2>
            <p>{t("aboutCtaBody")}</p>
          </div>
          <div className="about-actions">
            <Button asChild>
              <Link to="/request" search={{ type: "new" }}>
                <Send size={16} aria-hidden="true" />
                {t("requestCta")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/contact">
                <Mail size={16} aria-hidden="true" />
                {t("navContact")}
              </Link>
            </Button>
            {showRoadmap ? (
              <Button asChild variant="ghost">
                <Link to="/technology-roadmap">{t("navRoadmap")}</Link>
              </Button>
            ) : null}
          </div>
        </section>
      </main>
    </FeatureGate>
  );
}
