import { IssueEditor } from "./work-issue";
import { adminDictionaries } from "@/lib/admin-copy";
import { useState } from "react";
import {
  getNewsletterPreview,
  emailNewsletterPreview,
} from "@/lib/newsletter.functions";
import { Button } from "@/components/ui/button";
export function NewsletterPreview({ ar }: { ar: boolean }) {
  const [month, setMonth] = useState(() =>
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
      }).format(new Date()),
    ),
    [lang, setLang] = useState<"ar" | "en">(ar ? "ar" : "en"),
    [draft, setDraft] = useState<{
      ar: string;
      en: string;
      source:{ar:string;en:string};
      locked:boolean;
      ready: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [recipient, setRecipient] = useState<"admin" | "editorial">("admin");
  const body = draft?.[lang] ?? "";
  return (
    <details className="mt-3">
      <summary>
        {adminDictionaries[ar ? "ar" : "en"].consolePreviewAndTestANewsletter}
      </summary>
      <div className="grid gap-3 p-2">
        <label>
          {adminDictionaries[ar ? "ar" : "en"].consoleIssueMonth}{" "}
          <input
            type="month"
            value={month}
            disabled={busy}
            onChange={(e) => {
              setMonth(e.target.value);
              setDraft(null);
              setNote("");
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={!month || busy}
          onClick={async () => {
            setBusy(true);
            setNote("");
            try {
              setDraft(await getNewsletterPreview({ data: month }));
            } catch {
              setNote(adminDictionaries[ar ? "ar" : "en"].consolePreviewUnavailable);
            } finally {
              setBusy(false);
            }
          }}
        >
          {adminDictionaries[ar ? "ar" : "en"].consoleLoadPreview}
        </Button>
        {draft && (
          <>
            <label>
              {adminDictionaries[ar ? "ar" : "en"].consoleEmailLanguage}{" "}
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value === "en" ? "en" : "ar")}
              >
                <option value="ar">{adminDictionaries.ar.arabicLanguageName}</option>
                <option value="en">English</option>
              </select>
            </label>
            {body && !draft.locked && <IssueEditor key={month+lang+body} ar={ar} lang={lang} month={month} body={body} source={draft.source[lang]} onSaved={v=>setDraft({...draft,[lang]:v})}/>}
            <article
              className="rounded border p-3"
              dir={lang === "ar" ? "rtl" : "ltr"}
            >
              <h3>
                {adminDictionaries[lang].consoleEAHubUpdates} · {month}
              </h3>
              {body ? (
                body.split("\n").map((line, i) => (
                  <div key={i}>
                    {/^https?:\/\//.test(line) ? (
                      <a
                        className="underline"
                        href={line}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {line}
                      </a>
                    ) : (
                      line
                    )}
                  </div>
                ))
              ) : (
                <p>
                  {adminDictionaries[ar ? "ar" : "en"].consoleNoUpdatesForThisMonth}
                </p>
              )}
              {body && (
                <p>
                  {adminDictionaries[lang].consolePreferencesUnsubscribe}
                </p>
              )}
            </article>
            <label>{adminDictionaries[ar ? "ar" : "en"].nlPreviewRecipient}{" "}
              <select value={recipient} onChange={e => setRecipient(e.target.value === "editorial" ? "editorial" : "admin")}>
                <option value="admin">{adminDictionaries[ar ? "ar" : "en"].nlMyAdminEmail}</option>
                <option value="editorial">EA@E20E.Tools</option>
              </select>
            </label>
            <Button
              disabled={busy || !body || !draft.ready}
              onClick={async () => {
                setBusy(true);
                try {
                  await emailNewsletterPreview({ data: { month, lang, recipient } });
                  setNote(
                    recipient === "editorial" ? adminDictionaries[ar ? "ar" : "en"].nlProviderAcceptedFor + "EA@E20E.Tools" : adminDictionaries[ar ? "ar" : "en"].consoleTheProviderAcceptedTheTestEmailFor,
                  );
                } catch {
                  setNote(adminDictionaries[ar ? "ar" : "en"].consoleTestDeliveryFailed);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {recipient === "admin" ? adminDictionaries[ar ? "ar" : "en"].consoleEmailACopyToMe : adminDictionaries[ar ? "ar" : "en"].nlSendPreviewTo + "EA@E20E.Tools"}
            </Button>
            {!draft.ready && (
              <small>
                {adminDictionaries[ar ? "ar" : "en"].consoleTestDeliveryRequiresEmailProviderSetup}
              </small>
            )}
          </>
        )}
        <p role="status">{note}</p>
      </div>
    </details>
  );
}
