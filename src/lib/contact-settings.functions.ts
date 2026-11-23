import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ContactSettingsView = {
  recipientEmail: string;
  emailSendingActive: boolean;
  notifyEnabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyText: string;
  updatedAt: string | null;
  updatedBy: string;
};

async function verify(context: import("./admin-guard.server").GuardContext) {
  const { requireAdmin } = await import("./admin-guard.server");
  await requireAdmin(context);
}

export const getContactSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ContactSettingsView> => {
    await verify(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("contact_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error("Contact settings load failed");
    return {
      recipientEmail: data?.recipient_email ?? "ea@e20e.tools",
      emailSendingActive: (await import("./contact-notify.server")).EMAIL_SENDING_ACTIVE,
      notifyEnabled: data?.notify_enabled ?? true,
      autoReplyEnabled: data?.auto_reply_enabled ?? false,
      autoReplyText: data?.auto_reply_text ?? "",
      updatedAt: data?.updated_at ?? null,
      updatedBy: data?.updated_by ?? "",
    };
  });

export const contactSettingsSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email("اكتب بريد استلام صحيحًا.").max(255),
  notifyEnabled: z.boolean(),
  autoReplyEnabled: z.boolean(),
  autoReplyText: z.string().trim().max(1000),
});

export const saveContactSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contactSettingsSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    await verify(context);
    const email = (context.claims as { email?: unknown } | null)?.email;
    const actor = typeof email === "string" ? email : "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_settings").upsert({
      id: true,
      recipient_email: data.recipientEmail,
      notify_enabled: data.notifyEnabled,
      auto_reply_enabled: data.autoReplyEnabled,
      auto_reply_text: data.autoReplyText,
      updated_at: new Date().toISOString(),
      updated_by: actor,
    } as never);
    if (error) return { ok: false, message: "errSaveContactSettings" };
    await supabaseAdmin.from("admin_activity").insert({
      actor_id: context.userId,
      actor_email: actor,
      action: "contact.settings",
      target: data.recipientEmail.slice(0, 200),
    });
    return { ok: true };
  });
