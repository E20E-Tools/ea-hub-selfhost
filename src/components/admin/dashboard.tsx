import { useQuery } from "@tanstack/react-query";
import {
  HandHeart,
  Inbox,
  LifeBuoy,
  MessagesSquare,
  Package,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminDashboard } from "@/lib/admin.functions";
import { getAdminAiUsage } from "@/lib/admin-monitor.functions";
import { REQUEST_TYPES } from "@/lib/requests.shared";
import { actionLabel } from "@/lib/admin-copy";
import type { Catalog } from "@/lib/catalog";
import type { Go } from "./shell";
import { EmptyBlock, ErrorBlock, PageHeader, useAdminCopy } from "./ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationHealth } from "./operations";
import { CustomerFunnel } from "./funnel";

export const dashboardQuery = {
  queryKey: ["admin", "dashboard"],
  queryFn: () => getAdminDashboard(),
};

function Kpi({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="ea-stat">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-brand" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums text-foreground"
        dir="ltr"
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function MiniList({
  title,
  onAll,
  empty,
  count,
  children,
}: {
  title: string;
  onAll: () => void;
  empty: string;
  count: number;
  children: ReactNode;
}) {
  const { t } = useAdminCopy();
  return (
    <section className="ea-recent">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" onClick={onAll}>
          {t("viewAll")}
        </Button>
      </header>
      {count === 0 ? (
        <EmptyBlock text={empty} />
      ) : (
        <ul className="grid gap-1">{children}</ul>
      )}
    </section>
  );
}

function Row({
  badge,
  title,
  meta,
}: {
  badge?: string;
  title: string;
  meta: string;
}) {
  return (
    <li className="grid min-w-0 gap-0.5 rounded-md px-2 py-2 hover:bg-muted/50">
      <span className="flex min-w-0 items-center gap-2">
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
        <span className="min-w-0 truncate text-sm font-medium">
          <bdi>{title}</bdi>
        </span>
      </span>
      <span className="truncate text-xs text-muted-foreground">{meta}</span>
    </li>
  );
}

export function DashboardSection({
  catalog,
  go,
}: {
  catalog: Catalog;
  go: Go;
}) {
  const { t, date, number, language } = useAdminCopy();
  const query = useQuery(dashboardQuery);
  const usage = useQuery({
    queryKey: ["admin", "ai-usage"],
    queryFn: () => getAdminAiUsage(),
  });
  const available = catalog.products.filter((p) => !p.comingSoon).length;
  const soon = catalog.products.length - available;
  const d = query.data;
  const short = { dateStyle: "medium", timeStyle: "short" } as const;

  return (
    <div className="ea-dashboard">
      <PageHeader
        title={t("navDashboard")}
        description={t("navDashboardDesc")}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => go("settings")}
            >
              <Settings className="size-4" aria-hidden="true" />
              {t("quickSiteSettings")}
            </Button>
          </>
        }
      />

      {query.isError ? (
        <ErrorBlock onRetry={() => void query.refetch()} />
      ) : null}
      <div className="ea-overview">
        <section className="ea-queue" aria-labelledby="ea-queue-title">
          <header>
            <div>
              <h2 id="ea-queue-title">{t("adminQueue")}</h2>
              {query.dataUpdatedAt > 0 && (
                <p>
                  {t("adminUpdatedAt")}{" "}
                  <time dateTime={new Date(query.dataUpdatedAt).toISOString()}>
                    {date(new Date(query.dataUpdatedAt).toISOString(), {
                      timeStyle: "short",
                    })}
                  </time>
                </p>
              )}
            </div>
            <Inbox size={24} aria-hidden="true" />
          </header>
          <div className="ea-queue-total">
            {d ? number(d.newRequests) : "—"}
          </div>
          <div className="ea-queue-track" aria-hidden="true">
            {d &&
              REQUEST_TYPES.filter((type) => d.newByType[type] > 0).map(
                (type) => (
                  <i
                    key={type}
                    data-type={type}
                    style={{ flexGrow: d.newByType[type] }}
                  />
                ),
              )}
          </div>
          {d && (
            <dl className="ea-queue-legend">
              {REQUEST_TYPES.map((type) => (
                <div key={type}>
                  <dt>
                    <i aria-hidden="true" data-type={type} />
                    {t(`reqType_${type}`)}
                  </dt>
                  <dd>{number(d.newByType[type])}</dd>
                </div>
              ))}
            </dl>
          )}
          <button
            className="ea-queue-open"
            type="button"
            onClick={() => go("customers", "requests")}
          >
            {t("quickReviewRequests")}
            <span aria-hidden="true">↗</span>
          </button>
        </section>
        <div className="ea-stats">
          {query.isPending ? (
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : (
            <>
              <Kpi
                icon={<LifeBuoy className="size-4" />}
                label={t("kpiUrgentSupport")}
                value={d ? number(d.urgentSupport) : "—"}
                detail={t("kpiUrgentSupportDetail")}
              />
              <Kpi
                icon={<HandHeart className="size-4" />}
                label={t("kpiNewOffers")}
                value={d ? number(d.newOffers) : "—"}
              />
              <Kpi
                icon={<Package className="size-4" />}
                label={t("kpiProducts")}
                value={number(catalog.products.length)}
                detail={t("kpiProductsDetail", { available, soon })}
              />
              <Kpi
                icon={<MessagesSquare className="size-4" />}
                label={t("kpiAssistant")}
                value={
                  usage.data
                    ? `${number(usage.data.chat)} / ${number(usage.data.chatLimit)}`
                    : "—"
                }
                detail={t("kpiAssistantDetail")}
              />
            </>
          )}
        </div>
      </div>
      {d ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <MiniList
            title={t("latestRequests")}
            onAll={() => go("customers", "requests")}
            empty={t("noRequestsYet")}
            count={d.latestRequests.length}
          >
            {d.latestRequests.map((r) => (
              <Row
                key={r.id}
                badge={t(`reqType_${r.request_type}`)}
                title={r.name}
                meta={`${t(`reqStatus_${r.status}`)} · ${date(r.created_at, short)}`}
              />
            ))}
          </MiniList>
          <MiniList
            title={t("latestOffers")}
            onAll={() => go("customers", "offers")}
            empty={t("noOffersYet")}
            count={d.latestOffers.length}
          >
            {d.latestOffers.map((r) => (
              <Row
                key={r.id}
                badge={t(`offerType_${r.offer_type}`)}
                title={r.organization || r.name}
                meta={`${t(`offerStatus_${r.status}`)} · ${date(r.created_at, short)}`}
              />
            ))}
          </MiniList>
          <MiniList
            title={t("latestActivity")}
            onAll={() => go("security", "activity")}
            empty={t("noActivityYet")}
            count={d.latestActivity.length}
          >
            {d.latestActivity.map((r) => (
              <Row
                key={r.id}
                title={actionLabel(language, r.action)}
                meta={`${r.actor_email === "system" ? t("actorSystem") : r.actor_email} · ${date(r.created_at, short)}`}
              />
            ))}
          </MiniList>
        </div>
      ) : null}
      <CustomerFunnel />
      <ApplicationHealth />
    </div>
  );
}
