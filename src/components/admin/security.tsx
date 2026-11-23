import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Info, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADMIN_PASSWORD_MIN,
  changeAdminPassword,
  listAdminActivity,
  listAdmins,
} from "@/lib/admin.functions";
import { ACTIVITY_GROUPS, activityCsv, type ActivityGroup } from "@/lib/admin-monitor.shared";
import { actionLabel } from "@/lib/admin-copy";
import { ADMIN_SECTION_TABS, TAB_LABELS, type AdminTab } from "@/lib/admin-sections";
import { downloadCsv, Pager } from "./inbox";
import { Card, Field, FieldError, PageHeader, QueryState, selectClass, useAdminCopy } from "./ui";
import { MfaReadiness } from "./operations";

export function passwordStrength(password: string): "weak" | "fair" | "strong" {
  let score = 0;
  if (password.length >= ADMIN_PASSWORD_MIN) score += 1;
  if (password.length >= 14) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return score >= 4 ? "strong" : score >= 2 ? "fair" : "weak";
}

function AccountTab({ account }: { account: string }) {
  const { t } = useAdminCopy();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const strength = passwordStrength(next);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next.length < ADMIN_PASSWORD_MIN) return setError(t("passwordTooShort"));
    if (next.trim().toLowerCase() === account.toLowerCase()) return setError(t("passwordIsEmail"));
    if (next !== confirm) return setError(t("passwordMismatch"));
    setError("");
    setBusy(true);
    try {
      const result = await changeAdminPassword({
        data: { currentPassword: current, password: next },
      });
      if (!result.ok) {
        setError(t(result.message));
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("passwordChanged"));
    } catch {
      setError(t("errPasswordUpdate"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t("myAccount")} description={t("myAccountDesc")} className="max-w-xl">
      <p className="mb-5 text-sm">
        <span className="text-muted-foreground">{t("email")}: </span>
        <bdi dir="ltr">{account || "—"}</bdi>
      </p>
      <form className="grid gap-4" onSubmit={(e) => void submit(e)}>
        <Field label={t("currentPassword")} htmlFor="pw-current">
          <Input
            id="pw-current"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={t("newPassword")} hint={t("passwordRule")} htmlFor="pw-new">
          <Input
            id="pw-new"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            maxLength={200}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        {next ? (
          <div className="-mt-2 grid gap-1" aria-live="polite">
            <div className="flex gap-1" aria-hidden="true">
              {(["weak", "fair", "strong"] as const).map((level, i) => (
                <span
                  key={level}
                  className={`h-1 flex-1 rounded-full ${i <= ["weak", "fair", "strong"].indexOf(strength) ? (strength === "weak" ? "bg-destructive" : strength === "fair" ? "bg-brand" : "bg-status") : "bg-muted"}`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {t("strength", { level: t(`strength_${strength}`) })}
            </span>
          </div>
        ) : null}
        <Field label={t("confirmPassword")} htmlFor="pw-confirm">
          <Input
            id="pw-confirm"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            maxLength={200}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error ? <FieldError text={error} /> : null}
        <div>
          <Button type="submit" disabled={busy || !current || !next || !confirm}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t("changePassword")}
          </Button>
        </div>
      </form>
      <MfaReadiness />
    </Card>
  );
}

function AdminsTab() {
  const { t, date } = useAdminCopy();
  const read = useServerFn(listAdmins);
  const query = useQuery({ queryKey: ["admin-accounts"], queryFn: () => read() });
  const rows = query.data ?? [];
  return (
    <Card title={t("tabAdmins")} description={t("adminsDesc")}>
      <p className="mb-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("adminsNote")}
      </p>
      <QueryState query={query} empty={t("noAdmins")} isEmpty={rows.length === 0}>
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">{t("email")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colCreated")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colLastSignIn")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2.5" dir="ltr">
                    <span className="block text-start">{row.email}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {date(row.created_at, { dateStyle: "medium" })}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{date(row.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
    </Card>
  );
}

const PAGE = 25;

export function ActivityTab() {
  const { t, date, language } = useAdminCopy();
  const read = useServerFn(listAdminActivity);
  const [group, setGroup] = useState<ActivityGroup>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const filters = {
    group: group === "all" ? undefined : group,
    search: search.trim() || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59.999Z` : undefined,
  };
  // One extra row tells whether a next page exists.
  const query = useQuery({
    queryKey: ["admin-activity", filters, page],
    queryFn: () => read({ data: { ...filters, limit: PAGE + 1, offset: page * PAGE } }),
    placeholderData: keepPreviousData,
  });
  const rows = (query.data ?? []).slice(0, PAGE);
  const hasNext = (query.data ?? []).length > PAGE;
  const reset = () => setPage(0);

  const exportAll = async () => {
    const all = await read({ data: { ...filters, limit: 200, offset: 0 } });
    downloadCsv("ea-hub-activity.csv", activityCsv(all));
  };

  return (
    <Card
      title={t("tabActivity")}
      description={t("activityDesc")}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={!rows.length}
            onClick={() => void exportAll()}
          >
            <Download className="size-4" aria-hidden="true" />
            {t("exportCsv")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("refresh")}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label={t("search")}
            className="ps-9"
            placeholder={t("searchActivity")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              reset();
            }}
          />
        </div>
        <select
          aria-label={t("activityGroup")}
          className={selectClass}
          value={group}
          onChange={(e) => {
            if (e.target.value in ACTIVITY_GROUPS) setGroup(e.target.value as ActivityGroup);
            reset();
          }}
        >
          {Object.keys(ACTIVITY_GROUPS).map((key) => (
            <option key={key} value={key}>
              {t(`group_${key}`)}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label={t("dateFrom")}
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            reset();
          }}
        />
        <Input
          type="date"
          aria-label={t("dateTo")}
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            reset();
          }}
        />
      </div>
      <QueryState query={query} empty={t("noMatches")} isEmpty={rows.length === 0}>
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">{t("fieldTime")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colActor")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colAction")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colTarget")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-b-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {date(row.created_at, { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2.5" dir="ltr">
                    <span className="block text-start">{row.actor_email || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">{actionLabel(language, row.action)}</td>
                  <td className="max-w-72 break-words px-3 py-2.5 text-muted-foreground" dir="auto">
                    {row.target || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} last={hasNext ? page + 1 : page} onPage={setPage} />
      </QueryState>
      <p className="mt-4 text-xs text-muted-foreground">{t("activityNote")}</p>
    </Card>
  );
}

export function SecuritySection({
  tab,
  onTab,
  account,
}: {
  tab: AdminTab | undefined;
  onTab: (tab: AdminTab) => void;
  account: string;
}) {
  const { t, dir } = useAdminCopy();
  return (
    <div>
      <PageHeader title={t("navSecurity")} description={t("navSecurityDesc")} />
      <Tabs value={tab ?? "account"} onValueChange={(v) => onTab(v as AdminTab)} dir={dir}>
        <TabsList>
          {ADMIN_SECTION_TABS.security.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(TAB_LABELS[id])}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="account">
          <AccountTab account={account} />
        </TabsContent>
        <TabsContent value="admins">
          <AdminsTab />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
