import { adminDictionaries } from "@/lib/admin-copy";
import {NewsletterPreview} from "./newsletter-preview";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { archyHealth } from "@/lib/archy-quality.functions";
import {
  newsletterAdmin,
  publishNewsletterUpdate,
} from "@/lib/newsletter.functions";
import { Card, useAdminCopy } from "./ui";
import { Button } from "@/components/ui/button";
export function ArchyOperations() {
  const { language } = useAdminCopy(),
    ar = language === "ar";
  const health = useQuery({
    queryKey: ["archy-health"],
    queryFn: () => archyHealth(),
    refetchInterval: 30000,
  });
  const mail = useQuery({
    queryKey: ["newsletter-status"],
    queryFn: () => newsletterAdmin(),
  });
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const h = health.data,
    v = h?.visitor,
    date = (s: string) => new Date(s).toLocaleString(language);
  return (
    <>
      <Card
        title={adminDictionaries[ar ? "ar" : "en"].consoleArchyHealthAndSettingsHistory}
      >
        <button className="underline" onClick={() => void health.refetch()}>
          {adminDictionaries[ar ? "ar" : "en"].consoleRefresh}
        </button>
        {health.isError ? (
          <p role="alert">{adminDictionaries[ar ? "ar" : "en"].consoleCouldNotLoadHealth}</p>
        ) : (
          h && (
            <div className="grid gap-3">
              <div>
                <strong>
                  {adminDictionaries[ar ? "ar" : "en"].consoleLastSuccessfulVisitorReply}
                </strong>
                <p>
                  {v
                    ? [
                        v.reply_source,
                        v.reply_model,
                        v.reply_ms == null ? null : v.reply_ms + " ms",
                        date(v.created_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "—"}
                </p>
              </div>
              <div>
                <strong>
                  {adminDictionaries[ar ? "ar" : "en"].consoleLatestAdminTestPerEngine}
                </strong>
                {h.tests.length ? (
                  h.tests.map((r) => (
                    <p key={r.engine}>
                      {r.engine} ·{" "}
                      {r.succeeded
                        ? adminDictionaries[ar ? "ar" : "en"].consolePassed
                        : adminDictionaries[ar ? "ar" : "en"].consoleFailed}{" "}
                      · {r.source} {r.model} · {r.elapsed_ms} ms ·{" "}
                      {date(r.checked_at)}
                    </p>
                  ))
                ) : (
                  <p>—</p>
                )}
              </div>
              <details>
                <summary>
                  {adminDictionaries[ar ? "ar" : "en"].consoleSensitiveSettingsHistory}
                </summary>
                {h.events.length ? (
                  h.events.map((e, i) => (
                    <p key={i}>
                      {date(e.created_at)} · {e.actor} · {e.changes}
                    </p>
                  ))
                ) : (
                  <p>
                    {adminDictionaries[ar ? "ar" : "en"].consoleNoChangesSinceLoggingBegan}
                  </p>
                )}
              </details>
            </div>
          )
        )}
      </Card>
      <Card title={adminDictionaries[ar ? "ar" : "en"].consoleMonthlyNewsletter}>
        <p>
          {mail.data
            ? (mail.data.ready
                ? adminDictionaries[ar ? "ar" : "en"].consoleDeliveryEnabled
                : adminDictionaries[ar ? "ar" : "en"].consoleEmailProviderSetupPending) +
              " · " +
              adminDictionaries[ar ? "ar" : "en"].consoleConfirmed +
              " " +
              mail.data.active +
              " · " +
              adminDictionaries[ar ? "ar" : "en"].consolePending +
              " " +
              mail.data.pending
            : mail.isError
              ? adminDictionaries[ar ? "ar" : "en"].consoleListUnavailable
              : "…"}
        </p>
        <details>
          <summary>{adminDictionaries[ar ? "ar" : "en"].consoleAddASiteUpdate}</summary>
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = e.currentTarget,
                d = new FormData(f);
              setBusy(true);
              try {
                await publishNewsletterUpdate({
                  data: {
                    ar: String(d.get("ar")),
                    en: String(d.get("en")),
                    path: String(d.get("path")),
                  },
                });
                f.reset();
                setStatus(
                  adminDictionaries[ar ? "ar" : "en"].consoleAddedToTheMonthlyIssue,
                );
              } catch {
                setStatus(adminDictionaries[ar ? "ar" : "en"].consoleSaveFailed);
              } finally {
                setBusy(false);
              }
            }}
          >
            {["ar", "en", "path"].map((n, i) => (
              <label key={n}>
                {
                  [
                    adminDictionaries[ar ? "ar" : "en"].consoleUpdateInArabic,
                    adminDictionaries[ar ? "ar" : "en"].consoleUpdateInEnglish,
                    adminDictionaries[ar ? "ar" : "en"].consolePagePath,
                  ][i]
                }
                <input
                  name={n}
                  className="block w-full rounded border p-2"
                  required
                  maxLength={n === "path" ? 250 : 500}
                  defaultValue={n === "path" ? "/" : ""}
                />
              </label>
            ))}
            <Button disabled={busy}>{adminDictionaries[ar ? "ar" : "en"].consoleAdd}</Button>
            <p role="status">{status}</p>
          </form>
        </details>
      <NewsletterPreview ar={ar}/></Card>
    </>
  );
}
