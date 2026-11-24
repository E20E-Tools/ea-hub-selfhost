import { createServerFn } from "@tanstack/react-start";

export const DEFAULT_CONTACT_EMAIL = "ea@e20e.tools";

/** Public contact address: the single source is site_settings.contact_info.email. */
export const getPublicContactEmail = createServerFn({ method: "GET" }).handler(
  async (): Promise<string> => {
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("site_settings")
        .select("contact_info")
        .eq("id", true)
        .maybeSingle();
      const email = (data?.contact_info as { email?: unknown } | null)?.email;
      return typeof email === "string" && email.trim()
        ? email.trim()
        : DEFAULT_CONTACT_EMAIL;
    } catch {
      return DEFAULT_CONTACT_EMAIL;
    }
  },
);
