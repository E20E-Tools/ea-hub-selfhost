import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarRange, Layers, Table2, Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ALL_CATEGORIES,
  filterCatalog,
  localizedProduct,
  localizedSettings,
} from "@/lib/catalog";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import {
  buildTechnologyRoadmap,
  roadmapPhaseDetail,
  roadmapPhaseLabel,
  roadmapPeriods,
  ROADMAP_YEARS,
} from "@/lib/technology-roadmap";
import { quarterRanges } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import { FeatureGate } from "@/components/feature-gate";
import { useThemeArt } from "@/themes/use-theme-art";

import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/technology-roadmap")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "Technology roadmap 2026–2027 — E20E Tools | خارطة التقنيات" },
      {
        name: "description",
        content:
          "خارطة تبنّي مقترحة لجميع أدوات مكتبة E20E Tools خلال 2026 و2027، تشمل التخطيط والتجربة والتحسين. A suggested adoption roadmap for every E20E Tools library product across 2026 and 2027.",
      },
      {
        property: "og:title",
        content: "Technology roadmap 2026–2027 — E20E Tools",
      },
      {
        property: "og:description",
        content:
          "A proposed quarterly plan for adopting enterprise architecture and technology management tools.",
      },
      { property: "og:url", content: pageUrl("/technology-roadmap") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/technology-roadmap") }],
  }),
  component: TechnologyRoadmap,
});

function TechnologyRoadmap() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const art = useThemeArt();
  const { language, dir, t } = useLanguage();
  const settings = localizedSettings(catalog.settings, language);
  const list = catalog.products.map((product) =>
    localizedProduct(product, language),
  );
  const [year, setYear] = useState<number | undefined>();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const now = new Date();
  const currentPeriod =
    now.getUTCFullYear() + "-Q" + (Math.floor(now.getUTCMonth() / 3) + 1);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const periods = roadmapPeriods(year);
  const rows = buildTechnologyRoadmap(
    filterCatalog(list, query, category),
    year,
  );
  const available = catalog.products.filter(
    (product) => !product.comingSoon,
  ).length;

  return (
    <FeatureGate featureKey="roadmap">
      <main className="roadmap-page ea-workspace ea-roadmap" dir={dir}>
        <header className="roadmap-heading">
          <div>
            <span className="roadmap-eyebrow">
              <CalendarRange size={18} />
              <bdi>2026 — 2027</bdi>
            </span>
            <h1>{t("roadmapTitle")}</h1>
            <p>{t("roadmapLead")}</p>
          </div>
          <dl className="roadmap-stats">
            <div>
              <dt>{t("roadmapStatTechnologies")}</dt>
              <dd>{catalog.products.length}</dd>
            </div>
            <div>
              <dt>{t("roadmapStatAvailable")}</dt>
              <dd>{available}</dd>
            </div>
            <div>
              <dt>{t("comingSoonBadge")}</dt>
              <dd>{catalog.products.length - available}</dd>
            </div>
          </dl>
        </header>
        <section
          className="roadmap-controls"
          aria-label={t("roadmapFilterLabel")}
        >
          <div className="roadmap-search">
            <Search size={17} />
            <Input
              aria-label={t("roadmapSearchLabel")}
              placeholder={t("roadmapSearchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("clearSearch")}
                onClick={() => setQuery("")}
              >
                <X size={16} />
              </Button>
            )}
          </div>
          <div
            className="roadmap-years"
            role="group"
            aria-label={t("yearLabel")}
          >
            <Button
              variant={year === undefined ? "default" : "ghost"}
              aria-pressed={year === undefined}
              onClick={() => setYear(undefined)}
            >
              2026–2027
            </Button>
            {ROADMAP_YEARS.map((value) => (
              <Button
                key={value}
                variant={year === value ? "default" : "ghost"}
                aria-pressed={year === value}
                onClick={() => setYear(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <div
            className="roadmap-categories"
            role="group"
            aria-label={t("roadmapFieldLabel")}
          >
            {[
              [ALL_CATEGORIES, t("allFilter")],
              ...Object.entries(settings.categories),
            ].map(([id, label]) => (
              <Button
                size="sm"
                variant={category === id ? "default" : "ghost"}
                key={id}
                aria-pressed={category === id}
                onClick={() => {
                  if (id) setCategory(id);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </section>
        <div className="ea-roadmap-view">
          <span aria-live="polite">
            {rows.length} {t("roadmapStatTechnologies")}
          </span>
          <div
            className="ea-view-switch"
            role="group"
            aria-label={language === "ar" ? "طريقة العرض" : "View mode"}
          >
            <button
              type="button"
              aria-pressed={view === "timeline"}
              onClick={() => setView("timeline")}
            >
              <Table2 size={16} />
              {language === "ar" ? "الجدول الزمني" : "Timeline"}
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <Layers size={16} />
              {language === "ar" ? "حسب الأداة" : "By tool"}
            </button>
          </div>
        </div>
        {view === "list" && (
          <div className="ea-roadmap-list">
            {rows.map(({ product, milestones }) => (
              <article key={product.id}>
                <header>
                  <Link
                    to="/product/$productId"
                    params={{ productId: product.id }}
                  >
                    <h2 dir="auto">{product.name}</h2>
                  </Link>
                  <span>
                    {product.comingSoon
                      ? t("comingSoonBadge")
                      : t("roadmapLive")}
                  </span>
                </header>
                <ol>
                  {milestones.map((m) => (
                    <li key={m.id} data-current={m.id === currentPeriod}>
                      <bdi>
                        {m.year} Q{m.quarter}
                      </bdi>
                      <strong>{roadmapPhaseLabel(m.phase, language)}</strong>
                      <small>{roadmapPhaseDetail(m.phase, language)}</small>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
        <div
          hidden={view !== "timeline"}
          className="roadmap-scroll"
          role="region"
          aria-label={t("roadmapTableLabel")}
          tabIndex={0}
        >
          <table
            className={`roadmap-table ${year ? "roadmap-single-year" : ""}`}
          >
            <caption className="sr-only">{t("roadmapCaption")}</caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="roadmap-product-cell">
                  {t("roadmapColumn")}
                </th>
                {(year ? [year] : [...ROADMAP_YEARS]).map((value) => (
                  <th
                    key={value}
                    colSpan={4}
                    scope="colgroup"
                    className="roadmap-year-head"
                  >
                    {value}
                  </th>
                ))}
              </tr>
              <tr>
                {periods.map((period) => (
                  <th
                    key={period.id}
                    scope="col"
                    className={
                      period.id === currentPeriod ? "roadmap-current" : ""
                    }
                  >
                    <span dir="ltr">Q{period.quarter}</span>
                    <small>{quarterRanges[language][period.quarter - 1]}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, milestones }) => (
                <tr key={product.id} data-technology-id={product.id}>
                  <th scope="row" className="roadmap-product-cell">
                    <Link
                      to="/product/$productId"
                      params={{ productId: product.id }}
                      className="roadmap-product"
                    >
                      {product.image && (
                        <img
                          src={art.image(product)}
                          alt=""
                          width={64}
                          height={48}
                          loading="lazy"
                        />
                      )}
                      <span>
                        <strong dir="ltr">{product.name}</strong>
                        <small>
                          {settings.categories[product.category] ??
                            product.label}
                        </small>
                        <em
                          className={
                            product.comingSoon ? "roadmap-soon" : "roadmap-live"
                          }
                        >
                          {product.comingSoon
                            ? t("comingSoonBadge")
                            : t("roadmapLive")}
                        </em>
                      </span>
                    </Link>
                  </th>
                  {milestones.map((milestone) => (
                    <td key={milestone.id}>
                      <span
                        className={`roadmap-phase roadmap-phase-${milestone.phase}`}
                        title={roadmapPhaseDetail(milestone.phase, language)}
                      >
                        {roadmapPhaseLabel(milestone.phase, language)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="library-empty">
            <h2>{t("roadmapNoMatch")}</h2>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setCategory(ALL_CATEGORIES);
              }}
            >
              {t("clearFilters")}
            </Button>
          </div>
        )}
        <section
          className="roadmap-legend"
          aria-label={t("roadmapPhasesLabel")}
        >
          {(["plan", "pilot", "adopt", "optimize", "conditional"] as const).map(
            (phase) => (
              <div key={phase}>
                <i className={`roadmap-phase-${phase}`} />
                <span>
                  <strong>{roadmapPhaseLabel(phase, language)}</strong>
                  <small>{roadmapPhaseDetail(phase, language)}</small>
                </span>
              </div>
            ),
          )}
        </section>
        <p className="roadmap-footnote">{t("roadmapFootnote")}</p>
      </main>
    </FeatureGate>
  );
}
