import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { authoritativeFeatureState, type FeatureKey } from "./site-features";

/** Admission must use a fresh authoritative row, never the public catalog fallback/cache. */
export async function serverFeatureEnabled(key: FeatureKey): Promise<boolean> {
  try {
    const url = process.env["SUPABASE_URL"];
    const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !publishableKey) return false;
    const client = createClient<Database>(url, publishableKey, {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            publishableKey.startsWith("sb_") &&
            headers.get("Authorization") === `Bearer ${publishableKey}`
          )
            headers.delete("Authorization");
          headers.set("apikey", publishableKey);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const { data, error } = await client
      .from("site_settings")
      .select("feature_flags")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return false;
    const flags = data.feature_flags;
    // Missing keys in a valid settings object retain the documented enabled defaults.
    // Missing/malformed settings are not authority to spend money or register visitors.
    return authoritativeFeatureState(flags, key) === true;
  } catch {
    return false;
  }
}
