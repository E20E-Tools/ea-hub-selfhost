import { TrialBrief } from "./trial-brief";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  allTrials,
  calendar,
  trialEvent,
  updateTrial,
  type Trial,
  type Review,
} from "@/lib/team-trials";
import { trialFeedback } from "@/lib/trial-feedback.functions";
import { dictionaries } from "@/lib/copy";

export function TeamTrials({ ar }: { ar: boolean }) {
  const [list, setList] = useState<Trial[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    function refresh() {
      try {
        setList(allTrials());
      } catch {
        setError(true);
      }
    }
    refresh();
    window.addEventListener(trialEvent, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(trialEvent, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return (
    <section
      id="team-trials"
      aria-label={dictionaries[ar ? "ar" : "en"].teamTrialsTeamTrials}
    >
      {error && (
        <p role="alert">
          {dictionaries[ar ? "ar" : "en"].teamTrialsCouldNotReadTrials}
        </p>
      )}
      {list.map((t) => (
        <TrialCard key={t.id} t={t} ar={ar} />
      ))}
    </section>
  );
}
function TrialCard({ t, ar }: { t: Trial; ar: boolean }) {
  const label = (a: string, e: string) => (ar ? a : e);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [choice, setChoice] = useState<Review["choice"]>("adopt");
  const fail = () =>
    setError(
      label(
        "تعذر حفظ التغيير. تحقق من الاتصال ومساحة التخزين ثم أعد المحاولة.",
        "Could not save the change. Check connectivity and device storage, then retry.",
      ),
    );
  function save(change: (old: Trial) => Trial) {
    try {
      updateTrial(t.id, change);
      setError("");
      return true;
    } catch {
      fail();
      return false;
    }
  }
  async function remote(action: "share" | "read" | "close") {
    setBusy(true);
    setError("");
    try {
      const cmd =
        action === "share"
          ? {
              action,
              owner: t.ownerKey,
              invite: t.invite,
              tool: t.tool,
              goal: t.goal,
            }
          : { action, owner: t.ownerKey };
      const r = await trialFeedback({ data: cmd });
      if (!r.ok) throw Error();
      save((old) => ({
        ...old,
        shared: old.shared || action === "share",
        closed: old.closed || action === "close",
        feedback: r.replies ?? old.feedback,
      }));
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  }
  const verdicts = {
    adopt: label("نعتمد الأداة", "Adopt the tool"),
    extend: label("نمدّد التجربة", "Extend the trial"),
    alternative: label("نستكشف بديلًا", "Explore an alternative"),
  };
  const recent = t.reviews.at(-1);
  const final = recent && recent.choice !== "extend";
  const outcomes: Record<string, string> = {
    yes: label("أنجز المهمة", "Completed"),
    partial: label("أنجز جزءًا منها", "Partly completed"),
    no: label("لم ينجز المهمة", "Could not complete"),
  };
  return (
    <article id={"trial-" + t.id} className="bx-panel ea-team-space">
      <h2>
        {label("تجربة الفريق", "Team trial")} · {t.tool}
      </h2>
      <p>{t.goal}</p>
      <p>
        {label("المسؤول", "Owner")} · {t.owner}
        {"　"}
        {label("تاريخ المراجعة", "Review date")} ·{" "}
        <time dateTime={t.date}>{t.date}</time>
      </p>
      <p>
        <strong>{label("الخطوة التالية", "Next step")}</strong> ·{" "}
        {final
          ? verdicts[recent.choice]
          : recent?.next ||
            (!t.attempts.length
              ? label("سجّل نتيجة أول محاولة.", "Record your first attempt.")
              : label(
                  "راجع النتائج مع الفريق.",
                  "Review the evidence with your team.",
                ))}
      </p>
      {!final && (
        <Button variant="outline" onClick={() => calendar(t, ar)}>
          {label("إضافة المراجعة للتقويم", "Add review to calendar")}
        </Button>
      )}
      <section>
        <h3>{label("سجل المحاولات", "Attempt log")}</h3>
        {t.attempts.map((a) => (
          <div key={a.id} id={"attempt-" + a.id}>
            <strong dir="auto">{a.task}</strong>
            <p dir="auto">{a.result}</p>
            {a.link && (
              <a href={a.link} rel="noopener noreferrer" target="_blank">
                {label("فتح المثال", "Open evidence")}
              </a>
            )}
          </div>
        ))}
        {!final && (
          <details>
            <summary>{label("سجّل نتيجة", "Record an attempt")}</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = new FormData(form);
                const val = (k: string) => String(data.get(k) ?? "").trim();
                const task = val("task"),
                  result = val("result"),
                  link = val("link");
                if (!task || !result || (link && !/^https?:\/\//i.test(link))) {
                  setError(
                    label(
                      "أكمل الحقول واستخدم رابط ويب صالحًا.",
                      "Complete the fields and use a valid web link.",
                    ),
                  );
                  return;
                }
                if (
                  save((old) => ({
                    ...old,
                    attempts: [
                      ...old.attempts,
                      { id: crypto.randomUUID(), task, result, link },
                    ],
                  }))
                )
                  form.reset();
              }}
            >
              <label>
                {label("ماذا جرّبتم؟", "What did you try?")}
                <input name="task" maxLength={600} required />
              </label>
              <label>
                {label("ماذا حدث؟", "What happened?")}
                <textarea name="result" maxLength={1500} required />
              </label>
              <label>
                {label("رابط مثال (اختياري)", "Evidence link (optional)")}
                <input
                  name="link"
                  type="url"
                  placeholder="https://"
                  maxLength={2000}
                />
              </label>
              <Button>{label("حفظ المحاولة", "Save attempt")}</Button>
            </form>
          </details>
        )}
      </section>
      <section>
        <h3>{label("آراء الفريق", "Team feedback")}</h3>
        {!t.shared ? (
          <>
            <p>
              {label(
                "الخطة محفوظة على هذا الجهاز. إنشاء رابط يتيح لأصحابه رؤية اسم الأداة وهدف التجربة وإرسال رأيهم.",
                "The plan is saved on this device. Creating a link lets recipients see the tool and goal and submit feedback.",
              )}
            </p>
            <Button disabled={busy} onClick={() => remote("share")}>
              {label("إنشاء رابط الملاحظات", "Create feedback link")}
            </Button>
          </>
        ) : (
          <>
            {!t.closed ? (
              <>
                <label>
                  {label("رابط ملاحظات الفريق", "Team feedback link")}
                  <input
                    readOnly
                    dir="ltr"
                    value={location.origin + "/trial-feedback#" + t.invite}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => remote("close")}
                >
                  {label("إغلاق استقبال الآراء", "Close feedback collection")}
                </Button>
              </>
            ) : (
              <p>
                {label(
                  "تم إغلاق استقبال الآراء.",
                  "Feedback collection is closed.",
                )}
              </p>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => remote("read")}
            >
              {label("تحديث الآراء", "Refresh feedback")}
            </Button>
            {t.feedback.length ? (
              t.feedback.map((r, i) => (
                <blockquote key={i} id={"feedback-" + t.id + "-" + i}>
                  <strong>{outcomes[r.outcome]}</strong>
                  <p dir="auto">{r.note}</p>
                </blockquote>
              ))
            ) : (
              <p>
                {label(
                  "لا توجد آراء معروضة. حدّث القائمة بعد مشاركة الرابط.",
                  "No feedback displayed. Refresh after sharing the link.",
                )}
              </p>
            )}
          </>
        )}
      </section>
      <section>
        <h3>{label("مراجعة القرار", "Decision review")}</h3>
        <p>
          <strong>
            {label("معيار النجاح الأصلي", "Original success criterion")}
          </strong>{" "}
          · {t.criterion}
        </p>
        <TrialBrief t={t} ar={ar} />
        {t.reviews.map((r, i) => (
          <p key={i}>
            <strong>{verdicts[r.choice]}</strong> · {r.reason}
            {r.next && " · " + r.next} · <time>{r.date}</time>
          </p>
        ))}
        {!final && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                data = new FormData(form);
              const reason = String(data.get("reason") ?? "").trim(),
                next = String(data.get("next") ?? "").trim();
              if (!reason || (choice === "extend" && !next)) return;
              const date =
                choice === "extend" ? String(data.get("date")) : t.date;
              if (
                save((old) => ({
                  ...old,
                  date,
                  reviews: [...old.reviews, { choice, reason, next, date }],
                }))
              )
                form.reset();
            }}
          >
            <label>
              {label("قرار الفريق", "Team decision")}
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value as Review["choice"])}
              >
                {Object.entries(verdicts).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {label(
                "سبب القرار بناءً على النتائج",
                "Reason based on the evidence",
              )}
              <textarea name="reason" required maxLength={1200} />
            </label>
            {choice === "extend" && (
              <>
                <label>
                  {label(
                    "ما الذي سنختبره تحديدًا؟",
                    "What will you test next?",
                  )}
                  <input required name="next" maxLength={600} />
                </label>
                <label>
                  {label("تاريخ المراجعة التالي", "Next review date")}
                  <input
                    type="date"
                    name="date"
                    required
                    min={new Date(
                      Math.max(Date.now(), Date.parse(t.date)) + 86400000,
                    )
                      .toISOString()
                      .slice(0, 10)}
                  />
                </label>
              </>
            )}
            <Button>{label("حفظ القرار", "Save decision")}</Button>
          </form>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
