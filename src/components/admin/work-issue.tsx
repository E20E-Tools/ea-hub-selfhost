import { useState } from "react";
import { Button } from "../ui/button";
import { useWorkPolicy, CloudOption } from "../work-assistant";
import { approveIssue } from "@/lib/newsletter.functions";
import { adminDictionaries } from "@/lib/admin-copy";
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
  // UI text follows the console language; the issue heading follows the issue language.
  const ui = adminDictionaries[ar ? "ar" : "en"];
  return (
    <div className="rounded border p-3 grid gap-2">
      <Button
        variant="outline"
        onClick={() =>
          set(
            adminDictionaries[lang].wiIssueHeading +
              month +
              "\n\n" +
              source,
          )
        }
      >
        {ui.wiDraftMonthly}
      </Button>
      {draft && (
        <>
          <label>
            {ui.wiReviewIssue}
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
                note(ui.wiApproved);
                onSaved(draft);
              } catch {
                note(ui.wiApproveFailed);
              } finally {
                wait(false);
              }
            }}
          >
            {ui.wiApproveVersion}
          </Button>
        </>
      )}
      <p role="status">{msg}</p>
    </div>
  );
}
