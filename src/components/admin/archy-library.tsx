import { adminDictionaries } from "@/lib/admin-copy";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  archyQuality,
  saveArchyCase,
  removeArchyCase,
} from "@/lib/archy-quality.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export type TestCase = {
  expected?: string;
  question: string;
  language: "ar" | "en";
};
export function ArchyLibrary({
  ar,
  blocked,
  run,
}: {
  ar: boolean;
  blocked: boolean;
  run: (cases: TestCase[]) => Promise<void>;
}) {
  const data = useQuery({
    queryKey: ["archy-quality"],
    queryFn: () => archyQuality(),
  });
  const [draft, setDraft] = useState(""),
    [lang, setLang] = useState<"ar" | "en">(ar ? "ar" : "en"),
    [saving, setSaving] = useState(false);
  const [expected, setExpected] = useState("");
  const [selected, select] = useState<string[]>([]);
  const reason = (v: string | null) =>
    v === "fit"
      ? adminDictionaries[ar ? "ar" : "en"].consolePoorMatch
      : v === "incomplete"
        ? adminDictionaries[ar ? "ar" : "en"].consoleIncompleteAnswer
        : v === "other"
          ? adminDictionaries[ar ? "ar" : "en"].consoleOther
          : adminDictionaries[ar ? "ar" : "en"].consoleNoReason;
  async function mutate(fn: () => Promise<unknown>) {
    setSaving(true);
    try {
      await fn();
      await data.refetch();
    } catch {
      toast.error(adminDictionaries[ar ? "ar" : "en"].consoleCouldNotSave);
    } finally {
      setSaving(false);
    }
  }
  if (!data.data)
    return (
      <p role="status">
        {data.isError ? (
          <button onClick={() => void data.refetch()}>
            {adminDictionaries[ar ? "ar" : "en"].consoleLibraryUnavailableRetry}
          </button>
        ) : (
          adminDictionaries[ar ? "ar" : "en"].consoleLoadingLibrary
        )}
      </p>
    );
  const { cases, totals, recent } = data.data;
  const toRun = cases
    .filter((c) => selected.includes(c.id))
    .map((c) => ({
      question: c.question,
      expected: c.expected,
      language: c.language === "ar" ? ("ar" as const) : ("en" as const),
    }));
  return (
    <details className="my-4 rounded-lg border p-3">
      <summary className="cursor-pointer font-semibold">
        {adminDictionaries[ar ? "ar" : "en"].consoleSavedQuestionsAndVisitorFeedback}
      </summary>
      <div className="mt-3 grid gap-3">
        <h3>
          {adminDictionaries[ar ? "ar" : "en"].consoleReplyRatingsBySourceModelAndLanguage}
        </h3>
        {totals.length ? (
          <ul>
            {totals.map((r, i) => (
              <li key={i}>
                {r.reply_source ?? "—"} · {r.reply_model ?? "—"} ·{" "}
                {r.reply_language ?? "—"} · {adminDictionaries[ar ? "ar" : "en"].consoleHelpful}{" "}
                {r.positive} · {adminDictionaries[ar ? "ar" : "en"].consoleUnhelpful} {r.negative}
              </li>
            ))}
          </ul>
        ) : (
          <p>{adminDictionaries[ar ? "ar" : "en"].consoleNoRatingsYet}</p>
        )}
        {recent.length > 0 && (
          <details>
            <summary>
              {adminDictionaries[ar ? "ar" : "en"].consoleRecentUnhelpfulReplies}
            </summary>
            {recent.map((r) => (
              <div className="border-b py-2" key={r.id}>
                <p dir="auto">{r.question}</p>
                {reason(r.reason)}{" "}
                {r.question && (
                  <button
                    className="underline"
                    onClick={() => {
                      setDraft(r.question);
                      setExpected("");
                      setLang(r.language === "en" ? "en" : "ar");
                      document.getElementById("archy-case")?.focus();
                    }}
                  >
                    {adminDictionaries[ar ? "ar" : "en"].consoleReviewQuestionForSaving}
                  </button>
                )}
              </div>
            ))}
          </details>
        )}
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(async () => {
              await saveArchyCase({
                data: { question: draft, expected, language: lang },
              });
              setDraft("");
              setExpected("");
            });
          }}
        >
          <label htmlFor="archy-case">
            {adminDictionaries[ar ? "ar" : "en"].consoleNewTestQuestionRemovePersonalDetailsBefore}
          </label>
          <textarea
            id="archy-case"
            dir="auto"
            className="rounded border p-2"
            maxLength={1200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <select
            aria-label={adminDictionaries[ar ? "ar" : "en"].consoleQuestionLanguage}
            value={lang}
            onChange={(e) => setLang(e.target.value === "en" ? "en" : "ar")}
          >
            <option value="ar">{adminDictionaries.ar.arabicLanguageName}</option>
            <option value="en">English</option>
          </select>
          <label>
            {adminDictionaries[ar ? "ar" : "en"].consoleExpectedTermsNameLinkOrPhraseOne}
            <textarea
              className="block w-full border p-2"
              value={expected}
              maxLength={800}
              onChange={(e) => setExpected(e.target.value)}
            />
          </label>
          <Button disabled={saving || !draft.trim()}>
            {adminDictionaries[ar ? "ar" : "en"].consoleSaveQuestion}
          </Button>
        </form>
        <label>
          <input
            type="checkbox"
            checked={cases.length > 0 && toRun.length === cases.length}
            onChange={(e) =>
              select(e.target.checked ? cases.map((c) => c.id) : [])
            }
          />{" "}
          {adminDictionaries[ar ? "ar" : "en"].consoleSelectAll}
        </label>
        {cases.map((c) => (
          <div className="flex justify-between gap-2" key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  select(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />{" "}
              <span dir="auto">{c.question}</span> ({c.language})
            </label>
            <button
              type="button"
              onClick={() => {
                setDraft(c.question);
                setLang(c.language === "en" ? "en" : "ar");
                setExpected(c.expected);
                document.getElementById("archy-case")?.focus();
              }}
            >
              {adminDictionaries[ar ? "ar" : "en"].consoleEditExpectation}
            </button>
            <button
              disabled={saving || blocked}
              aria-label={adminDictionaries[ar ? "ar" : "en"].consoleRemove + " " + c.question}
              onClick={() => void mutate(() => removeArchyCase({ data: c.id }))}
            >
              {adminDictionaries[ar ? "ar" : "en"].consoleRemove}
            </button>
          </div>
        ))}
        <Button
          disabled={blocked || !toRun.length}
          onClick={() => void run(toRun)}
        >
          {adminDictionaries[ar ? "ar" : "en"].consoleTestSelectedQuestions} (
          {toRun.length})
        </Button>
      </div>
    </details>
  );
}
