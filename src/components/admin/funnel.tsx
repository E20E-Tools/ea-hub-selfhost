import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFunnel } from "@/lib/site-visits.functions";
import { funnelSteps } from "@/lib/site-visits.shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock, useAdminCopy } from "./ui";

/** Visitor → product page → chat → request, for the last 7 or 30 days. */
export function CustomerFunnel() {
  const { t, number } = useAdminCopy();
  const [days, setDays] = useState<7 | 30>(30);
  const read = useServerFn(getFunnel);
  const query = useQuery({
    queryKey: ["admin", "funnel", days],
    queryFn: () => read({ data: { days } }),
    staleTime: 60_000,
  });
  const steps = query.data ? funnelSteps(query.data.stages) : [];
  const top = steps[0]?.count ?? 0;
  return (
    <section
      className="ea-funnel mt-6 rounded-lg border border-border bg-card p-4"
      aria-labelledby="ea-funnel-title"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="ea-funnel-title" className="text-sm font-semibold">
            {t("funnelTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("funnelHint")}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label={t("funnelRange")}>
          {([7, 30] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {t("funnelDays", { days: d })}
            </Button>
          ))}
        </div>
      </header>
      {query.isError ? (
        <ErrorBlock
          text={t("funnelError")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ol className="grid gap-2">
          {steps.map((s) => {
            const width =
              top > 0 ? Math.max(2, Math.round((s.count / top) * 100)) : 0;
            return (
              <li key={s.stage} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{t(`funnel_${s.stage}`)}</span>
                  <span className="tabular-nums" dir="ltr">
                    <b className="text-base">{number(s.count)}</b>
                    {s.ofPrevious !== null && (
                      <span className="ms-2 text-xs text-muted-foreground">
                        {t("funnelOfPrevious", { pct: s.ofPrevious })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {query.data && query.data.waitlistRequests > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("funnelWaitlist", { count: number(query.data.waitlistRequests) })}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("funnelNote")}</p>
    </section>
  );
}
