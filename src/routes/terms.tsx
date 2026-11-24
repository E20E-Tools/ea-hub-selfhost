import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, ScrollText } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { parseTerms, termsText } from "@/lib/terms";
import { FeatureGate } from "@/components/feature-gate";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of service — E20E Tools | شروط الخدمة" },
      {
        name: "description",
        content:
          "Terms for using E20E Tools, its requests and enterprise services. شروط استخدام المنصة.",
      },
      { property: "og:title", content: "Terms of service — E20E Tools | شروط الخدمة" },
      {
        property: "og:description",
        content: "The terms that govern E20E Tools. شروط خدمة منصة E20E Tools.",
      },
      { property: "og:url", content: pageUrl("/terms") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/terms") }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  component: TermsPage,
  errorComponent: () => <main className="library-page p-10">Unavailable</main>,
  notFoundComponent: () => <main className="library-page p-10">Not found</main>,
});

function TermsPage() {
  return (
    <FeatureGate featureKey="terms">
      <TermsContent />
    </FeatureGate>
  );
}

function TermsContent() {
  const { dir, language, t } = useLanguage();
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const lang = language === "en" ? "en" : "ar";
  const blocks = parseTerms(termsText(catalog.settings.terms, lang));
  const updated = catalog.settings.terms.updatedAt;
  const updatedText = updated
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", { dateStyle: "long" }).format(
        new Date(updated),
      )
    : "";
  const anchor = (i: number) => `terms-${i + 1}`;

  return (
    <main className="library-page ea-workspace ea-terms" dir={dir}>
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header className="mb-10 border-b border-border pb-8">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <ScrollText size={16} aria-hidden="true" /> {t("termsEyebrow")}
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{t("termsPageTitle")}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{t("termsLead")}</p>
          {updatedText ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("termsUpdated")} {updatedText}
            </p>
          ) : null}
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <nav
            aria-label={t("termsContents")}
            className="rounded-xl border border-border bg-card p-5 text-card-foreground lg:sticky lg:top-24"
          >
            <h2 className="mb-3 text-sm font-semibold">{t("termsContents")}</h2>
            <ol className="grid gap-1 text-sm">
              {blocks.map((b, i) =>
                b.title ? (
                  <li key={i}>
                    <a
                      href={`#${anchor(i)}`}
                      className="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {b.title}
                    </a>
                  </li>
                ) : null,
              )}
            </ol>
          </nav>

          <article className="grid min-w-0 gap-4">
            {blocks.map((b, i) => (
              <section
                key={i}
                id={anchor(i)}
                className="scroll-mt-24 rounded-xl border border-border bg-card p-6 text-card-foreground"
              >
                {b.title ? <h2 className="mb-3 text-lg font-semibold">{b.title}</h2> : null}
                {b.paragraphs.map((p, j) => (
                  <p key={j} className="mt-2 leading-8 text-muted-foreground first:mt-0">
                    {p}
                  </p>
                ))}
              </section>
            ))}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-5">
              <span className="font-medium">{t("termsQuestions")}</span>
              <Link
                to="/contact"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                {t("termsContact")}
                <ArrowUpRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
              </Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
