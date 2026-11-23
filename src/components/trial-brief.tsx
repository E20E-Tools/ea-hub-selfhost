import { useState } from "react";
import type { Trial } from "@/lib/team-trials";
import { CloudOption, useWorkPolicy } from "./work-assistant";
export function TrialBrief({ t, ar }: { t: Trial; ar: boolean }) {
  const q = useWorkPolicy(),
    [open, setOpen] = useState(false);
  if (!q.data?.summary.enabled) return null;
  const l = (a: string, e: string) => (ar ? a : e);
  const evidence = [
    ...t.attempts.map((a) => ({
      label: a.task + " — " + a.result,
      id: "attempt-" + a.id,
    })),
    ...t.feedback.map((r, i) => ({
      label:
        {
          yes: l("أنجز المهمة", "Completed"),
          no: l("لم ينجز المهمة", "Could not complete"),
          partial: l("إنجاز جزئي", "Partly completed"),
        }[r.outcome] + (r.note ? " — " + r.note : ""),
      id: "feedback-" + t.id + "-" + i,
    })),
  ];
  const blocked = t.feedback.filter((f) => f.outcome !== "yes").length;
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{l("جهّز ملخص القرار", "Prepare decision brief")}</summary>
      {open && (
        <div className="grid gap-2 p-3">
          <strong>{t.goal}</strong>
          <p>
            {l("معيار النجاح", "Success criterion")} · {t.criterion}
          </p>
          {t.feedback.length > 0 && (
            <p>
              {l("أنجز المهمة بالكامل", "Fully completed")} ·{" "}
              {t.feedback.length - blocked}/{t.feedback.length}
            </p>
          )}
          {!t.feedback.length && (
            <p>
              {l(
                "لا توجد آراء مسجلة من الفريق بعد.",
                "No team feedback has been recorded yet.",
              )}
            </p>
          )}
          {evidence.length ? (
            <ol>
              {evidence.map((r, i) => (
                <li key={r.id}>
                  <a className="underline" href={"#" + r.id}>
                    {i + 1}. {r.label}
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              {l(
                "لا توجد أدلة بعد. سجّل محاولة قبل اتخاذ القرار.",
                "No evidence yet. Record an attempt before deciding.",
              )}
            </p>
          )}
          {evidence.length > 0 && (
            <p>
              {blocked
                ? l(
                    "آراء تسجل تعثّرًا كليًا أو جزئيًا",
                    "Feedback reporting partial or blocked completion",
                  ) +
                  " · " +
                  blocked +
                  ". " +
                  l(
                    "أعد اختبار المهام المتعثرة قبل الاعتماد.",
                    "Retest the affected tasks before adoption.",
                  )
                : l(
                    "قارن الأدلة بمعيار النجاح، ثم سجّل قرار الفريق.",
                    "Compare the evidence with the success criterion, then record the team decision.",
                  )}
            </p>
          )}
          <CloudOption
            key={JSON.stringify([ar, t.goal, evidence])}
            ar={ar}
            feature="summary"
            context={t.goal + "\n" + t.criterion}
            content={evidence.map((r, i) => i + 1 + ". " + r.label).join("\n")}
          />
        </div>
      )}
    </details>
  );
}
