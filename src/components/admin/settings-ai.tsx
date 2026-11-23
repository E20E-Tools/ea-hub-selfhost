import { adminDictionaries } from "@/lib/admin-copy";
import { ArchyOperations } from "./archy-operations";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ArchyLibrary, type TestCase } from "./archy-library";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getAiSettings,
  listOpenAiModels,
  saveAiSettings,
  saveRegistrationPolicy,
  testArchyChat,
  applyChatEngine,
  type AiSettingsView,
  type AiSpeed,
} from "@/lib/ai-settings.functions";
import { getAdminAiUsage } from "@/lib/admin-monitor.functions";
import {
  Card,
  ErrorBlock,
  LoadingBlock,
  SaveBar,
  SettingRow,
  selectClass,
  useAdminCopy,
  useDraft,
} from "./ui";

const GROQ = "https://api.groq.com/openai/v1";
const OPENROUTER = "https://openrouter.ai/api/v1";
const OPENAI = "https://api.openai.com/v1";

export const AI_PRESETS = [
  {
    name: "GPT-4o mini",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-4o-mini",
    free: false,
  },
  {
    name: "GPT-4.1",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-4.1",
    free: false,
  },
  {
    name: "GPT-5",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-5",
    free: false,
  },
  {
    name: "GPT-5 mini",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-5-mini",
    free: false,
  },
  {
    name: "GPT-5 nano",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-5-nano",
    free: false,
  },
  {
    name: "GPT-5.1",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-5.1",
    free: false,
  },
  {
    name: "GPT-4.1 mini",
    provider: "ChatGPT (OpenAI)",
    url: OPENAI,
    model: "gpt-4.1-mini",
    free: false,
  },
  {
    name: "Llama 3.3 70B",
    provider: "OpenRouter",
    url: OPENROUTER,
    model: "meta-llama/llama-3.3-70b-instruct:free",
    free: true,
  },
  {
    name: "DeepSeek V3",
    provider: "OpenRouter",
    url: OPENROUTER,
    model: "deepseek/deepseek-chat-v3-0324:free",
    free: true,
  },
  {
    name: "Qwen 2.5 72B",
    provider: "OpenRouter",
    url: OPENROUTER,
    model: "qwen/qwen-2.5-72b-instruct:free",
    free: true,
  },
  {
    name: "Claude Sonnet",
    provider: "OpenRouter",
    url: OPENROUTER,
    model: "anthropic/claude-sonnet-4",
    free: false,
  },
  {
    name: "Llama 3.3 70B",
    provider: "Groq",
    url: GROQ,
    model: "llama-3.3-70b-versatile",
    free: true,
  },
  {
    name: "GPT-OSS 120B",
    provider: "Groq",
    url: GROQ,
    model: "openai/gpt-oss-120b",
    free: true,
  },
];

type AiDraft = {
  baseUrl: string;
  model: string;
  speed: AiSpeed;
  apiKey: string;
  removeKey: boolean;
};

function Usage() {
  const { t } = useAdminCopy();
  const read = useServerFn(getAdminAiUsage);
  const usage = useQuery({
    queryKey: ["admin-ai-usage"],
    queryFn: () => read(),
    refetchInterval: 30_000,
  });
  const d = usage.data;
  return (
    <Card
      title={t("aiUsage")}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("refresh")}
          disabled={usage.isFetching}
          onClick={() => void usage.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      }
    >
      {usage.isError ? (
        <ErrorBlock onRetry={() => void usage.refetch()} />
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            [t("aiUsageChat"), d ? `${d.chat} / ${d.chatLimit}` : "—"],
            [
              t("aiUsageRecommendations"),
              d ? `${d.recommendations} / ${d.recommendationLimit}` : "—",
            ],
            [t("aiUsageBans"), d ? `${d.bans}` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums" dir="ltr">
                <span className="block text-start">{value}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("aiUsageNote")}</p>
    </Card>
  );
}

type Engine = "remote" | "local";
const engines = ["remote", "local"] as const;
type Outcome =
  | { state: "loading" | "unavailable" | "error" | "denied" }
  | { state: "done"; reply: string; source: string; model: string | null };
type Comparison = {
  expected: string;
  question: string;
  results: Record<Engine, Outcome>;
};

function ArchyComparison({
  settings,
  dirty,
  label,
}: {
  settings: AiSettingsView;
  dirty: boolean;
  label: (engine: Engine) => string;
}) {
  const { language } = useAdminCopy();
  const ar = language === "ar";
  const test = useServerFn(testArchyChat);
  const [question, setQuestion] = useState("");
  const [rounds, setRounds] = useState<Comparison[]>([]);
  const [busy, setBusy] = useState(false);
  const remoteAvailable = settings.keySource !== "none";
  const localAvailable = settings.localAvailable;

  async function evaluate(
    message: string,
    replyLanguage: "ar" | "en",
    index: number,
    history: Comparison[],
    expected = "",
  ) {
    setRounds((prev) => [
      ...prev,
      {
        question: message,
        expected,
        results: {
          remote: { state: remoteAvailable ? "loading" : "unavailable" },
          local: { state: localAvailable ? "loading" : "unavailable" },
        },
      },
    ]);
    await Promise.all(
      engines.map(async (engine) => {
        if (!(engine === "remote" ? remoteAvailable : localAvailable)) return;
        const turns = history
          .flatMap((round) => {
            const result = round.results[engine];
            return result.state === "done"
              ? [
                  { role: "user" as const, content: round.question },
                  {
                    role: "assistant" as const,
                    content: result.reply.slice(0, 4000),
                  },
                ]
              : [];
          })
          .slice(-8);
        let outcome: Outcome;
        try {
          const result = await test({
            data: {
              engine,
              language: replyLanguage,
              turns: [...turns, { role: "user", content: message }],
            },
          });
          outcome = result.ok
            ? { state: "done", ...result }
            : { state: result.denied ? "denied" : "error" };
        } catch {
          outcome = { state: "error" };
        }
        setRounds((prev) =>
          prev.map((round, i) =>
            i === index
              ? { ...round, results: { ...round.results, [engine]: outcome } }
              : round,
          ),
        );
      }),
    );
  }
  async function compare(cases?: TestCase[]) {
    if (busy || dirty || !(remoteAvailable || localAvailable)) return;
    const group = cases ?? [{ question: question.trim(), language }];
    if (!group.length || !group[0]?.question) return;
    setBusy(true);
    if (cases) setRounds([]);
    else setQuestion("");
    try {
      for (const [i, item] of group.entries()) {
        await evaluate(
          item.question,
          item.language,
          cases ? i : rounds.length,
          cases ? [] : rounds,
          "expected" in item ? item.expected : "",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={adminDictionaries[ar ? "ar" : "en"].consoleCompareArchyReplies}>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void compare();
        }}
      >
        <label htmlFor="archy-test-input">
          {adminDictionaries[ar ? "ar" : "en"].consoleOneQuestionForBothEngines}
        </label>
        <textarea
          id="archy-test-input"
          dir="auto"
          className="rounded-lg border bg-background p-3"
          rows={2}
          value={question}
          maxLength={1200}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {dirty && (
          <p>
            {adminDictionaries[ar ? "ar" : "en"].consoleSaveOrDiscardYourSettingsChangesBefore}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={
              dirty ||
              busy ||
              !question.trim() ||
              !(remoteAvailable || localAvailable)
            }
          >
            {busy
              ? adminDictionaries[ar ? "ar" : "en"].consoleComparing
              : adminDictionaries[ar ? "ar" : "en"].consoleCompareReplies}
          </Button>
          {rounds.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setRounds([]);
                setQuestion("");
              }}
            >
              {adminDictionaries[ar ? "ar" : "en"].consoleNewComparison}
            </Button>
          )}
        </div>
      </form>
      <ArchyLibrary
        ar={ar}
        blocked={busy || dirty || !(remoteAvailable || localAvailable)}
        run={compare}
      />
      <div id="archy-test-results" className="grid gap-4">
        {rounds.map((round, i) => (
          <section key={i} className="mt-3 grid gap-2">
            <h3 dir="auto" className="font-semibold">
              {round.question}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {engines.map((engine) => {
                const result = round.results[engine];
                return (
                  <article
                    key={engine}
                    data-engine={engine}
                    aria-live="polite"
                    className="min-w-0 rounded-xl border bg-muted/30 p-4"
                  >
                    <h4 className="mb-2 font-semibold">{label(engine)}</h4>
                    {result.state === "done" ? (
                      <>
                        <div
                          dir="auto"
                          className="whitespace-pre-wrap break-words"
                        >
                          <ChatMarkdown>{result.reply}</ChatMarkdown>
                          {round.expected.trim() && (
                            <ExpectationResult
                              expected={round.expected}
                              reply={result.reply}
                              ar={ar}
                            />
                          )}
                        </div>
                        <dl className="mt-3 grid gap-1 border-t pt-2 text-sm">
                          <dt>{adminDictionaries[ar ? "ar" : "en"].consoleResponseSource}</dt>
                          <dd>
                            {result.source === "local"
                              ? label("local")
                              : result.source}
                          </dd>
                          <dt>{adminDictionaries[ar ? "ar" : "en"].consoleReportedModel}</dt>
                          <dd dir="auto" className="break-all">
                            {result.model ||
                              (adminDictionaries[ar ? "ar" : "en"].consoleModelNotReported)}
                          </dd>
                        </dl>
                      </>
                    ) : (
                      <p>
                        {result.state === "loading"
                          ? adminDictionaries[ar ? "ar" : "en"].consoleWaitingForReply
                          : result.state === "denied"
                            ? adminDictionaries[ar ? "ar" : "en"].consoleProviderRejectedAuthentication401UpdateTheKey
                            : result.state === "error"
                              ? adminDictionaries[ar ? "ar" : "en"].consoleThisEngineCouldNotReturnAReply
                              : adminDictionaries[ar ? "ar" : "en"].consoleThisEngineIsUnavailableWithTheCurrent}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

function EngineSelector({
  settings,
  dirty,
}: {
  settings: AiSettingsView;
  dirty: boolean;
}) {
  const { language } = useAdminCopy();
  const ar = language === "ar";
  const [choice, setChoice] = useState<"local" | "remote">(
    settings.activeEngine,
  );
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const remote = new URL(settings.baseUrl).hostname;
  const label = (engine: "remote" | "local") =>
    engine === "local"
      ? adminDictionaries[ar ? "ar" : "en"].consoleLocalSearch
      : remote === "api.openai.com"
        ? "OpenAI"
        : remote;
  const available =
    choice === "local"
      ? settings.localAvailable
      : settings.keySource !== "none";
  return (
    <>
      <ArchyComparison
        settings={settings}
        dirty={dirty || saving}
        label={label}
      />
      <Card title={adminDictionaries[ar ? "ar" : "en"].consoleArchyChatEngine}>
        <p id="archy-active-engine" className="mb-3">
          {adminDictionaries[ar ? "ar" : "en"].consoleCurrentlyServingVisitors} ·{" "}
          <strong>{label(settings.activeEngine)}</strong>
        </p>
        <label className="grid gap-1" htmlFor="archy-engine">
          {adminDictionaries[ar ? "ar" : "en"].consoleChooseTheVisitorChatEngine}
          <select
            className={selectClass}
            id="archy-engine"
            value={choice}
            disabled={saving}
            onChange={(e) => setChoice(e.target.value as "remote" | "local")}
          >
            <option value="remote">{label("remote")}</option>
            <option value="local">{label("local")}</option>
          </select>
        </label>
        <p className="my-3 text-sm text-muted-foreground">
          {adminDictionaries[ar ? "ar" : "en"].consoleAfterComparingRepliesApplyYourChoiceWhen}
        </p>
        {!available && (
          <p role="status">
            {choice === "remote"
              ? adminDictionaries[ar ? "ar" : "en"].consoleSaveTheProviderKeyToTryIt
              : adminDictionaries[ar ? "ar" : "en"].consoleLocalSearchIsUnavailableInThisEnvironment}
          </p>
        )}
        <Button
          id="archy-engine-apply"
          disabled={
            dirty || !available || saving || choice === settings.activeEngine
          }
          onClick={async () => {
            setSaving(true);
            try {
              await applyChatEngine({ data: { engine: choice } });
              await qc.invalidateQueries({ queryKey: ["ai-settings"] });
              toast.success(
                adminDictionaries[ar ? "ar" : "en"].consoleVisitorEngineUpdated,
              );
            } catch {
              toast.error(
                adminDictionaries[ar ? "ar" : "en"].consoleCouldNotApplyThisEngine,
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {adminDictionaries[ar ? "ar" : "en"].consoleApplyToVisitorChats}
        </Button>
      </Card>
    </>
  );
}

function RegistrationPolicy({settings}: {settings:AiSettingsView}) {
  const {language,t}=useAdminCopy();
  const ar=language==="ar";
  const qc=useQueryClient();
  const savePolicy=useServerFn(saveRegistrationPolicy);
  const draft=useDraft({limit:String(settings.registrationLimit),minutes:String(settings.registrationWaitMinutes)});
  const [busy,setBusy]=useState(false);
  if(!draft.value) return null;
  const {limit,minutes}=draft.value;
  return <Card title={ar?"حد تسجيل زوار Archy":"Archy visitor registration limit"}
    description={ar?"يُحسب الحد لكل متصفح بعد نجاح التحقق البشري. يبدأ الانتظار عند اكتمال العدد خلال الفترة المحددة، ويستطيع زملاء الزائر التسجيل من متصفحاتهم.":"Successful registrations are counted per browser. Reaching the limit within the chosen period starts the cooldown. Colleagues can still register from their own browsers."}>
    <form className="grid gap-4" onSubmit={async e=>{
      e.preventDefault();setBusy(true);
      try {
        await savePolicy({data:{limit:Number(limit),minutes:Number(minutes)}});
        draft.reset({limit,minutes});toast.success(t("saved"));
        await qc.invalidateQueries({queryKey:["ai-settings"]});
      } catch {toast.error(t("errSaveAi"));} finally {setBusy(false);}
    }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label>{ar?"عدد التسجيلات المسموحة للزائر":"Registrations per visitor"}
        <Input id="archy-registration-limit" type="number" required min={1} max={100} step={1} value={limit} disabled={busy} onChange={e=>draft.setValue({...draft.value!,limit:e.target.value})}/>
      </label>
      <label>{ar?"مدة الانتظار بالدقائق":"Cooldown in minutes"}
        <Input id="archy-registration-minutes" type="number" required min={1} max={1440} step={1} value={minutes} disabled={busy} onChange={e=>draft.setValue({...draft.value!,minutes:e.target.value})}/>
      </label>
    </div>
    <Button className="justify-self-start" disabled={busy||!draft.dirty}>{ar?"حفظ حد التسجيل":"Save registration limit"}</Button>
    </form>
  </Card>;
}

export function AiSettings() {
  const { t, date } = useAdminCopy();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => getAiSettings(),
  });
  const s = query.data;
  const form = useDraft<AiDraft>(
    s
      ? {
          baseUrl: s.baseUrl,
          model: s.model,
          speed: s.speed,
          apiKey: "",
          removeKey: false,
        }
      : undefined,
  );
  const draft = form.value;
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const importModels = async () => {
    setImporting(true);
    try {
      const result = await listOpenAiModels();
      if (!result.ok) return void toast.error(t(result.message));
      setImported(result.models);
      toast.success(`${t("aiImported")} ${result.models.length}`);
    } catch {
      toast.error(t("errAiImport"));
    } finally {
      setImporting(false);
    }
  };
  const set = (patch: Partial<AiDraft>) =>
    form.setValue((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await saveAiSettings({ data: draft });
      if (!result.ok) return void toast.error(t(result.message));
      toast.success(t("saved"));
      form.reset({ ...draft, apiKey: "", removeKey: false });
      await qc.invalidateQueries({ queryKey: ["ai-settings"] });
    } catch {
      toast.error(t("errSaveAi"));
    } finally {
      setBusy(false);
    }
  };

  if (query.isPending) return <LoadingBlock rows={4} />;
  if (query.isError || !s || !draft)
    return <ErrorBlock onRetry={() => void query.refetch()} />;

  return (
    <div className="grid gap-5">
      <Card title={t("aiProvider")} description={t("aiProviderDesc")}>
        {s.localSemantic && (
          <p className="settings-runtime-note">
            <Cpu size={19} aria-hidden="true" />
            <span>{t("settingsLocalHint")}</span>
          </p>
        )}
        <SettingRow label={t("aiProvider")} htmlFor="ai-preset">
          <select
            className={selectClass}
            id="ai-preset"
            dir="auto"
            value={AI_PRESETS.findIndex(
              (p) => p.url === draft.baseUrl && p.model === draft.model,
            )}
            onChange={(event) => {
              const preset = AI_PRESETS[Number(event.target.value)];
              if (preset) set({ baseUrl: preset.url, model: preset.model });
            }}
          >
            <option value="-1" disabled>
              {t("settingsCustomModel")}
            </option>
            {Array.from(new Set(AI_PRESETS.map((p) => p.provider))).map(
              (provider) => (
                <optgroup label={provider} key={provider}>
                  {AI_PRESETS.map(
                    (preset, index) =>
                      preset.provider === provider && (
                        <option key={preset.model} value={index}>
                          {preset.name}
                        </option>
                      ),
                  )}
                </optgroup>
              ),
            )}
          </select>
        </SettingRow>
        <div className="mt-6">
          <SettingRow
            label={t("aiBaseUrl")}
            hint={t("aiBaseUrlHint")}
            htmlFor="ai-url"
          >
            <Input
              id="ai-url"
              dir="ltr"
              value={draft.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("aiModel")} htmlFor="ai-model">
            <Input
              id="ai-model"
              dir="ltr"
              value={draft.model}
              onChange={(e) => set({ model: e.target.value })}
            />
          </SettingRow>
          <SettingRow
            label={t("aiImportModels")}
            hint={t("aiImportModelsHint")}
            htmlFor="ai-import"
          >
            <div className="grid gap-2">
              <Button
                id="ai-import"
                type="button"
                variant="outline"
                disabled={importing}
                onClick={() => void importModels()}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                {t("aiImportModels")}
              </Button>
              {imported.length ? (
                <select
                  aria-label={t("aiModel")}
                  className={selectClass}
                  dir="ltr"
                  value={imported.includes(draft.model) ? draft.model : ""}
                  onChange={(e) =>
                    e.target.value &&
                    set({ baseUrl: OPENAI, model: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {imported.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </SettingRow>
          <SettingRow label={t("aiSpeed")} htmlFor="ai-speed">
            <select
              id="ai-speed"
              className={selectClass}
              value={draft.speed}
              onChange={(e) => set({ speed: e.target.value as AiSpeed })}
            >
              {(["fast", "balanced", "thorough"] as const).map((speed) => (
                <option key={speed} value={speed}>
                  {t(`aiSpeed_${speed}`)}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label={t("aiKey")}
            hint={s.keySource !== "none" ? t("aiKeySaved") : t("aiKeyNone")}
            htmlFor="ai-key"
          >
            <Input
              id="ai-key"
              dir="ltr"
              type="password"
              autoComplete="off"
              placeholder={s.keyHint || t("aiKeyPlaceholder")}
              value={draft.apiKey}
              disabled={draft.removeKey}
              onChange={(e) => set({ apiKey: e.target.value })}
            />
          </SettingRow>
          {s.keySource === "saved" ? (
            <SettingRow
              label={t("aiRemoveKey")}
              hint={t("aiRemoveKeyHint")}
              htmlFor="ai-remove"
            >
              <Switch
                id="ai-remove"
                checked={draft.removeKey}
                onCheckedChange={(v) => set({ removeKey: v, apiKey: "" })}
              />
            </SettingRow>
          ) : null}
        </div>
      </Card>

      <EngineSelector settings={s} dirty={form.dirty} />
      <RegistrationPolicy settings={s}/>
      <ArchyOperations />
      <Card title={t("aiStatus")}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("aiKeySource")}
            </dt>
            <dd className="mt-0.5">
              {t(`aiKeySource_${s.keySource}`)}{" "}
              {s.keyHint ? <span dir="ltr">({s.keyHint})</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("aiKeyChanged")}
            </dt>
            <dd className="mt-0.5">{date(s.keyChangedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("aiUpdated")}</dt>
            <dd className="mt-0.5">
              {date(s.updatedAt)}
              {s.updatedBy ? <span dir="ltr"> · {s.updatedBy}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("aiBaseUrl")}</dt>
            <dd className="mt-0.5 break-all" dir="ltr">
              {s.baseUrl}
            </dd>
          </div>
        </dl>
      </Card>

      <Usage />
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={form.discard}
      />
    </div>
  );
}

function ExpectationResult({
  expected,
  reply,
  ar,
}: {
  expected: string;
  reply: string;
  ar: boolean;
}) {
  const terms = expected
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  const missing = terms.filter(
    (term) => !reply.toLowerCase().includes(term.toLowerCase()),
  );
  return (
    <p className="mt-2 rounded border p-2">
      {missing.length
        ? (adminDictionaries[ar ? "ar" : "en"].consoleReviewMissing) +
          missing.join(" · ")
        : adminDictionaries[ar ? "ar" : "en"].consoleAllExpectedTermsMatched}
    </p>
  );
}
