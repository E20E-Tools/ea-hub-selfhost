import { useState } from "react";
import { rateArchyReply } from "@/lib/archy-quality.functions";
export function ReplyRating({
  id,
  access,
  ar,
}: {
  id: string;
  access: string;
  ar: boolean;
}) {
  const [state, setState] = useState<
    "idle" | "negative" | "saving" | "done" | "error"
  >("idle");
  async function rate(
    helpful: boolean,
    reason: "fit" | "incomplete" | "other" | null,
  ) {
    setState("saving");
    try {
      await rateArchyReply({ data: { id, access, helpful, reason } });
      setState("done");
    } catch {
      setState("error");
    }
  }
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2 text-xs"
      aria-live="polite"
    >
      {state === "done" ? (
        <>
          <span>{ar ? "شكرًا لتقييمك" : "Thanks for your feedback"}</span>
          <button onClick={() => setState("idle")}>
            {ar ? "تعديل" : "Edit"}
          </button>
        </>
      ) : state === "saving" ? (
        ar ? (
          "جارٍ الحفظ…"
        ) : (
          "Saving…"
        )
      ) : state === "negative" ? (
        <>
          <span>{ar ? "ما السبب؟" : "What went wrong?"}</span>
          {(["fit", "incomplete", "other"] as const).map((v, i) => (
            <button key={v} onClick={() => void rate(false, v)}>
              {
                (ar
                  ? ["ترشيح غير مناسب", "إجابة ناقصة", "سبب آخر"]
                  : ["Poor match", "Incomplete answer", "Other"])[i]
              }
            </button>
          ))}
          <button onClick={() => void rate(false, null)}>
            {ar ? "تخطي السبب" : "Skip reason"}
          </button>
        </>
      ) : (
        <>
          {state === "error" && (
            <span role="alert">
              {ar ? "تعذّر الحفظ. أعد المحاولة." : "Could not save. Try again."}
            </span>
          )}
          <span>{ar ? "هل ساعدك الرد؟" : "Was this helpful?"}</span>
          <button onClick={() => void rate(true, null)}>
            {ar ? "نعم" : "Yes"}
          </button>
          <button onClick={() => setState("negative")}>
            {ar ? "لا" : "No"}
          </button>
        </>
      )}
    </div>
  );
}
