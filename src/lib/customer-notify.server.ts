// Server-only: tells a customer by email when the team replies to their request or
// changes its status. Sending uses Resend when RESEND_API_KEY and a sender address
// (NOTIFY_FROM, else NEWSLETTER_FROM) are set; until then each skipped notice is written
// to the admin activity log. Never throws, so a saved reply or status is never failed by email.

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export type RequestNotice =
  | { kind: "reply"; requestId: string; replyId: string; body: string }
  | { kind: "status"; requestId: string; status: string };

type RequestRow = { email: string; name: string; need: string };

export function sender(): string {
  return (process.env["NOTIFY_FROM"] || process.env["NEWSLETTER_FROM"] || "").trim();
}

export function emailSendingConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"] && sender());
}

const STATUS_TEXT: Record<string, { ar: string; en: string }> = {
  new: { ar: "جديد", en: "New" },
  in_progress: { ar: "قيد المعالجة", en: "In progress" },
  resolved: { ar: "تم الحل", en: "Resolved" },
  rejected: { ar: "مغلق", en: "Closed" },
};

/** Subject and body of the customer notice, in the language the request was written in. */
export function composeNotice(
  notice: RequestNotice,
  row: RequestRow,
  origin: string,
): { subject: string; text: string; ar: boolean } {
  const ar = /\p{Script=Arabic}/u.test(`${row.name} ${row.need}`);
  const link = `${origin}/my-requests`;
  const name = row.name.trim();
  const hello = ar ? (name ? `مرحبًا ${name}،` : "مرحبًا،") : name ? `Hello ${name},` : "Hello,";
  if (notice.kind === "reply") {
    const preview = notice.body.length > 600 ? notice.body.slice(0, 600) + "…" : notice.body;
    return {
      ar,
      subject: ar ? "رد جديد على طلبك في E20E Tools" : "New reply on your E20E Tools request",
      text: [
        hello,
        "",
        ar ? "رد فريقنا على طلبك:" : "Our team replied to your request:",
        "",
        preview,
        "",
        ar ? `تابع المحادثة ورد من هنا: ${link}` : `Read the full thread and reply here: ${link}`,
      ].join("\n"),
    };
  }
  const label = STATUS_TEXT[notice.status] ?? { ar: notice.status, en: notice.status };
  return {
    ar,
    subject: ar
      ? `تحديث حالة طلبك: ${label.ar}`
      : `Your E20E Tools request is now: ${label.en}`,
    text: [
      hello,
      "",
      ar
        ? `أصبحت حالة طلبك «${label.ar}».`
        : `Your request status changed to "${label.en}".`,
      "",
      ar ? `التفاصيل: ${link}` : `Details: ${link}`,
    ].join("\n"),
  };
}

/** Statuses worth an email; moving back to "new" is internal housekeeping. */
export function statusNeedsNotice(status: string): boolean {
  return status === "in_progress" || status === "resolved" || status === "rejected";
}

export async function notifyCustomer(
  notice: RequestNotice,
  fetcher: typeof fetch = fetch,
): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (notice.kind === "status" && !statusNeedsNotice(notice.status)) return "skipped";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("suggestion_requests")
      .select("email, name, need")
      .eq("id", notice.requestId)
      .maybeSingle();
    if (!row?.email) return "skipped";
    if (!emailSendingConfigured()) {
      await supabaseAdmin.from("admin_activity").insert({
        actor_id: SYSTEM_ACTOR,
        actor_email: "system",
        action: "customer.email_skipped",
        target: `${notice.kind} ${notice.requestId}: email sending not set up`.slice(0, 200),
      });
      return "skipped";
    }
    const origin = process.env["NEWSLETTER_ORIGIN"] || "https://www.e20e.tools";
    const message = composeNotice(notice, row, origin);
    const key =
      notice.kind === "reply"
        ? `request-reply-${notice.replyId}`
        : `request-status-${notice.requestId}-${notice.status}`;
    const res = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env["RESEND_API_KEY"],
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({
        from: sender(),
        to: [row.email],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? "sent" : "failed";
  } catch (error) {
    console.error("customer notice failed", error instanceof Error ? error.message : "unknown");
    return "failed";
  }
}
