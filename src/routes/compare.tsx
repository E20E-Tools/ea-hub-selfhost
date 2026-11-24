import { openAssistantWindow } from "@/lib/assistant-events";
import { FeatureGate, FeatureOnly } from "@/components/feature-gate";
import { DISCOVERY_GOALS, type DiscoveryGoal } from "@/lib/beneficiary-metadata";
import { featureEnabled } from "@/lib/site-features";
import {SaveDecision} from "@/components/comparison-decision";
import { JourneyHeading } from "@/studio/journey-heading";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MetricsPreference } from "@/components/metrics-preference";
import { Check, Heart, Plus, Scale, X } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { localizeBeneficiaryDetails } from "@/lib/beneficiary-metadata";
import { encodeComparisonIds, MAX_COMPARE, productIds } from "@/lib/my-tools";
import { useMyTools } from "@/lib/use-my-tools";
import { useLanguage } from "@/lib/language";
import type { Copy } from "@/lib/copy";
import type { Product } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { productImages } from "@/lib/product-images";
import { trackJourney } from "@/lib/journey-client";
import { pageUrl } from "@/lib/seo";
import { dictionaries } from "@/lib/copy";

type Scenario = "adoption" | "overlap" | "dependency";
type CompareSearch = { scenario?: Scenario | undefined; goal?: DiscoveryGoal | undefined; ids?: string | undefined };
export const Route = createFileRoute("/compare")({
  validateSearch: (search: Record<string, unknown>): CompareSearch => ({
    scenario: ["adoption","overlap","dependency"].find(id => id === search["scenario"]) as Scenario | undefined,
    goal: DISCOVERY_GOALS.find(goal => goal === search["goal"]),
    ids: typeof search["ids"] === "string" ? search["ids"].slice(0, 150) : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "Compare EA tools — E20E Tools | مقارنة الأدوات" },
      {
        name: "description",
        content:
          "Compare two or three live-catalog tools with explicit unknown fields and no invented capabilities.",
      },
      { property: "og:title", content: "Compare EA tools — E20E Tools" },
      {
        property: "og:description",
        content: "An accessible, factual comparison of selected E20E tools.",
      },
      { property: "og:url", content: pageUrl("/compare") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/compare") }],
  }),
  component: GatedComparePage,
});

function ListOrUnknown({ values, unknown }: { values: string[]; unknown: string }) {
  return values.length ? (
    <ul>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  ) : (
    <p>{unknown}</p>
  );
}
function TextOrUnknown({ value, unknown }: { value: string; unknown: string }) {
  return <p>{value.trim() || unknown}</p>;
}

function ComparePage() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t } = useLanguage();
  const search = Route.useSearch();
  const ar=language==="ar";
  const decisions=[
    {id:"overlap",ids:["landscape","archone"],title:dictionaries[ar ? "ar" : "en"].compareReduceSystemDuplication,why:dictionaries[ar ? "ar" : "en"].compareStartWithApmTo},
    {id:"adoption",ids:["radar","landscape"],title:dictionaries[ar ? "ar" : "en"].compareTrialATechnology,why:dictionaries[ar ? "ar" : "en"].compareStartWithRadarTo},
    {id:"dependency",ids:["archone","landscape"],title:dictionaries[ar ? "ar" : "en"].compareAssessAProcessChange,why:dictionaries[ar ? "ar" : "en"].compareStartWithArchoneTo}
  ].filter(d=>d.ids.every(id=>catalog.products.some(p=>p.id===id&&!p.comingSoon)));
  const [differences, setDifferences] = useState(false);
  const navigate = Route.useNavigate();
  const tools = useMyTools();
  const hasUrl = search.ids !== undefined;
  // Filter to available catalog tools before applying the limit, so an unknown or coming-soon
  // ID early in a shared link cannot push a valid tool out of the comparison.
  const candidateIds = hasUrl ? productIds((search.ids ?? "").split(","), 20) : tools.compare;
  const available = candidateIds
    .map((id) => catalog.products.find((product) => product.id === id && !product.comingSoon))
    .filter((product): product is Product => Boolean(product))
    .slice(0, MAX_COMPARE);
  const selectedIds = available.map((product) => product.id);
  const decision = decisions.find((item) => item.ids.length === selectedIds.length && item.ids.every((id, index) => id === selectedIds[index]));
  const products = available.map((product) => localizedProduct(product, language));
  const goal = search.goal ? t(`bxGoal_${search.goal}`) : search.scenario && decision?.id === search.scenario ? decision.title : undefined;
  const choiceGuide: Record<string, string> = {
    landscape: dictionaries[ar ? "ar" : "en"].compareChooseThisToMap,
    radar: dictionaries[ar ? "ar" : "en"].compareChooseThisToDecide,
    archone: dictionaries[ar ? "ar" : "en"].compareChooseThisToTrace,
  };
  function explainComparison() {
    const items = products.map(({ id, name }) => ({ id, name }));
    const names = items.map(item => item.name).join(dictionaries[ar ? "ar" : "en"].compareAnd);
    const question = ar
      ? `ما الفرق بين ${names}؟ ${goal ? "هدفي: " + goal + ". " : ""}متى أختار كل أداة؟ استند إلى صفحات المنتجات.`
      : `How do ${names} differ? ${goal ? "My goal: " + goal + ". " : ""}When should I choose each tool? Use their product pages.`;
    openAssistantWindow(question, items);
  }
  // Count every requested entry so over-limit or malformed IDs also show the notice.
  const requestedCount = hasUrl
    ? (search.ids ?? "").split(",").filter((item) => item.trim()).length
    : selectedIds.length;
  const removed = hasUrl && products.length !== requestedCount;
  const update = (ids: string[], scenario?: Scenario) => {
    tools.replaceCompare(ids);
    void navigate({ search: { ids: encodeComparisonIds(ids), goal: scenario ? undefined : search.goal, scenario }, replace: true, resetScroll: false });
  };
  const remove = (id: string) => {
    update(selectedIds.filter((item) => item !== id));
  };
  const rows: {
    key: keyof Copy;
    data: (product: Product) => string | string[];
    value: (product: Product) => React.ReactNode;
  }[] = [
    {
      key: "bxUses",
      data: (product) => product.features,
      value: (product) => <ListOrUnknown values={product.features} unknown={t("bxNotProvided")} />,
    },
    ...(
      [
        "audience",
        "notFor",
        "prerequisites",
        "integrations",
        "limitations",
        "exampleOutput",
      ] as const
    ).map((field) => ({
      key: (
        {
          audience: "bxAudience",
          notFor: "bxNotFor",
          prerequisites: "bxPrerequisites",
          integrations: "bxIntegrations",
          limitations: "bxLimitations",
          exampleOutput: "bxExampleOutput",
        } as const
      )[field],
      data: (product: Product) =>
        localizeBeneficiaryDetails(product.beneficiaryDetails, language)[field],
      value: (product: Product) => {
        const details = localizeBeneficiaryDetails(product.beneficiaryDetails, language);
        const value = details[field];
        return Array.isArray(value) ? (
          <ListOrUnknown values={value} unknown={t("bxNotProvided")} />
        ) : (
          <TextOrUnknown value={value} unknown={t("bxNotProvided")} />
        );
      },
    })),
  ];
  const visibleRows = rows.filter(
    (row) => !differences || new Set(products.map((p) => JSON.stringify(row.data(p)))).size > 1,
  );
  return (
    <main className="bx-page ea-workspace ea-compare" dir={dir}>
      <JourneyHeading
        icon={Scale}
        title={t("bxCompareTitle")}
        description={t("bxCompareLead")}
        view="compare"
      />
      <a className="ea-guide-step" href={`/guide/${language}.html#s2`}>{language === "ar" ? "كيف أقارن الأدوات؟" : "How do I compare tools?"}</a>
      <p className="bx-local-note">{t("bxLocalOnly")}</p>
      {tools.status !== "ok" && (
        <p role="status" className="bx-local-note">
          {t("bxStorageBlocked")}
        </p>
      )}
      {removed && (
        <p role="status" className="bx-local-note">
          {t("bxCompareRemoved")}
        </p>
      )}
      {decisions.length > 0 && <section className="bx-panel">
        <h2>{dictionaries[ar ? "ar" : "en"].compareWhichDecisionAreYou}</h2>
        <div className="ea-decision-grid">
          {decisions.map((item) => (
            <button key={item.id} type="button" aria-pressed={item === decision} onClick={() => update(item.ids, item.id as Scenario)}>
              <span>{item.title}</span>
              <small>{item.ids.map((id) => catalog.products.find((product) => product.id === id)?.name).join(" + ")}</small>
              {item === decision && <Check size={18} aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div role="status">{decision && <p>{decision.why}</p>}</div>
      </section>}
      <fieldset className="ea-compare-picker">
        <legend>{language === "ar" ? "اختر أدوات المقارنة" : "Select tools to compare"}</legend>
        <div>
          {catalog.products
            .filter((p) => !p.comingSoon)
            .map((p) => {
              const selected = selectedIds.includes(p.id);
              const Icon = selected ? Check : Plus;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={!tools.hydrated || (!selected && selectedIds.length >= MAX_COMPARE)}
                  onClick={() => (selected ? remove(p.id) : update([...selectedIds, p.id]))}
                >
                  {(p.image || productImages[p.id]) && (
                    <img src={p.image || productImages[p.id]?.src} alt="" width="58" height="42" />
                  )}
                  <bdi>{p.name}</bdi>
                  <Icon size={18} aria-hidden="true" />
                </button>
              );
            })}
        </div>
      </fieldset>
      <div className="bx-actions">
        {products.length >= 2 && (
          <label className="ea-diff">
            <input
              type="checkbox"
              checked={differences}
              onChange={(e) => setDifferences(e.target.checked)}
            />
            {language === "ar" ? "عرض الفروق فقط" : "Show differences only"}
          </label>
        )}
        <span role="status">
          {products.length} / {tools.maxCompare} {t("bxSelected")}
        </span>
        <FeatureOnly feature="discover">
          <Button asChild variant="outline">
            <Link to="/discover">{t("bxStartNeed")}</Link>
          </Button>
        </FeatureOnly>
        <Button
          type="button"
          variant="ghost"
          disabled={!selectedIds.length}
          onClick={() => {
            update([]);
          }}
        >
          {t("bxCompareClear")}
        </Button>
      </div>
      {products.length >= 2 && (
        <section className="bx-panel ea-choice-guide">
          <h2>{dictionaries[ar ? "ar" : "en"].compareWhenShouldIChoose}</h2>
          <ul>{products.map(product => <li key={product.id}>
            <Link to="/product/$productId" params={{ productId: product.id }}><bdi>{product.name}</bdi></Link>
            <p>{choiceGuide[product.id] || product.description}</p>
            {choiceGuide[product.id] && <Link to="/product/$productId" params={{ productId: product.id }} hash="exercise">
              {dictionaries[ar ? "ar" : "en"].productExerciseTryAWorkedExample}</Link>}
          </li>)}</ul>
          {featureEnabled(catalog.settings?.featureFlags, "assistant") && <Button type="button" onClick={explainComparison}>
            {dictionaries[ar ? "ar" : "en"].compareExplainTheDifferenceWith}
          </Button>}
        </section>
      )}
      {!tools.hydrated && !hasUrl ? (
        <p role="status">…</p>
      ) : products.length < 2 ? (
        <section className="bx-empty">
          <h2>{t("bxCompareEmpty")}</h2>
          <p>{t("bxCompareNeedTwo")}</p>
          <Button asChild>
            <Link to="/">{t("backToLibrary")}</Link>
          </Button>
        </section>
      ) : (
        <div className="bx-table-wrap" tabIndex={0} role="region" aria-label={t("bxCompareTitle")}>
          <table className="bx-table">
            <caption>{t("bxCompareLead")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("bxCompare")}</th>
                {products.map((product) => (
                  <th scope="col" key={product.id}>
                    <bdi dir="ltr">{product.name}</bdi>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      aria-label={`${t("bxRemove")}: ${product.name}`}
                      onClick={() => remove(product.id)}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={products.length + 1}>
                    {language === "ar"
                      ? "تتطابق البيانات المنشورة في هذه الحقول."
                      : "The published fields have identical values."}
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(row.key)}</th>
                  {products.map((product) => (
                    <td key={product.id}>{row.value(product)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">{t("bxOpenDetails")}</th>
                {products.map((product) => (
                  <td key={product.id}>
                    <div className="grid gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        aria-pressed={tools.favorites.includes(product.id)}
                        onClick={() => tools.toggleFavorite(product.id)}
                      >
                        <Heart size={16} aria-hidden="true" />
                        {tools.favorites.includes(product.id) ? t("bxSavedTool") : t("bxSaveTool")}
                      </Button>
                      <Button asChild variant="outline">
                        <Link
                          to="/product/$productId"
                          params={{ productId: product.id }}
                          onClick={() => void trackJourney("comparison_tool_opened", language)}
                        >
                          {t("bxOpenDetails")}
                        </Link>
                      </Button>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <MetricsPreference />
{products.length>=2&&<SaveDecision items={products}/>}
    </main>
  );
}

function GatedComparePage() {
  return (
    <FeatureGate featureKey="compare">
      <ComparePage />
    </FeatureGate>
  );
}
