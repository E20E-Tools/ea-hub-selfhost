import { ProductExercise } from "@/components/product-exercise";
import { cases } from "@/lib/product-cases";
import { useState, type FormEvent } from "react";
import { MetricsPreference } from "@/components/metrics-preference";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { FlaskConical, RotateCcw } from "lucide-react";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { planningPhases } from "@/lib/discovery";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { trackJourney } from "@/lib/journey-client";
import { pageUrl } from "@/lib/seo";
import { JourneyHeading } from "@/studio/journey-heading";

export const Route = createFileRoute("/try/$productId")({
  loader: async ({ context, params }) => {
    const catalog = await context.queryClient.ensureQueryData(catalogQueryOptions);
    const product = catalog.products.find(
      (item) => item.id === params.productId && !item.comingSoon,
    );
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.product.name ?? "Tool";
    const url = pageUrl(`/try/${encodeURIComponent(params.productId)}`);
    return {
      meta: [
        { title: `${name} planning exercise — E20E Tools` },
        {
          name: "description",
          content: `A generic synthetic planning exercise linked to ${name}; it does not invoke the external tool.`,
        },
        { property: "og:title", content: `${name} planning exercise — E20E Tools` },
        {
          property: "og:description",
          content: "Inspect synthetic inputs and recompute an illustrative initiative plan.",
        },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PlanningDemo,
});

function PlanningDemo() {
  const { product: stored } = Route.useLoaderData();
  const { language, dir, t } = useLanguage();
  const product = localizedProduct(stored, language);
  const [goal, setGoal] = useState("");
  const [systems, setSystems] = useState(12);
  const [users, setUsers] = useState(80);
  const [weeks, setWeeks] = useState(12);
  const [output, setOutput] = useState<ReturnType<typeof planningPhases> | null>(null);
  const calculate = (event: FormEvent) => {
    event.preventDefault();
    setOutput(planningPhases(systems, users, weeks));
    void trackJourney("demo_completed", language);
  };
  const reset = () => {
    setGoal("");
    setSystems(12);
    setUsers(80);
    setWeeks(12);
    setOutput(null);
  };
  if(cases[product.id])return <main className="bx-page ea-workspace ea-try" dir={dir}><JourneyHeading icon={FlaskConical} title={product.name} description={cases[product.id]!.question[language==="ar"?0:1]}/><ProductExercise key={product.id+language} product={product} language={language}/><MetricsPreference/></main>;
  return (
    <main className="bx-page ea-workspace ea-try" dir={dir}>
      <JourneyHeading icon={FlaskConical} title={t("bxDemoTitle")} description={t("bxDemoLead")} />
      <p className="bx-synthetic" role="note">
        <Link to="/product/$productId" params={{ productId: product.id }}>
          <bdi dir="ltr">{product.name}</bdi>
        </Link>
        {" · "}{product.label} · {t("bxSynthetic")}
      </p>
      <form className="bx-panel mt-5" onSubmit={calculate}>
        <h2>{t("bxDemoInputs")}</h2>
        <div className="bx-demo-grid mt-4">
          <label className="bx-form-field">
            {t("bxDemoGoal")}
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder={
                language === "ar"
                  ? "مثال اصطناعي: جرد تطبيقات إدارة افتراضية"
                  : "Synthetic example: inventory a fictional department's applications"
              }
            />
          </label>
          <label>
            {t("bxDemoSystems")}
            <input
              type="number"
              dir="ltr"
              min={1}
              max={500}
              required
              value={systems}
              onChange={(event) => setSystems(Number(event.target.value))}
            />
          </label>
          <label>
            {t("bxDemoUsers")}
            <input
              type="number"
              dir="ltr"
              min={1}
              max={100000}
              required
              value={users}
              onChange={(event) => setUsers(Number(event.target.value))}
            />
          </label>
          <label>
            {t("bxDemoWeeks")}
            <input
              type="number"
              dir="ltr"
              min={2}
              max={52}
              required
              value={weeks}
              onChange={(event) => setWeeks(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="bx-actions">
          <Button type="submit">{t("bxDemoCalculate")}</Button>
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {t("bxRestart")}
          </Button>
        </div>
      </form>
      {output && (
        <section className="bx-panel" aria-labelledby="demo-output" aria-live="polite">
          <h2 id="demo-output">{t("bxDemoOutput")}</h2>
          {goal && <p className="my-3">{goal}</p>}
          <div className="bx-phase">
            <strong>{t("bxDemoDiscovery")}</strong>
            <strong>
              {output.discovery} {t("bxWeeksUnit")}
            </strong>
          </div>
          <div className="bx-phase">
            <strong>{t("bxDemoPilot")}</strong>
            <strong>
              {output.pilot} {t("bxWeeksUnit")}
            </strong>
          </div>
          <div className="bx-phase">
            <strong>{t("bxDemoReview")}</strong>
            <strong>
              {output.review} {t("bxWeeksUnit")}
            </strong>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{t("bxDemoLimitations")}</p>
        </section>
      )}
      <div className="bx-actions">
        <Button asChild>
          <Link to="/request" search={{ type: "general", product: product.id }}>
            {t("bxRequestTool")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/product/$productId" params={{ productId: product.id }}>
            {t("bxOpenDetails")}
          </Link>
        </Button>
      </div>
      <MetricsPreference />
    </main>
  );
}
