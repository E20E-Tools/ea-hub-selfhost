/**
 * Drop-in replacement for the `@supabase/supabase-js` runtime in the self-hosted build.
 *
 * vite.config.ts aliases the package name to this file, so upstream EA-Hub code keeps its
 * `import { createClient } from "@supabase/supabase-js"` lines unchanged while every call
 * goes to the app's own PostgreSQL instead of Supabase:
 *   - on the server: straight to Postgres (src/selfhost/server), with the same API roles,
 *     RLS and auth.uid() semantics PostgREST provided;
 *   - in the browser: to the app's own /api/selfhost/* endpoints on the same origin.
 *
 * Types still come from the real package (dev dependency, never bundled).
 */
import { createBrowserClient } from "./browser";

type AnyClient = ReturnType<typeof createBrowserClient>;

let serverFactory:
  ((url: string, key: string, options?: unknown) => unknown) | undefined;

/** Called once by the server entry so the browser bundle never contains server code. */
export function registerServerFactory(
  factory: (url: string, key: string, options?: unknown) => unknown,
): void {
  serverFactory = factory;
}

export function createClient(
  url: string,
  key: string,
  options?: Record<string, unknown>,
): AnyClient {
  if (typeof window === "undefined") {
    if (!serverFactory)
      throw new Error(
        "Self-host server adapter is not registered (src/selfhost/server/register.ts)",
      );
    return serverFactory(url, key, options) as AnyClient;
  }
  return createBrowserClient(url, key, options as never);
}

// Value exports some code imports for instanceof checks.
export class AuthError extends Error {}
export class AuthApiError extends AuthError {}
export class PostgrestError extends Error {}
export class SupabaseClient {}

export default { createClient };
