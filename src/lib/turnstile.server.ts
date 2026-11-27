// Server-only Cloudflare Turnstile support for the assistant registration gate. Turnstile
// is used only when BOTH secrets are set; otherwise the signed arithmetic question stays.

export type TurnstileConfig = { siteKey: string; secretKey: string };

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfig(): TurnstileConfig | null {
  const siteKey = process.env["TURNSTILE_SITE_KEY"]?.trim();
  const secretKey = process.env["TURNSTILE_SECRET_KEY"]?.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** The widget action the registration form renders with; siteverify echoes it back. */
export const TURNSTILE_REGISTER_ACTION = "archy-register";

/** What the solved challenge must match: the site it was solved on and the widget action. */
export type TurnstileExpectation = { hostname?: string; action?: string };

/**
 * Server-side siteverify; any network error, redirect or non-success answer is a rejection.
 * With an expectation, the answer must also name that hostname and action, so a token
 * solved on another site using the same site key, or for another widget, is refused.
 */
export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string,
  remoteIp: string,
  fetcher: typeof fetch = fetch,
  expected: TurnstileExpectation = {},
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({
      secret: config.secretKey,
      response: token,
    });
    if (remoteIp && remoteIp !== "unknown-client")
      body.set("remoteip", remoteIp);
    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
      action?: unknown;
    };
    if (result.success !== true) return false;
    if (
      expected.hostname &&
      (typeof result.hostname !== "string" ||
        result.hostname.toLowerCase() !== expected.hostname.toLowerCase())
    )
      return false;
    if (expected.action && result.action !== expected.action) return false;
    return true;
  } catch {
    return false;
  }
}
