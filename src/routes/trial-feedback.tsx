import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";
import { trialFeedback } from "@/lib/trial-feedback.functions";
import { dictionaries } from "@/lib/copy";

export const Route = createFileRoute("/trial-feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
});
function FeedbackPage() {
  const fragment = useRouterState({ select: (state) => state.location.hash });
  return <InvitationForm key={fragment} fragment={fragment} />;
}
function InvitationForm({ fragment }: { fragment: string }) {
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
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(key)) {
      setBad(true);
      return;
    }
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
      <h1>{dictionaries[ar ? "ar" : "en"].trialFeedbackTeamTrialFeedback}</h1>
      {bad ? (
        <p>{dictionaries[ar ? "ar" : "en"].trialFeedbackCouldNotOpenThe}</p>
      ) : !tool ? (
        <p>{dictionaries[ar ? "ar" : "en"].loading}</p>
      ) : (
        <>
          <h2>{tool}</h2>
          <p>{goal}</p>
          {status === "sent" ? (
            <p role="status">
              {
                dictionaries[ar ? "ar" : "en"]
                  .trialFeedbackYourFeedbackWasRecorded
              }
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
                {
                  dictionaries[ar ? "ar" : "en"]
                    .trialFeedbackCouldYouCompleteThe
                }
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="yes">
                    {dictionaries[ar ? "ar" : "en"].replyRatingYes}
                  </option>
                  <option value="partial">
                    {dictionaries[ar ? "ar" : "en"].trialFeedbackPartly}
                  </option>
                  <option value="no">
                    {dictionaries[ar ? "ar" : "en"].replyRatingNo}
                  </option>
                </select>
              </label>
              <label>
                {
                  dictionaries[ar ? "ar" : "en"]
                    .trialFeedbackWhatHelpedOrBlocked
                }
                <textarea
                  required
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <Button disabled={busy || !note.trim()}>
                {dictionaries[ar ? "ar" : "en"].trialFeedbackSubmitFeedback}
              </Button>
              {status === "error" && (
                <p role="alert">
                  {
                    dictionaries[ar ? "ar" : "en"]
                      .trialFeedbackCouldNotSubmitCheck
                  }
                </p>
              )}
            </form>
          )}
        </>
      )}
    </main>
  );
}
