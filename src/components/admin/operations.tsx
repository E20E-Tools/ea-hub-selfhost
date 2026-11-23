import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getApplicationHealth,
  listSettingsVersions,
  previewSettingsRestore,
  restoreSettingsVersion,
  getRetentionPolicies,
  saveRetentionPolicy,
  previewRetention,
  cleanupRetention,
} from "@/lib/operations.functions";
import { QueryState, useAdminCopy, useDraft, SaveBar } from "./ui";

export function ApplicationHealth() {
  const { t, date } = useAdminCopy();
  const q = useQuery({
    queryKey: ["admin", "application-health"],
    queryFn: () => getApplicationHealth(),
  });
  const state = (v: string | null | undefined) =>
    t(
      v === "local"
        ? "settingsLocalSemantic"
        : v === "configured"
          ? "opsConfigured"
          : v === "needsSetup"
            ? "opsNeedsSetup"
            : v === "blocked"
              ? "opsBlocked"
              : "opsUnknown",
    );
  return (
    <section className="my-6 border-y border-border py-5" aria-label={t("opsHealth")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t("opsHealth")}</h2>
        <Button variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className="size-4" />
          {t("opsRefresh")}
        </Button>
      </header>
      <QueryState query={q} empty={t("opsUnknown")} isEmpty={false}>
        {q.data && (
          <>
            {q.data.aiAlert ? (
              <p
                role="alert"
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {t(q.data.aiAlert.reason === "streak" ? "opsAiAlertStreak" : "opsAiAlertRate", {
                  streak: q.data.aiAlert.streak,
                  failures: q.data.aiAlert.hourFailures,
                  samples: q.data.aiAlert.hourSamples,
                })}
              </p>
            ) : null}
            {q.data.budgetAlerts?.map((alert) => (
              <p
                key={alert.kind}
                role="alert"
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {t(alert.kind === "request" ? "opsBudgetAlertRequest" : "opsBudgetAlertChat", {
                  used: alert.used,
                  limit: alert.limit,
                })}
              </p>
            ))}
            {q.data.chatHealth ? (
              <section className="mb-4 border-y border-border py-3" aria-label={t("opsChatHealth")}>
                <h3 className="font-medium">{t("opsChatHealth")}</h3>
                {q.data.chatHealth.alert ? (
                  <p
                    role="alert"
                    className="my-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
                  >
                    {q.data.chatHealth.alert.reason === "slow"
                      ? t("opsChatAlertSlow", {
                          median: q.data.chatHealth.alert.medianMs,
                          samples: q.data.chatHealth.alert.hourSamples,
                        })
                      : t("opsChatAlertLow", {
                          success: q.data.chatHealth.alert.hourSuccess,
                          samples: q.data.chatHealth.alert.hourSamples,
                        })}
                  </p>
                ) : null}
                {q.data.chatHealth.hourSamples === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("opsChatNone")}</p>
                ) : (
                  <dl className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <dt>{t("opsChatSuccessHour")}</dt>
                      <dd className="tabular-nums">{q.data.chatHealth.hourSuccess}</dd>
                    </div>
                    <div>
                      <dt>{t("opsChatSamplesHour")}</dt>
                      <dd className="tabular-nums">{q.data.chatHealth.hourSamples}</dd>
                    </div>
                    <div>
                      <dt>{t("opsChatMedian")}</dt>
                      <dd className="tabular-nums">
                        {q.data.chatHealth.medianMs ?? t("opsUnknown")}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("opsChatP95")}</dt>
                      <dd className="tabular-nums">{q.data.chatHealth.p95Ms ?? t("opsUnknown")}</dd>
                    </div>
                  </dl>
                )}
              </section>
            ) : null}
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt>{t("opsAssistant")}</dt>
                <dd>
                  {q.data.assistant === null
                    ? t("opsUnknown")
                    : q.data.assistant
                      ? t("enabled")
                      : t("disabled")}
                </dd>
                <dd>{state(q.data.provider)}</dd>
                <dt>{t("opsProvider")}</dt>
                <dd>
                  <bdi>
                    {q.data.provider === "local"
                      ? t("settingsLocalSemantic")
                      : (q.data.providerHost ?? t("opsUnknown"))}
                  </bdi>
                </dd>
                <dt>{t("opsModel")}</dt>
                <dd className="break-all">
                  <bdi>{q.data.model ?? t("opsUnknown")}</bdi>
                </dd>
                <dt>{t("opsObserved")}</dt>
                <dd>
                  {q.data.providerObservation
                    ? t(
                        q.data.providerObservation.outcome === "success"
                          ? "opsAnswered"
                          : "opsAnswerFailed",
                      )
                    : t("opsUnknown")}
                </dd>
                {q.data.providerObservation && (
                  <dd>
                    {date(q.data.providerObservation.measuredAt)} ·{" "}
                    {q.data.providerObservation.durationMs} ms
                  </dd>
                )}
              </div>
              <div>
                <dt>{t("opsMail")}</dt>
                <dd>{state(q.data.mail)}</dd>
                <dt>{t("opsDelivery")}</dt>
                <dd>{t("opsUnknown")}</dd>
              </div>
              <div>
                <dt>{t("opsRefresh")}</dt>
                <dd>{date(q.data.checkedAt)}</dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {q.data.measurements?.map((m) => (
                <dl key={m.operation} className="border-s border-border ps-3">
                  <dt className="font-medium">
                    {t(
                      m.operation === "assistant"
                        ? "opsAssistant"
                        : m.operation === "request"
                          ? "opsRequest"
                          : "opsRecommendation",
                    )}
                  </dt>
                  <dt>{t("opsSuccess")}</dt>
                  <dd>{m.success}</dd>
                  <dt>{t("opsFailure")}</dt>
                  <dd>{m.failure}</dd>
                  <dt>{t("opsDuration")}</dt>
                  <dd>{m.meanMs ?? t("opsUnknown")}</dd>
                </dl>
              )) ?? <p>{t("opsUnknown")}</p>}
            </div>
            <details className="mt-4 text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                {t("opsMethodNote")}
              </summary>
              <ul className="mt-2 grid list-disc gap-1 ps-5">
                {(
                  [
                    "opsHealthHint",
                    "opsChatHealthHint",
                    "opsProviderHelp",
                    "opsObservationHint",
                    "opsMailHelp",
                  ] as const
                ).map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </QueryState>
    </section>
  );
}

export function SettingsHistory() {
  const { t, date } = useAdminCopy();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSettingsRestore>> | null>(
    null,
  );
  const q = useQuery({
    queryKey: ["admin", "settings-history"],
    queryFn: () => listSettingsVersions(),
  });
  const show = async (id: string) => {
    setError("");
    setBusy(true);
    try {
      setPreview(await previewSettingsRestore({ data: { id } }));
    } catch {
      setError(t("historyLoadFailed"));
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await restoreSettingsVersion({
        data: {
          id: preview.id,
          expected: preview.current as Record<string, unknown>,
          confirm: true,
        },
      });
      setPreview(null);
      await cache.invalidateQueries();
    } catch {
      setError(t("settingsConflict"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label={t("opsHistory")}>
      <h2 className="font-semibold">{t("opsHistory")}</h2>
      <p className="my-2 text-sm text-muted-foreground">{t("opsHistoryHint")}</p>
      <Button variant="outline" onClick={() => void q.refetch()}>
        <RefreshCw className="size-4" />
        {t("opsRefresh")}
      </Button>
      {error && (
        <p role="alert" className="my-2 text-destructive">
          {error}
        </p>
      )}
      <QueryState query={q} empty={t("opsNoHistory")} isEmpty={!q.data?.length}>
        <ul className="mt-4 divide-y divide-border">
          {q.data?.map((h) => (
            <li key={h.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2">
                <span>
                  {h.section} · {date(h.created_at)} ·{" "}
                  <bdi>{h.actor_label || h.actor_id || t("opsUnknown")}</bdi>
                </span>
                <Button variant="outline" disabled={busy} onClick={() => void show(h.id)}>
                  <History className="size-4" />
                  {t("opsPreview")}
                </Button>
              </div>
              <details className="mt-2">
                <summary>
                  {t("opsPrevious")} / {t("opsNew")}
                </summary>
                <pre
                  className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs"
                  dir="ltr"
                >
                  {JSON.stringify({ previous: h.previous_value, next: h.new_value }, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </QueryState>
      {preview && (
        <section className="my-4 border-y border-border py-4" aria-label={t("opsPreview")}>
          <h3 className="font-semibold">{preview.section}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["opsCurrent", preview.current],
              ["opsPrevious", preview.restore],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <h4>{t(String(label))}</h4>
                <pre
                  className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs"
                  dir="ltr"
                >
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
          <Button onClick={() => void restore()} disabled={busy}>
            <RotateCcw className="size-4" />
            {t("opsRestore")}
          </Button>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            {t("cancel")}
          </Button>
        </section>
      )}
    </section>
  );
}

type Policy = Awaited<ReturnType<typeof getRetentionPolicies>>[number];
function PolicyRow({ policy }: { policy: Policy }) {
  const { t } = useAdminCopy();
  const cache = useQueryClient();
  const draft = useDraft(policy);
  const value = draft.value ?? policy;
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewRetention>> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const show = async () => {
    setError("");
    setBusy(true);
    try {
      setPreview(await previewRetention({ data: { type: policy.type } }));
      setConfirmation("");
    } catch {
      setError(t("retentionLoadFailed"));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await saveRetentionPolicy({ data: value });
      setPreview(null);
      draft.reset({ ...value, revision: value.revision + 1 });
      await cache.invalidateQueries({ queryKey: ["admin", "retention"] });
    } catch {
      setError(t("retentionConflict"));
    } finally {
      setBusy(false);
    }
  };
  const cleanup = async () => {
    if (!preview || confirmation !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      await cleanupRetention({
        data: {
          type: preview.type,
          ids: preview.candidates.map((c) => c.candidate_id),
          revision: preview.revision,
          confirm: "DELETE",
          proof: preview.proof,
        },
      });
      setPreview(null);
      setConfirmation("");
      await cache.invalidateQueries({ queryKey: ["admin"] });
    } catch {
      setError(t("retentionConflict"));
    } finally {
      setBusy(false);
    }
  };
  const title = t(
    policy.type === "chats" ? "opsChats" : policy.type === "visits" ? "opsVisits" : "opsTelemetry",
  );
  return (
    <section className="my-4 border-y border-border py-4" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      <div className="my-3 flex flex-wrap items-center gap-4">
        <label>
          {t("opsDays")}
          <Input
            type="number"
            min={30}
            max={730}
            disabled={policy.type === "chats"}
            value={value.days}
            onChange={(e) => draft.setValue({ ...value, days: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2">
          <Switch
            checked={value.manualEnabled}
            onCheckedChange={(manualEnabled) => draft.setValue({ ...value, manualEnabled })}
          />
          {t("opsManual")}
        </label>
        <Button variant="outline" disabled={busy || draft.dirty} onClick={() => void show()}>
          {t("opsPreview")}
        </Button>
      </div>
      <SaveBar
        dirty={draft.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={draft.discard}
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p>
            {t("opsTotal")}: {preview.total ?? t("opsUnknown")}
          </p>
          <p>
            {t("opsCandidates")}: {preview.candidates.length}
          </p>
          {preview.hasMore && <p>{t("opsMoreCandidates")}</p>}
          <ul className="my-2 max-h-48 overflow-auto text-xs" dir="ltr">
            {preview.candidates.map((c) => (
              <li key={c.candidate_id}>
                {c.candidate_id} · {c.eligible_at}
              </li>
            ))}
          </ul>
          <label>
            {t("opsConfirmDelete")}
            <Input
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <Button
            variant="destructive"
            disabled={
              busy ||
              !preview.enabled ||
              !preview.candidates.length ||
              confirmation !== "DELETE" ||
              draft.dirty
            }
            onClick={() => void cleanup()}
          >
            {t("opsCleanup")}
          </Button>
        </>
      )}
    </section>
  );
}
export function RetentionManagement() {
  const { t } = useAdminCopy();
  const q = useQuery({
    queryKey: ["admin", "retention"],
    queryFn: () => getRetentionPolicies(),
  });
  return (
    <section>
      <h2 className="font-semibold">{t("opsRetention")}</h2>
      <p className="my-2 text-sm text-muted-foreground">{t("opsRetentionHint")}</p>
      <QueryState query={q} empty={t("opsUnknown")} isEmpty={false}>
        {q.data?.map((p) => (
          <PolicyRow key={p.type + ":" + p.revision} policy={p} />
        ))}
      </QueryState>
    </section>
  );
}
export function MfaReadiness() {
  const { t } = useAdminCopy();
  return (
    <section className="mt-6 border-y border-border py-4">
      <h2 className="font-semibold">{t("opsMfa")}</h2>
      <p className="my-2 text-sm text-muted-foreground">{t("opsMfaGuide")}</p>
      <p>{t("opsMfaStatus")}</p>
    </section>
  );
}
