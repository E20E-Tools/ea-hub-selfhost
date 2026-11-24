import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { pageUrl } from "@/lib/seo";
import { shareImageMeta } from "@/lib/share";
import { ALL_CATEGORIES } from "@/lib/catalog";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { StudioHome } from "@/studio/home";

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; cat?: string; archyTour?: string | undefined } => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
    cat: typeof search["cat"] === "string" ? search["cat"] : ALL_CATEGORIES,
    archyTour:
      search["archyTour"] === 1 || search["archyTour"] === "1"
        ? "1"
        : undefined,
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions),
  errorComponent: LibraryError,
  notFoundComponent: LibraryNotFound,
  head: () => ({
    meta: [
      { title: "E20E Tools | أدوات البنية المؤسسية — Enterprise architecture tools" },
      {
        name: "description",
        content:
          "مكتبة أدوات E20E للبنية المؤسسية وإدارة التقنيات. Explore E20E tools for enterprise architecture and technology management.",
      },
      { property: "og:title", content: "E20E Tools | Enterprise architecture tools" },
      {
        property: "og:description",
        content:
          "Enterprise architecture and technology management tools in one library.",
      },
      { property: "og:url", content: pageUrl("/") },
      { property: "og:type", content: "website" },
      ...shareImageMeta("home"),
    ],
    links: [{ rel: "canonical", href: pageUrl("/") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "E20E Tools",
              url: pageUrl("/"),
              email: "ea@e20e.tools",
            },
            {
              "@type": "WebSite",
              name: "E20E Tools",
              url: pageUrl("/"),
              inLanguage: ["ar", "en"],
            },
          ],
        }),
      },
    ],
  }),
  component: StudioHome,
});

function LibraryError() {
  const { t, dir } = useLanguage();
  return (
    <main className="library-empty" dir={dir}>
      <h1>{t("pubLoadErrorTitle")}</h1>
      <p>{t("pubLoadErrorBody")}</p>
      <Button asChild>
        <a href="/">{t("pubRetry")}</a>
      </Button>
    </main>
  );
}

function LibraryNotFound() {
  const { t, dir } = useLanguage();
  return (
    <main className="library-empty" dir={dir}>
      <h1>{t("pubNotFoundTitle")}</h1>
      <Button asChild>
        <Link to="/">{t("pubBackHome")}</Link>
      </Button>
    </main>
  );
}
