import { useState } from "react";
import { rateArchyReply } from "@/lib/archy-quality.functions";
import { dictionaries } from "@/lib/copy";
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
          <span>{dictionaries[ar ? "ar" : "en"].replyRatingThanksForYourFeedback}</span>
          <button onClick={() => setState("idle")}>
            {dictionaries[ar ? "ar" : "en"].bxEdit}
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
          <span>{dictionaries[ar ? "ar" : "en"].replyRatingWhatWentWrong}</span>
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
            {dictionaries[ar ? "ar" : "en"].replyRatingSkipReason}
          </button>
        </>
      ) : (
        <>
          {state === "error" && (
            <span role="alert">
              {dictionaries[ar ? "ar" : "en"].replyRatingCouldNotSaveTry}
            </span>
          )}
          <span>{dictionaries[ar ? "ar" : "en"].replyRatingWasThisHelpful}</span>
          <button onClick={() => void rate(true, null)}>
            {dictionaries[ar ? "ar" : "en"].replyRatingYes}
          </button>
          <button onClick={() => setState("negative")}>
            {dictionaries[ar ? "ar" : "en"].replyRatingNo}
          </button>
        </>
      )}
    </div>
  );
}
