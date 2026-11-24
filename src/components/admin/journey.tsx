import { adminDictionaries } from "@/lib/admin-copy";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getJourneyOverview } from "@/lib/journey.functions";
import { Button } from "@/components/ui/button";
import { QueryState, useAdminCopy } from "./ui";
import type { JourneyEvent } from "@/lib/journey.shared";

const EVENT_LABELS: Record<JourneyEvent, string> = {
  exercise_started:"exerciseStarts",exercise_completed:"exerciseFinishes",exercise_requested:"exerciseSubmissions",
  case_viewed:"caseViewed",case_opened:"caseOpened",
  contact_started: "contactStarts",
  contact_receipt: "contactReceipts",
  service_started: "serviceStarts",
  service_receipt: "serviceReceipts",
  chooser_started: "journeyChooserStarts",
  chooser_completed: "journeyChooserCompleted",
  comparison_opened: "journeyComparisonStarts",
  comparison_tool_opened: "journeyComparisonTools",
  demo_completed: "journeyDemoCompleted",
  request_completed: "journeyRequestReceipts",
  journey_rating: "journeyRatings",
};

export function JourneyOverview() {
  const { t, number, language } = useAdminCopy();
  const query = useQuery({
    queryKey: ["admin", "journey-overview"],
    queryFn: () => getJourneyOverview(),
  });
  return (
    <section aria-label={t("journeyMetrics")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("journeyMetrics")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("journeyMetricsHint")}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className="size-4" />
          {t("opsRefresh")}
        </Button>
      </header>
      <QueryState query={query} empty={t("journeyNoData")} isEmpty={false}>
        {query.data && (
          <>
            <dl className="my-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-primary bg-card p-4">
                <dt>{t("journeyMonthlyRequests")}</dt>
                <dd className="text-3xl font-semibold">
                  {number(query.data.monthlyRequests)}
                </dd>
                <dd className="text-sm text-muted-foreground">
                  {t("journeyRiyadhMonth")}:{" "}
                  <time dateTime={query.data.month}>{query.data.month}</time>
                </dd>
              </div>
              <div className="rounded-lg border border-border p-4">
                <dt>{t("journeyMonthlyRequestRule")}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">
                  {t("journeyReceiptRule")}
                </dd>
              </div>
            </dl>
            <p className="my-3 text-sm text-muted-foreground">
              {t("journey30Days")} · {t("journeyEventsNotPeople")}
            </p>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(EVENT_LABELS) as JourneyEvent[]).map((event) => (
                <div
                  key={event}
                  className="rounded-lg border border-border p-4"
                >
                  <dt>{t(EVENT_LABELS[event])}</dt>
                  <dd className="text-2xl font-semibold">
                    {number(query.data.totals[event])}
                  </dd>
                  {event === "journey_rating" && (
                    <dd>
                      {t("journeyAverage")}:{" "}
                      {query.data.averageRating === null
                        ? t("opsUnknown")
                        : number(query.data.averageRating)}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {(["contact", "service"] as const).map((k) => {
                const starts = query.data!.totals[`${k}_started`];
                return (
                  <div key={k} className="border-s border-border ps-3">
                    <dt>
                      {t(k === "contact" ? "contactRate" : "serviceRate")}
                    </dt>
                    <dd>
                      {starts
                        ? number(
                            Math.round(
                              (100 * query.data!.totals[`${k}_receipt`]) /
                                starts,
                            ),
                          ) + "%"
                        : t("opsUnknown")}
                    </dd>
                  </div>
                );
              })}
              <div className="border-s border-border ps-3">
                <dt>{t("journeyCompletionRate")}</dt>
                <dd>
                  {query.data.chooserCompletionRate === null
                    ? t("opsUnknown")
                    : `${number(query.data.chooserCompletionRate)}%`}
                </dd>
              </div>
              <div className="border-s border-border ps-3">
                <dt>{t("journeyComparisonRate")}</dt>
                <dd>
                  {query.data.comparisonToolRate === null
                    ? t("opsUnknown")
                    : `${number(query.data.comparisonToolRate)}%`}
                </dd>
              </div>
            </dl>
            <section className="my-6"><h3>{adminDictionaries[language].consoleConversionByEventLanguageOver30Days}</h3>
              <table className="w-full text-start"><thead><tr>{[adminDictionaries[language].consoleLanguage,t("caseOpened"),t("serviceRate"),t("exerciseFinishes"),t("exerciseSubmissions")].map(title=><th key={title} scope="col">{title}</th>)}</tr></thead>
              <tbody>{(["ar","en"] as const).map(lang=>{
                const count=(k:JourneyEvent)=>query.data!.rows.filter(r=>r.language===lang&&r.event===k).reduce((n,r)=>n+r.count,0);
                const rate=(a:JourneyEvent,b:JourneyEvent)=>count(b)?number(Math.round(100*count(a)/count(b)))+"% ("+number(count(a))+" / "+number(count(b))+")":"—";
                return <tr key={lang}><th scope="row">{lang==="ar"?"العربية":"English"}</th><td>{rate("case_opened","case_viewed")}</td><td>{rate("service_receipt","service_started")}</td><td>{rate("exercise_completed","exercise_started")}</td><td>{rate("exercise_requested","exercise_completed")}</td></tr>})}</tbody></table>
            </section>
            {!query.data.rows.length && (
              <p className="mt-5 text-sm text-muted-foreground" role="status">
                {t("journeyNoData")}
              </p>
            )}
            <p className="mt-5 text-sm text-muted-foreground">
              {t("journeyReceiptRule")}
            </p>
          </>
        )}
      </QueryState>
    </section>
  );
}
