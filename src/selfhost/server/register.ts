/**
 * Server bootstrap for the self-hosted build. Imported first by src/server.ts.
 * - fills the Supabase-era environment names upstream code reads, from self-host settings
 * - registers the Postgres-backed createClient for server code
 * - bridges Resend API calls to SMTP when SMTP_HOST is set
 */
import { registerServerFactory } from "../supabase-js/index";
import { createServerClient } from "./client";
import { deriveServiceKey, selfhostConfig } from "./config";
import { installResendBridge } from "./mail";
import { handleSelfhost, withClientIp } from "./http";

function setDefault(name: string, value: string | undefined) {
  if (value !== undefined && !process.env[name]?.trim())
    process.env[name] = value;
}

const appUrl = (process.env["APP_URL"] ?? "").trim().replace(/\/+$/, "");
setDefault("SUPABASE_URL", appUrl || "http://localhost:3000");
setDefault("SUPABASE_PUBLISHABLE_KEY", "selfhost-anon");
setDefault("POSTGRES_URL", process.env["DATABASE_URL"]);
setDefault("NEWSLETTER_ORIGIN", appUrl || undefined);
// Fresh installs have no data signed with the old Supabase service key.
setDefault("APP_ENCRYPTION_RETIRE_LEGACY", "true");
if (process.env["APP_ENCRYPTION_KEY"]?.trim())
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = deriveServiceKey();
delete process.env["VERCEL"];

registerServerFactory(
  createServerClient as (
    url: string,
    key: string,
    options?: unknown,
  ) => unknown,
);
installResendBridge();

let warned = false;
/** Handles /api/selfhost/* and /healthz; otherwise returns the request with a trusted client IP. */
export async function selfhostFetch(
  request: Request,
): Promise<{ response: Response } | { request: Request }> {
  try {
    selfhostConfig();
  } catch (error) {
    if (!warned) {
      warned = true;
      console.error(
        `[selfhost] configuration error: ${(error as Error).message}`,
      );
    }
  }
  const response = await handleSelfhost(request);
  if (response) return { response };
  return { request: withClientIp(request) };
}
