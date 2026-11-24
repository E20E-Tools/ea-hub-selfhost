import { adminDictionaries } from "@/lib/admin-copy";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  addRequestReply,
  getRequestAttachment,
  listRequestReplies,
  listRequests,
  listSupportOffers,
  setRequestStatus,
  setSupportOfferStatus,
  type RequestRow,
  type SupportOfferRow,
} from "@/lib/admin.functions";
import { listAssistantReplies } from "@/lib/admin-monitor.functions";
import { filterAssistantReplies } from "@/lib/admin-monitor.shared";
import {
  OFFER_STATUSES,
  OFFER_TYPES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  SERVICE_KINDS,
  toCsv,
  type OfferStatus,
  type RequestStatus,
} from "@/lib/requests.shared";
import { dictionaries } from "@/lib/copy";
import type { AdminTab } from "@/lib/admin-sections";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, QueryState, selectClass, useAdminCopy } from "./ui";

const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  new: "brand",
  in_progress: "secondary",
  contacted: "secondary",
  resolved: "success",
  accepted: "success",
  rejected: "outline",
  declined: "outline",
  replied: "success",
  follow_up: "secondary",
  cancelled: "outline",
};

function useFilter<T>(
  rows: T[],
  typeOf: (r: T) => string,
  statusOf: (r: T) => string,
  textOf: (r: T) => string,
) {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase();
  const visible = rows.filter(
    (row) =>
      (type === "all" || typeOf(row) === type) &&
      (status === "all" || statusOf(row) === status) &&
      (!needle || textOf(row).toLocaleLowerCase().includes(needle)),
  );
  return { type, setType, status, setStatus, search, setSearch, visible };
}

function Filters({
  types,
  typePrefix,
  statuses,
  statusPrefix,
  filter,
  placeholder,
  extra,
}: {
  types: readonly string[];
  typePrefix: string;
  statuses: readonly string[];
  statusPrefix: string;
  filter: ReturnType<typeof useFilter<never>>;
  placeholder: string;
  extra?: ReactNode;
}) {
  const { t } = useAdminCopy();
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={t("search")}
          placeholder={placeholder}
          className="ps-9"
          value={filter.search}
          onChange={(e) => filter.setSearch(e.target.value)}
        />
      </div>
      {types.length ? (
        <select
          aria-label={t("filterType")}
          className={selectClass}
          value={filter.type}
          onChange={(e) => filter.setType(e.target.value)}
        >
          <option value="all">{t("all")}</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {t(`${typePrefix}${type}`)}
            </option>
          ))}
        </select>
      ) : (
        <span />
      )}
      <select
        aria-label={t("filterStatus")}
        className={selectClass}
        value={filter.status}
        onChange={(e) => filter.setStatus(e.target.value)}
      >
        <option value="all">{t("allStatuses")}</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {t(`${statusPrefix}${s}`)}
          </option>
        ))}
      </select>
      {extra ?? <span />}
    </div>
  );
}

function ListItem({
  onOpen,
  badge,
  title,
  status,
  statusLabel,
  meta,
  preview,
}: {
  onOpen: () => void;
  badge: string;
  title: string;
  status: string;
  statusLabel: string;
  meta: string;
  preview: string;
}) {
  const { t } = useAdminCopy();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t("openDetails")}: ${title}`}
        className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{badge}</Badge>
            <span className="truncate font-medium" dir="auto">
              {title}
            </span>
            <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
              {statusLabel}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground" dir="auto">
            {preview}
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {meta}
        </span>
        <ChevronLeft
          className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100"
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

function Detail({
  label,
  children,
  ltr,
}: {
  label: string;
  children: ReactNode;
  ltr?: boolean;
}) {
  return (
    <div className="grid gap-0.5 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm" dir={ltr ? "ltr" : "auto"}>
        {children}
      </dd>
    </div>
  );
}

function Drawer({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { dir } = useAdminCopy();
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        dir={dir}
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetTitle dir="auto">{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function StatusPicker<S extends string>({
  statuses,
  prefix,
  current,
  busy,
  onChange,
}: {
  statuses: readonly S[];
  prefix: string;
  current: S;
  busy: boolean;
  onChange: (status: S) => void;
}) {
  const { t } = useAdminCopy();
  return (
    <div className="mt-6 grid gap-2">
      <p className="text-sm font-medium">{t("changeStatus")}</p>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t("changeStatus")}
      >
        {statuses.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={current === s ? "default" : "outline"}
            aria-pressed={current === s}
            disabled={busy || current === s}
            onClick={() => onChange(s)}
          >
            {t(`${prefix}${s}`)}
          </Button>
        ))}
        {busy ? (
          <Loader2
            className="size-4 animate-spin self-center"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Readable service-request choices; unknown values are shown as stored. */
function serviceDetails(details: RequestRow["details"], language: "ar" | "en") {
  const copy = dictionaries[language] as Record<string, string>;
  const d = details ?? {};
  const key = (value: string) =>
    value.replace(/[^a-z0-9]+/gi, "_").replace(/_+$/, "");
  const label = (prefix: string, value: unknown) =>
    typeof value === "string" && value
      ? (copy[`${prefix}${key(value)}`] ?? value)
      : "";
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  return {
    services: list(d["services"]).map((item) => label("srService_", item)),
    tools: list(d["tools"]),
    teamSize: label("srTeam_", d["teamSize"]),
    timeline: label("srTimeline_", d["timeline"]),
  };
}

export function RequestsTab({
  only,
  email,
}: { only?: "service"; email?: string } = {}) {
  const { t, date, language } = useAdminCopy();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);
  const [waiting, setWaiting] = useState<"team" | "visitor" | undefined>();
  const search = {
    waiting,
    q: debouncedQ || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const query = useQuery({
    queryKey: ["admin", "requests", search],
    queryFn: () => listRequests({ data: search }),
    refetchInterval: 15000,
  });
  const [service, setService] = useState("all");
  const allRows = (query.data ?? []).filter(
    (r) => !email || r.email.toLowerCase() === email.toLowerCase(),
  );
  const rows = only
    ? allRows.filter(
        (r) =>
          r.request_type === only &&
          (service === "all" || (r.details?.services ?? []).includes(service)),
      )
    : allRows;
  const filter = useFilter<RequestRow>(
    rows,
    (r) => r.request_type,
    (r) => r.status,
    (r) => `${r.name} ${r.email} ${r.need} ${r.impact} ${r.company ?? ""}`,
  );
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const open = rows.find((r) => r.id === openId);

  async function change(id: string, status: RequestStatus) {
    setBusy(true);
    try {
      const result = await setRequestStatus({ data: { id, status } });
      if (!result.ok) return void toast.error(t(result.message));
      toast.success(t("statusUpdated"));
      // Visitors list and chat details read the same requests, so refresh every admin view.
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch {
      toast.error(t("errRequestStatus"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-end gap-2 text-sm">
        <Input
          className="max-w-xs"
          aria-label={t("searchDb")}
          placeholder={t("searchDb")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("dateFrom")}</span>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("dateTo")}</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {q || from || to ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setFrom("");
              setTo("");
            }}
          >
            {t("clearSearch")}
          </Button>
        ) : null}
        {query.isFetching ? <Loader2 className="size-4 animate-spin" /> : null}
      </div>
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="group"
        aria-label={t("requestQueues")}
      >
        {([undefined, "team", "visitor"] as const).map((value) => (
          <Button
            key={value ?? "all"}
            type="button"
            variant={waiting === value ? "default" : "outline"}
            aria-pressed={waiting === value}
            onClick={() => setWaiting(value)}
          >
            {t(
              value === "team"
                ? "waitingTeam"
                : value === "visitor"
                  ? "waitingVisitor"
                  : "allRequestQueues",
            )}
          </Button>
        ))}
      </div>
      <Filters
        types={only ? [] : REQUEST_TYPES}
        typePrefix="reqType_"
        statuses={REQUEST_STATUSES}
        statusPrefix="reqStatus_"
        filter={filter as never}
        placeholder={t("searchRequests")}
        {...(only
          ? {
              extra: (
                <select
                  aria-label={t("filterService")}
                  className={selectClass}
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="all">{t("allServices")}</option>
                  {SERVICE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {(dictionaries[language] as Record<string, string>)[
                        `srService_${k}`
                      ] ?? k}
                    </option>
                  ))}
                </select>
              ),
            }
          : {})}
      />
      <QueryState
        query={query}
        empty={rows.length ? t("noMatches") : t("noRequestsYet")}
        isEmpty={filter.visible.length === 0}
      >
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {filter.visible.map((r) => (
            <ListItem
              key={r.id}
              onOpen={() => setOpenId(r.id)}
              badge={t(`reqType_${r.request_type}`)}
              title={r.name}
              status={r.status}
              statusLabel={t(`reqStatus_${r.status}`)}
              meta={date(r.created_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              preview={r.need}
            />
          ))}
        </ul>
      </QueryState>
      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId("")}
        title={open?.name ?? ""}
        description={t("requestDetails")}
      >
        {open ? (
          <>
            <dl>
              <Detail label={t("fieldType")}>
                {t(`reqType_${open.request_type}`)}
              </Detail>
              <Detail label={t("fieldTime")}>
                {date(open.created_at, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </Detail>
              <Detail label={t("fieldStatus")}>
                {t(`reqStatus_${open.status}`)}
              </Detail>
              <Detail label={t("fieldReplyState")}>
                {t(`replyState_${open.status}`)}
                {open.status_updated_at
                  ? ` · ${t("fieldLastUpdate")} ${date(open.status_updated_at, { dateStyle: "medium", timeStyle: "short" })}`
                  : ""}
              </Detail>
              <Detail label={t("fieldEmail")} ltr>
                <a
                  className="underline-offset-4 hover:underline"
                  href={`mailto:${open.email}`}
                >
                  {open.email}
                </a>
              </Detail>
              <Detail label={t("fieldPhone")} ltr>
                {open.phone || "—"}
              </Detail>
              <Detail label={t("fieldCompany")}>{open.company || "—"}</Detail>
              {open.product_id ? (
                <Detail label={t("fieldProduct")} ltr>
                  {open.product_id}
                </Detail>
              ) : null}
              {open.urgency ? (
                <Detail label={t("fieldUrgency")}>
                  {t(`urgency_${open.urgency}`)}
                </Detail>
              ) : null}
              {open.request_type === "service"
                ? (() => {
                    const service = serviceDetails(open.details, language);
                    return (
                      <>
                        <Detail label={t("fieldServices")}>
                          {service.services.join(" · ") || "—"}
                        </Detail>
                        <Detail label={t("fieldTools")} ltr>
                          {service.tools.join(" · ") || "—"}
                        </Detail>
                        <Detail label={t("fieldTeamSize")}>
                          {service.teamSize || "—"}
                        </Detail>
                        <Detail label={t("fieldTimeline")}>
                          {service.timeline || "—"}
                        </Detail>
                      </>
                    );
                  })()
                : null}
              {open.recommendation?.picks?.length ? (
                <Detail label={t("fieldSuggested")}>
                  {open.recommendation.picks
                    .map((p) => p.name ?? p.productId ?? p.id)
                    .join(" · ")}
                </Detail>
              ) : null}
              <Detail label={t("fieldMessage")}>
                <span className="whitespace-pre-wrap">{open.need}</span>
              </Detail>
              {open.impact ? (
                <Detail label={t("fieldImpact")}>
                  <span className="whitespace-pre-wrap">{open.impact}</span>
                </Detail>
              ) : null}
            </dl>
            {open.attachments?.length ? (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">{t("attachments")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {open.attachments.map((image) => (
                    <figure
                      key={image.path}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <PrivatePhoto
                        requestId={open.id}
                        path={image.path}
                        name={image.name}
                      />
                      <figcaption
                        className="truncate px-2 py-1 text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        {image.name}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ) : null}
            {open.details?.exercise && (
              <section>
                <h3>
                  {adminDictionaries[language].consoleCustomerExerciseResult}
                </h3>
                <pre className="whitespace-pre-wrap">
                  {open.details.exercise}
                </pre>
              </section>
            )}
            <RequestReplies requestId={open.id} />
            <a
              className="mt-4 inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              href={`mailto:${open.email}?subject=${encodeURIComponent(`${t("replySubject")} ${t(`reqType_${open.request_type}`)}`)}`}
              onClick={() => {
                if (open.status === "new") void change(open.id, "in_progress");
              }}
            >
              {t("replyByEmail")}
            </a>
            <StatusPicker
              statuses={REQUEST_STATUSES}
              prefix="reqStatus_"
              current={open.status}
              busy={busy}
              onChange={(s) => void change(open.id, s)}
            />
          </>
        ) : null}
      </Drawer>
    </>
  );
}

function offerDetailText(row: SupportOfferRow, language: "ar" | "en") {
  const copy = dictionaries[language] as Record<string, string>;
  const d = row.details ?? {};
  const label = (prefix: string, value: unknown) =>
    typeof value === "string" && value
      ? (copy[`${prefix}${value}`] ?? value)
      : "";
  const parts =
    row.offer_type === "partnership"
      ? [
          label("spOrg_", d["orgType"]),
          typeof d["jobTitle"] === "string" ? d["jobTitle"] : "",
          label("spArea_", d["area"]),
        ]
      : row.offer_type === "financial"
        ? [
            label("spKind_", d["kind"]),
            d["amount"]
              ? `${label("spAmount_", d["amount"])} ${String(d["currency"] ?? "")}`
              : "",
            typeof d["productId"] === "string" ? d["productId"] : "",
          ]
        : [
            Array.isArray(d["skills"])
              ? (d["skills"] as string[])
                  .map((s) => label("spSkill_", s))
                  .join(", ")
              : "",
            label("spHours_", d["hours"]),
            typeof d["interest"] === "string" ? d["interest"] : "",
          ];
  return parts.filter(Boolean).join(" · ");
}

export function offersCsv(rows: SupportOfferRow[]) {
  return toCsv(
    [
      "created_at",
      "type",
      "status",
      "name",
      "organization",
      "email",
      "phone",
      "details",
      "message",
    ],
    rows.map((r) => [
      r.created_at,
      r.offer_type,
      r.status,
      r.name,
      r.organization,
      r.email,
      r.phone,
      JSON.stringify(r.details ?? {}),
      r.message,
    ]),
  );
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function OffersTab() {
  const { t, date, language } = useAdminCopy();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "support-offers"],
    queryFn: () => listSupportOffers(),
  });
  const rows = query.data ?? [];
  const filter = useFilter<SupportOfferRow>(
    rows,
    (r) => r.offer_type,
    (r) => r.status,
    (r) =>
      `${r.name} ${r.email} ${r.organization} ${r.message} ${JSON.stringify(r.details)}`,
  );
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const open = rows.find((r) => r.id === openId);

  async function change(id: string, status: OfferStatus) {
    setBusy(true);
    try {
      const result = await setSupportOfferStatus({ data: { id, status } });
      if (!result.ok) return void toast.error(t(result.message));
      toast.success(t("statusUpdated"));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin", "support-offers"],
        }),
        queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      ]);
    } catch {
      toast.error(t("errOfferStatus"));
    } finally {
      setBusy(false);
    }
  }

  const links =
    open && Array.isArray(open.details?.["links"])
      ? (open.details["links"] as string[]).filter((l) => /^https:\/\//.test(l))
      : [];

  return (
    <>
      <Filters
        types={OFFER_TYPES}
        typePrefix="offerType_"
        statuses={OFFER_STATUSES}
        statusPrefix="offerStatus_"
        filter={filter as never}
        placeholder={t("searchOffers")}
        extra={
          <Button
            variant="outline"
            disabled={filter.visible.length === 0}
            onClick={() =>
              downloadCsv("e20e-support-offers.csv", offersCsv(filter.visible))
            }
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportCsv")}
          </Button>
        }
      />
      <QueryState
        query={query}
        empty={rows.length ? t("noMatches") : t("noOffersYet")}
        isEmpty={filter.visible.length === 0}
      >
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {filter.visible.map((r) => (
            <ListItem
              key={r.id}
              onOpen={() => setOpenId(r.id)}
              badge={t(`offerType_${r.offer_type}`)}
              title={r.organization || r.name}
              status={r.status}
              statusLabel={t(`offerStatus_${r.status}`)}
              meta={date(r.created_at, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              preview={offerDetailText(r, language) || r.message}
            />
          ))}
        </ul>
      </QueryState>
      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId("")}
        title={open ? open.organization || open.name : ""}
        description={t("offerDetails")}
      >
        {open ? (
          <>
            <dl>
              <Detail label={t("fieldType")}>
                {t(`offerType_${open.offer_type}`)}
              </Detail>
              <Detail label={t("fieldTime")}>
                {date(open.created_at, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </Detail>
              {open.organization ? (
                <Detail label={t("fieldPerson")}>{open.name}</Detail>
              ) : null}
              <Detail label={t("fieldEmail")} ltr>
                <a
                  className="underline-offset-4 hover:underline"
                  href={`mailto:${open.email}`}
                >
                  {open.email}
                </a>
              </Detail>
              <Detail label={t("fieldPhone")} ltr>
                {open.phone || "—"}
              </Detail>
              <Detail label={t("fieldDetails")}>
                {offerDetailText(open, language) || "—"}
              </Detail>
              {links.length ? (
                <Detail label={t("fieldLinks")} ltr>
                  {links.map((l) => (
                    <a
                      key={l}
                      href={l}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block underline-offset-4 hover:underline"
                    >
                      {l}
                    </a>
                  ))}
                </Detail>
              ) : null}
              {open.message ? (
                <Detail label={t("fieldNote")}>
                  <span className="whitespace-pre-wrap">{open.message}</span>
                </Detail>
              ) : null}
            </dl>
            <StatusPicker
              statuses={OFFER_STATUSES}
              prefix="offerStatus_"
              current={open.status}
              busy={busy}
              onChange={(s) => void change(open.id, s)}
            />
          </>
        ) : null}
      </Drawer>
    </>
  );
}

export function AssistantTab() {
  const { t, date } = useAdminCopy();
  const read = useServerFn(listAssistantReplies);
  const query = useQuery({
    queryKey: ["assistant-replies"],
    queryFn: () => read(),
    refetchInterval: 30_000,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () => filterAssistantReplies(query.data ?? [], search, "", ""),
    [query.data, search],
  );
  const last = Math.max(0, Math.ceil(rows.length / 20) - 1);
  const current = Math.min(page, last);
  return (
    <>
      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label={t("search")}
          className="ps-9"
          placeholder={t("searchAssistant")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <QueryState
        query={query}
        empty={t("noMatches")}
        isEmpty={rows.length === 0}
      >
        <ul className="grid gap-3">
          {rows.slice(current * 20, current * 20 + 20).map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium" dir="auto">
                  {row.visitor_name || "—"}
                </span>
                <span className="text-muted-foreground" dir="ltr">
                  {row.visitor_email}
                </span>
                <span className="ms-auto text-xs text-muted-foreground">
                  {date(row.created_at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p
                className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground"
                dir="auto"
              >
                {row.reply}
              </p>
            </li>
          ))}
        </ul>
        <Pager page={current} last={last} onPage={setPage} />
      </QueryState>
      <p className="mt-4 text-xs text-muted-foreground">{t("assistantNote")}</p>
    </>
  );
}

export function Pager({
  page,
  last,
  onPage,
}: {
  page: number;
  last: number;
  onPage: (page: number) => void;
}) {
  const { t } = useAdminCopy();
  if (last <= 0 && page === 0) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>{t("pageOf", { page: page + 1 })}</span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          {t("previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

export function InboxSection({
  tab,
  onTab,
  counts,
}: {
  tab: AdminTab | undefined;
  onTab: (tab: AdminTab) => void;
  counts: { requests?: number | undefined; offers?: number | undefined };
}) {
  const { t, dir } = useAdminCopy();
  const count = (n: number | undefined) =>
    n ? (
      <span className="min-w-5 rounded-full bg-brand px-1.5 text-xs font-semibold leading-5 text-foreground">
        {n}
      </span>
    ) : null;
  return (
    <div>
      <PageHeader title={t("navInbox")} description={t("navInboxDesc")} />
      <Tabs
        value={tab ?? "requests"}
        onValueChange={(v) => onTab(v as AdminTab)}
        dir={dir}
      >
        <TabsList>
          <TabsTrigger value="requests">
            {t("tabRequests")}
            {count(counts.requests)}
          </TabsTrigger>
          <TabsTrigger value="offers">
            {t("tabOffers")}
            {count(counts.offers)}
          </TabsTrigger>
          <TabsTrigger value="assistant">{t("tabAssistant")}</TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="offers">
          <OffersTab />
        </TabsContent>
        <TabsContent value="assistant">
          <AssistantTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Loads one private photo through an admin-checked call each time it is shown. */
function PrivatePhoto({
  requestId,
  path,
  name,
}: {
  requestId: string;
  path: string;
  name: string;
}) {
  const { t } = useAdminCopy();
  const load = useServerFn(getRequestAttachment);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    load({ data: { id: requestId, path } })
      .then((result) => {
        if (!alive) return;
        if (result.ok) setSrc(result.src);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [load, requestId, path]);
  if (failed)
    return (
      <span className="block p-3 text-xs text-muted-foreground">
        {t("attachmentFailed")}
      </span>
    );
  if (!src)
    return (
      <span className="flex aspect-video items-center justify-center">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
    );
  return (
    <img src={src} alt={name} className="aspect-video w-full object-cover" />
  );
}

/** Admin screen listing only enterprise service requests, with the shared request drawer. */
export function EnterpriseSection() {
  const { t } = useAdminCopy();
  return (
    <div>
      <PageHeader
        title={t("navEnterprise")}
        description={t("navEnterpriseDesc")}
      />
      <RequestsTab only="service" />
    </div>
  );
}

/** Saved team replies on a request: history with author and date, plus a box to add one. */
function RequestReplies({ requestId }: { requestId: string }) {
  const { t, date, language } = useAdminCopy();
  const queryClient = useQueryClient();
  const read = useServerFn(listRequestReplies);
  const save = useServerFn(addRequestReply);
  const replies = useQuery({
    queryKey: ["admin", "request-replies", requestId],
    queryFn: () => read({ data: { id: requestId } }),
  });
  const [needsReply, setNeedsReply] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const result = await save({ data: { id: requestId, body, needsReply } });
      if (!result.ok) return void toast.error(t("errReplySave"));
      setText("");
      setNeedsReply(false);
      toast.success(t("replySaved"));
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } catch {
      toast.error(t("errReplySave"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-4" aria-label={t("replies")}>
      <p className="mb-2 text-sm font-medium">{t("replies")}</p>
      {replies.isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (replies.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("repliesNone")}</p>
      ) : (
        <ol className="space-y-2">
          {(replies.data ?? []).map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border p-2 text-sm"
            >
              <span className="mb-1 block text-xs text-muted-foreground">
                <span dir="ltr">
                  {r.author_kind === "visitor"
                    ? t("visitorClarification")
                    : r.author_email || "—"}
                </span>{" "}
                ·{" "}
                {date(r.created_at, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              <p className="whitespace-pre-wrap break-words">{r.body}</p>
            </li>
          ))}
        </ol>
      )}
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={needsReply}
          onChange={(e) => setNeedsReply(e.target.checked)}
        />
        {adminDictionaries[language].consoleThisQuestionNeedsACustomerResponse}
      </label>
      <textarea
        className="mt-2 min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
        value={text}
        maxLength={5000}
        aria-label={t("replyWrite")}
        placeholder={t("replyWrite")}
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        size="sm"
        className="mt-2"
        disabled={busy || !text.trim()}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {t("replySave")}
      </Button>
    </section>
  );
}
