// Server-only Cloudflare Turnstile support for the assistant registration gate. Turnstile
// is used only when BOTH secrets are set; otherwise the signed arithmetic question stays.

export type TurnstileConfig = { siteKey: string; secretKey: string };

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileConfig(): TurnstileConfig | null {
  const siteKey = process.env["TURNSTILE_SITE_KEY"]?.trim();
  const secretKey = process.env["TURNSTILE_SECRET_KEY"]?.trim();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** Server-side siteverify; any network error, redirect or non-success answer is a rejection. */
export async function verifyTurnstile(
  config: TurnstileConfig,
  token: string,
  remoteIp: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: config.secretKey, response: token });
    if (remoteIp && remoteIp !== "unknown-client") body.set("remoteip", remoteIp);
    const response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
