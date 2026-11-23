import { useState } from "react";
import { Button } from "../ui/button";
import { useWorkPolicy, CloudOption } from "../work-assistant";
import { approveIssue } from "@/lib/newsletter.functions";
export function IssueEditor({
  ar,
  lang,
  month,
  body,
  source,
  onSaved,
}: {
  ar: boolean;
  lang: "ar" | "en";
  month: string;
  body: string;
  source: string;
  onSaved: (v: string) => void;
}) {
  const policy = useWorkPolicy().data,
    [draft, set] = useState(""),
    [busy, wait] = useState(false),
    [msg, note] = useState("");
  if (!policy?.issue.enabled) return null;
  return (
    <div className="rounded border p-3 grid gap-2">
      <Button
        variant="outline"
        onClick={() =>
          set(
            (lang === "ar" ? "مستجدات EA-Hub لشهر " : "EA-Hub updates for ") +
              month +
              "\n\n" +
              source,
          )
        }
      >
        {ar ? "جهّز تحديث الشهر" : "Draft the monthly update"}
      </Button>
      {draft && (
        <>
          <label>
            {ar
              ? "راجع نص النشرة قبل اعتماده"
              : "Review the issue before approval"}
            <textarea
              rows={8}
              className="w-full border p-2"
              value={draft}
              maxLength={30000}
              onChange={(e) => set(e.target.value)}
            />
          </label>
          <CloudOption
            feature="issue"
            ar={lang === "ar"}
            context={month}
            content={source}
            onApply={set}
          />
          <Button
            disabled={busy || draft === body}
            onClick={async () => {
              wait(true);
              try {
                await approveIssue({ data: { month, lang, body: draft } });
                note(ar ? "تم اعتماد النص" : "Draft approved");
                onSaved(draft);
              } catch {
                note(
                  ar
                    ? "تعذر الاعتماد. تحقق من بقاء جميع روابط التحديثات ومن أن النشرة ما زالت مفتوحة."
                    : "Approval failed. Keep all original update links and check that the issue is still open.",
                );
              } finally {
                wait(false);
              }
            }}
          >
            {ar
              ? "اعتماد هذه النسخة للإرسال المجدول"
              : "Approve this version for scheduled delivery"}
          </Button>
        </>
      )}
      <p role="status">{msg}</p>
    </div>
  );
}
