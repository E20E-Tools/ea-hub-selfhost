import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Users, Inbox, MessagesSquare, Star, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AdminTab } from "@/lib/admin-sections";
import { listVisitorProfiles } from "@/lib/visitors.functions";
import { adminTakeOverChat } from "@/lib/live-chat.functions";
import { getVisitStats } from "@/lib/site-visits.functions";
import { listTourVisits } from "@/lib/archy-tour-visits.functions";
import { summarizeTourVisits } from "@/lib/archy-tour-visits.shared";
import { toast } from "sonner";
import { RequestsTab, OffersTab, AssistantTab } from "./inbox";
import { LiveChatSection } from "./live-chat";
import { FeedbackSection } from "./feedback";
import { PageHeader, QueryState, useAdminCopy } from "./ui";

export function CustomersSection({
  tab,
  onTab,
}: {
  tab: AdminTab | undefined;
  onTab: (tab: AdminTab) => void;
}) {
  const { t, date, dir } = useAdminCopy();
  const client = useQueryClient();
  const read = useServerFn(listVisitorProfiles);
  const visitors = useQuery({
    queryKey: ["admin", "visitors"],
    queryFn: () => read(),
    refetchInterval: 30_000,
  });
  const [email, setEmail] = useState("");
  const readTours = useServerFn(listTourVisits);
  const tours = useQuery({
    queryKey: ["admin", "tour-visits"],
    queryFn: () => readTours(),
    refetchInterval: 30_000,
  });
  const takeOver = useServerFn(adminTakeOverChat);
  const engagement = tours.data ? summarizeTourVisits(tours.data) : null;
  const [busy, setBusy] = useState<string | null>(null);
  const route = async (visitorEmail: string, chatId: string) => {
    setBusy(chatId);
    try {
      await takeOver({ data: { chatId } });
      toast.success(t("cwTakenOver"));
      void client.invalidateQueries({ queryKey: ["admin"] });
      setEmail(visitorEmail);
      onTab("conversations");
    } catch {
      toast.error(t("cwTakeOverFailed"));
    } finally {
      setBusy(null);
    }
  };
  const readStats = useServerFn(getVisitStats);
  const stats = useQuery({
    queryKey: ["admin", "visit-stats"],
    queryFn: () => readStats(),
    refetchInterval: 60_000,
  });
  const [search, setSearch] = useState("");
  const rows = (visitors.data ?? []).filter((v) =>
    `${v.name} ${v.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = visitors.data?.find((v) => v.email === email);
  const tiles = [
    { label: "cwVisitors", value: visitors.data?.length, icon: Users, tab: "visitors" },
    {
      label: "cwSupport",
      value: visitors.data?.reduce((n, v) => n + v.supportRequests, 0),
      icon: Inbox,
      tab: "requests",
    },
    {
      label: "navLiveChat",
      value: visitors.data?.reduce((n, v) => n + v.chats, 0),
      icon: MessagesSquare,
      tab: "conversations",
    },
  ] as const;
  return (
    <div className="min-w-0">
      <PageHeader
        title={t("navCustomers")}
        actions={
          <Button
            variant="outline"
            size="icon"
            aria-label={t("cwRefresh")}
            onClick={() => void client.invalidateQueries({ queryKey: ["admin"] })}
          >
            <RefreshCw className="size-4" />
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map(({ label, value, icon: Icon, tab: target }) => (
          <Button
            key={label}
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-4"
            onClick={() => onTab(target)}
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <span className="text-start">
              <span className="block text-xl font-semibold">{value ?? "—"}</span>
              {t(label)}
            </span>
          </Button>
        ))}
      </div>
      <p className="-mt-3 mb-5 text-xs text-muted-foreground">{t("cwTilesScope")}</p>
      <section
        aria-label={t("vsTitle")}
        className="mb-5 rounded-lg border border-border bg-card p-4"
      >
        <p className="mb-3 text-sm font-medium">{t("vsTitle")}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["vsToday", stats.data?.today],
              ["vsReturning", stats.data?.returning],
              ["vsChatted", stats.data?.chatted],
              ["vsRequested", stats.data?.requested],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{t(label)}</dt>
              <dd className="text-xl font-semibold">{stats.isError ? "!" : (value ?? "—")}</dd>
            </div>
          ))}
        </dl>
        {stats.data?.contacts.length ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {stats.data.contacts.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  className="rounded-full border border-border px-2 py-1 hover:bg-muted"
                  onClick={() => {
                    setEmail(c.email);
                    onTab(c.chat ? "conversations" : "requests");
                  }}
                >
                  {c.name || c.email} ·{" "}
                  {[c.chat && t("vsChat"), c.request && t("vsRequest")].filter(Boolean).join(" + ")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">{t("vsNote")}</p>
      </section>
      {selected ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-border py-3 text-sm">
          <strong>{selected.name || selected.email}</strong>
          <span dir="ltr" className="break-all text-muted-foreground">
            {selected.email}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEmail("")}>
            {t("cwClear")}
          </Button>
        </div>
      ) : null}
      <Tabs value={tab ?? "requests"} onValueChange={(v) => onTab(v as AdminTab)} dir={dir}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="requests">
            <Inbox className="size-4" />
            {t("tabRequests")}
          </TabsTrigger>
          <TabsTrigger value="offers">{t("tabOffers")}</TabsTrigger>
          <TabsTrigger value="conversations">
            <MessagesSquare className="size-4" />
            {t("navLiveChat")}
          </TabsTrigger>
          <TabsTrigger value="assistant">
            <Bot className="size-4" />
            {t("tabAssistant")}
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <Star className="size-4" />
            {t("navFeedback")}
          </TabsTrigger>
          <TabsTrigger value="visitors">
            <Users className="size-4" />
            {t("cwVisitors")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <RequestsTab email={email} />
        </TabsContent>
        <TabsContent value="offers">
          <OffersTab />
        </TabsContent>
        <TabsContent value="conversations">
          <LiveChatSection email={email} embedded />
        </TabsContent>
        <TabsContent value="assistant">
          <AssistantTab />
        </TabsContent>
        <TabsContent value="feedback">
          <FeedbackSection email={email} embedded />
        </TabsContent>
        <TabsContent value="visitors">
          <section className="mb-6 min-w-0" aria-label={t("tourVisits")}>
            <h2 className="mb-3 text-base font-semibold">{t("tourVisits")}</h2>
            <section className="mb-5 border-y border-border py-4" aria-label={t("tourEngagement")}>
              <h3 className="font-semibold">{t("tourEngagement")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("tourEngagementScope")}</p>
              <dl className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4">
                {[
                  ["tourUniqueStarted", engagement?.started],
                  ["tourUniqueCompleted", engagement?.completed],
                  ["tourUniqueChat", engagement?.chatted],
                  ["tourUniqueSupport", engagement?.supported],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{t(String(key))}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                <span>{t("tourCompletionRate")}</span>
                <strong dir="ltr">
                  {engagement?.completionRate != null ? `${engagement.completionRate}%` : "—"}
                </strong>
                <progress
                  className="h-2 w-40 accent-primary"
                  max={100}
                  value={engagement?.completionRate ?? 0}
                  aria-label={t("tourCompletionRate")}
                />
              </div>
            </section>
            <QueryState query={tours} empty={t("noMatches")} isEmpty={!tours.data?.length}>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      {[
                        "cwVisitors",
                        "tourStarted",
                        "tourCompleted",
                        "tourChat",
                        "tourSupport",
                      ].map((key) => (
                        <th key={key} className="px-3 py-3 text-start font-medium">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tours.data?.map((v) => (
                      <tr key={v.id} className="border-b border-border">
                        <td className="px-3 py-3">
                          <strong className="block">{v.visitor_name || t("tourAnonymous")}</strong>
                          <span dir="ltr" className="text-xs text-muted-foreground">
                            {v.visitor_email || v.visitor_key.slice(0, 8)}
                          </span>
                        </td>
                        {[
                          v.started_at,
                          v.completed_at,
                          v.chat_opened_at,
                          v.support_submitted_at,
                        ].map((at, i) => (
                          <td key={i} className="whitespace-nowrap px-3 py-3">
                            {at ? date(at, { dateStyle: "short", timeStyle: "short" }) : "—"}
                            {i === 3 && v.support_request_id ? (
                              <span className="block text-xs text-muted-foreground" dir="ltr">
                                {v.support_request_id}
                              </span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QueryState>
          </section>
          <Input
            className="mb-4 max-w-lg"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("cwSearch")}
            placeholder={t("cwSearch")}
          />
          <QueryState query={visitors} empty={t("noMatches")} isEmpty={rows.length === 0}>
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {[
                      "fieldEmail",
                      "cwRegistered",
                      "cwVerification",
                      "cwFirstContact",
                      "cwSupport",
                      "tabRequests",
                      "navLiveChat",
                      "openDetails",
                    ].map((key) => (
                      <th key={key} className="whitespace-nowrap px-3 py-3 text-start font-medium">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.email} className="border-b border-border">
                      <td className="px-3 py-3">
                        <strong className="block">{v.name || "—"}</strong>
                        <span dir="ltr">{v.email}</span>
                      </td>
                      <td className="whitespace-nowrap px-3">
                        {v.registeredAt
                          ? date(v.registeredAt, { dateStyle: "medium" })
                          : t("cwNotRegistered")}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <span
                          className={
                            v.verified
                              ? "rounded-full bg-primary/10 px-2 py-0.5 text-primary"
                              : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
                          }
                        >
                          {t(v.verified ? "cwVerified" : "cwUnverified")}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3">
                        {date(v.firstContactAt, { dateStyle: "medium" })}
                      </td>
                      <td className="px-3">
                        {v.supportRequests}
                        {v.openSupport ? (
                          <span className="ms-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                            {v.openSupport} {t("cwOpenSupport")}
                          </span>
                        ) : null}
                        {v.lastPage ? (
                          <span
                            className="mt-1 block text-xs text-muted-foreground"
                            dir="ltr"
                            title={t("cwLastPage")}
                          >
                            {v.lastPage}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3">{v.requests}</td>
                      <td className="px-3">{v.chats}</td>
                      <td className="flex flex-wrap gap-2 px-3 py-3">
                        {v.openChatId && v.openChatStatus !== "active" && (
                          <Button
                            size="sm"
                            disabled={busy === v.openChatId}
                            onClick={() => {
                              if (v.openChatId) void route(v.email, v.openChatId);
                            }}
                          >
                            {t("cwTakeOver")}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEmail(v.email);
                            onTab("conversations");
                          }}
                        >
                          {t("openDetails")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </QueryState>
        </TabsContent>
      </Tabs>
    </div>
  );
}
