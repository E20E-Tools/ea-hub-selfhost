import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { averageStars, commonQuestions } from "@/lib/chat-feedback.shared";
import { deleteFaqAnswer, saveFaqAnswer } from "@/lib/chat-feedback.functions";
import { formatDate } from "@/lib/format-date";
import { Card, EmptyBlock, LoadingBlock, PageHeader, useAdminCopy } from "./ui";
import { useLeaveGuard, useDraft, SaveBar } from "./ui";

type Rating = {
  chat_id: string;
  stars: number;
  comment: string;
  updated_at: string;
  chat: { visitor_name: string; visitor_email: string; admin_email: string | null } | null;
};
type Faq = { id: string; question: string; answer: string; enabled: boolean; updated_at: string };
type Draft = { id: string | null; question: string; answer: string; enabled: boolean };

const key = ["admin", "feedback"] as const;

async function load() {
  const [ratings, questions, faqs] = await Promise.all([
    supabase
      .from("live_chat_ratings")
      .select(
        "chat_id, stars, comment, updated_at, chat:live_chats(visitor_name, visitor_email, admin_email)",
      )
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("live_chat_messages")
      .select("chat_id, body")
      .eq("sender", "visitor")
      .order("created_at", { ascending: false })
      .limit(3000),
    supabase
      .from("faq_answers")
      .select("id, question, answer, enabled, updated_at")
      .order("updated_at", { ascending: false }),
  ]);
  if (ratings.error) throw ratings.error;
  if (questions.error) throw questions.error;
  if (faqs.error) throw faqs.error;
  return {
    ratings: (ratings.data ?? []) as unknown as Rating[],
    questions: questions.data ?? [],
    faqs: faqs.data ?? [],
  };
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= value ? "size-4 fill-primary text-primary" : "size-4 text-muted-foreground"
          }
        />
      ))}
    </span>
  );
}

/** Visitor ratings, most-asked questions and the approved answers the tool guide uses. */
export function FeedbackSection({
  email,
  embedded = false,
}: { email?: string; embedded?: boolean } = {}) {
  const { t, language } = useAdminCopy();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: load });
  const save = useServerFn(saveFaqAnswer);
  const remove = useServerFn(deleteFaqAnswer);
  const [filter, setFilter] = useState<"all" | "team" | "ai">("all");
  const editing = useDraft<Draft | null>(null);
  const draft = editing.value;
  const setDraft = editing.setValue;
  const guard = useLeaveGuard();
  const [questionSearch, setQuestionSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const ratings = useMemo(() => {
    const all = (query.data?.ratings ?? []).filter(
      (r) => !email || r.chat?.visitor_email.toLowerCase() === email.toLowerCase(),
    );
    if (filter === "all") return all;
    return all.filter((r) => (filter === "team") === Boolean(r.chat?.admin_email));
  }, [query.data, filter, email]);
  const common = useMemo(
    () =>
      commonQuestions(query.data?.questions ?? []).filter((q) =>
        q.text.toLowerCase().includes(questionSearch.toLowerCase()),
      ),
    [query.data, questionSearch],
  );
  const avg = averageStars(ratings);

  const submit = async () => {
    if (!draft?.question.trim() || !draft.answer.trim()) return;
    setBusy(true);
    try {
      await save({ data: draft });
      toast.success(t("fbSaved"));
      editing.reset(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["admin", "faq-replies"] }),
      ]);
    } catch {
      toast.error(t("fbFailed"));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!window.confirm(t("fbDeleteConfirm"))) return;
    try {
      await remove({ data: { id } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["admin", "faq-replies"] }),
      ]);
    } catch {
      toast.error(t("fbFailed"));
    }
  };

  return (
    <div className="grid gap-6">
      {!embedded ? (
        <PageHeader title={t("navFeedback")} description={t("navFeedbackDesc")} />
      ) : null}
      {query.isPending ? (
        <LoadingBlock rows={4} />
      ) : (
        <>
          <Card
            title={t("fbRatings")}
            actions={(["all", "team", "ai"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? t("fbFilterAll") : f === "team" ? t("fbTeam") : t("fbAi")}
              </Button>
            ))}
          >
            <div className="mb-4 flex flex-wrap gap-6 text-sm">
              <span>
                {t("fbAverage")}: <strong>{avg ?? "—"}</strong>{" "}
                {avg ? <Stars value={Math.round(avg)} /> : null}
              </span>
              <span>
                {t("fbCount")}: <strong>{ratings.length}</strong>
              </span>
            </div>
            {ratings.length === 0 ? (
              <EmptyBlock text={t("fbNoRatings")} />
            ) : (
              <ul className="grid gap-3">
                {ratings.map((r) => (
                  <li key={r.chat_id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.stars} />
                      <Badge variant="secondary">
                        {r.chat?.admin_email ? t("fbTeam") : t("fbAi")}
                      </Badge>
                      <span className="min-w-0 truncate font-medium">
                        {r.chat?.visitor_name || r.chat?.visitor_email}
                      </span>
                      <span className="ms-auto text-xs text-muted-foreground">
                        {formatDate(r.updated_at, language, { dateStyle: "medium" })}
                      </span>
                    </div>
                    {r.comment ? <p className="mt-2 text-muted-foreground">{r.comment}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t("fbCommon")}>
            <Input
              className="mb-3"
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
              aria-label={t("fbSearch")}
              placeholder={t("fbSearch")}
            />
            {common.length === 0 ? (
              <EmptyBlock text={t("fbNoQuestions")} />
            ) : (
              <ul className="grid gap-2">
                {common.map((q) => (
                  <li
                    key={q.text}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 break-words">{q.text}</span>
                    <Badge variant="outline">{t("fbTimes", { n: String(q.count) })}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (await guard.confirmLeave())
                          setDraft({ id: null, question: q.text, answer: "", enabled: true });
                      }}
                    >
                      {t("fbWriteAnswer")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={t("fbAnswers")}
            description={t("fbAnswersHint")}
            actions={
              <Button
                size="sm"
                onClick={async () => {
                  if (await guard.confirmLeave())
                    setDraft({ id: null, question: "", answer: "", enabled: true });
                }}
              >
                {t("fbNew")}
              </Button>
            }
          >
            {draft ? (
              <div className="mb-4 grid gap-3 rounded-lg border border-border p-4">
                <Label htmlFor="faq-q">{t("fbQuestion")}</Label>
                <Input
                  id="faq-q"
                  maxLength={500}
                  value={draft.question}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                />
                <Label htmlFor="faq-a">{t("fbAnswer")}</Label>
                <Textarea
                  id="faq-a"
                  rows={4}
                  maxLength={2000}
                  value={draft.answer}
                  onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                  />
                  {t("fbEnabled")}
                </label>
                <div className="flex gap-2">
                  <Button
                    disabled={busy || !draft.question.trim() || !draft.answer.trim()}
                    onClick={() => void submit()}
                  >
                    {t("fbSave")}
                  </Button>
                  <Button variant="ghost" onClick={() => editing.reset(null)}>
                    {t("fbCancel")}
                  </Button>
                </div>
              </div>
            ) : null}
            {(query.data?.faqs ?? []).length === 0 ? (
              <EmptyBlock text={t("fbNoAnswers")} />
            ) : (
              <ul className="grid gap-3">
                {(query.data?.faqs as Faq[]).map((f) => (
                  <li key={f.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="min-w-0 flex-1 break-words">{f.question}</strong>
                      {!f.enabled ? <Badge variant="outline">—</Badge> : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (await guard.confirmLeave())
                            setDraft({
                              id: f.id,
                              question: f.question,
                              answer: f.answer,
                              enabled: f.enabled,
                            });
                        }}
                      >
                        {t("fbEdit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void del(f.id)}>
                        {t("fbDelete")}
                      </Button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{f.answer}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <SaveBar
            dirty={editing.dirty}
            busy={busy || !draft?.question.trim() || !draft.answer.trim()}
            onSave={() => void submit()}
            onDiscard={() => editing.reset(null)}
          />
        </>
      )}
    </div>
  );
}
