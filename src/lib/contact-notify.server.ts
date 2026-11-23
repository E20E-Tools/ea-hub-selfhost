// Server-only: notifications for every request type and support offer. Raw
// SMTP is not available in the edge runtime and no verified sending domain is
// set up yet, so sending is inactive; enabled notifications are recorded in the
// admin activity log instead. Never throws, so a saved submission is never failed by email.

export const EMAIL_SENDING_ACTIVE = false;
const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export async function notifyContactSubmission(
  messageId: string,
  kind = "request.general",
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("contact_settings")
      .select("notify_enabled, auto_reply_enabled")
      .eq("id", true)
      .maybeSingle();
    const notify = settings?.notify_enabled ?? true;
    const autoReply = settings?.auto_reply_enabled ?? false;
    if (!notify && !autoReply) return;
    if (!EMAIL_SENDING_ACTIVE) {
      const parts = [notify ? "notify" : "", autoReply ? "auto-reply" : ""]
        .filter(Boolean)
        .join("+");
      await supabaseAdmin.from("admin_activity").insert({
        actor_id: SYSTEM_ACTOR,
        actor_email: "system",
        action: "contact.email_skipped",
        target: `${kind} ${messageId} ${parts}: email sending inactive`.slice(0, 200),
      });
    }
  } catch (error) {
    console.error(
      "contact notification failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
