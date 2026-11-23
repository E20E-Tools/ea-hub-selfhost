import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { trialFeedback } from "@/lib/trial-feedback.functions";

export const Route = createFileRoute("/trial-feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
});
function FeedbackPage() {
  const fragment = useRouterState({select: state => state.location.hash});
  return <InvitationForm key={fragment} fragment={fragment}/>;
}
function InvitationForm({fragment}: {fragment:string}) {
  const { language, dir } = useLanguage(),
    ar = language === "ar";
  const [invite, setInvite] = useState(""),
    [tool, setTool] = useState(""),
    [goal, setGoal] = useState(""),
    [bad, setBad] = useState(false);
  const [outcome, setOutcome] = useState<"yes" | "partial" | "no">("yes"),
    [note, setNote] = useState(""),
    [id, setId] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const key = fragment.replace(/^#/, "");
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(key)) {setBad(true);return;}
    setInvite(key);
    try {
      const storageKey = "ea-trial-reply:" + key;
      const id = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, id);
      setId(id);
    } catch {
      setId(crypto.randomUUID());
    }
    trialFeedback({ data: { action: "view", invite: key } })
      .then((r) => {
        if (active) {
          setTool(r.tool ?? "");
          setGoal(r.goal ?? "");
          setBad(!r.ok);
        }
      })
      .catch(() => {
        if (active) setBad(true);
      });
    return () => {
      active = false;
    };
  }, [fragment]);
  return (
    <main dir={dir} className="bx-panel ea-team-space">
      <h1>{ar ? "رأي الفريق في التجربة" : "Team trial feedback"}</h1>
      {bad ? (
        <p>
          {ar
            ? "تعذر فتح رابط الملاحظات. راجع الرابط مع مسؤول التجربة."
            : "Could not open the invitation. Check the link with the trial owner."}
        </p>
      ) : !tool ? (
        <p>{ar ? "جارٍ التحميل…" : "Loading…"}</p>
      ) : (
        <>
          <h2>{tool}</h2>
          <p>{goal}</p>
          {status === "sent" ? (
            <p role="status">
              {ar
                ? "تم تسجيل رأيك. شكرًا لمشاركتك."
                : "Your feedback was recorded. Thank you."}
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const r = await trialFeedback({
                    data: { action: "reply", invite, id, outcome, note },
                  });
                  setStatus(r.ok ? "sent" : "error");
                } catch {
                  setStatus("error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {ar
                  ? "هل استطعت إنجاز المهمة؟"
                  : "Could you complete the task?"}
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="yes">{ar ? "نعم" : "Yes"}</option>
                  <option value="partial">{ar ? "جزئيًا" : "Partly"}</option>
                  <option value="no">{ar ? "لا" : "No"}</option>
                </select>
              </label>
              <label>
                {ar ? "ما الذي ساعدك أو عطّلك؟" : "What helped or blocked you?"}
                <textarea
                  required
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <Button disabled={busy || !note.trim()}>
                {ar ? "إرسال رأيي" : "Submit feedback"}
              </Button>
              {status === "error" && (
                <p role="alert">
                  {ar
                    ? "تعذر الإرسال. تحقق من الاتصال والرابط."
                    : "Could not submit. Check your connection and invitation."}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </main>
  );
}
