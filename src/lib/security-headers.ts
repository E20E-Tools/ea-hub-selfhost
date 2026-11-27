/** Response security headers shared by the request middleware (browser-safe, no imports). */

/**
 * Enforced Content-Security-Policy. Inline script/style stay allowed (framework hydration
 * and component styles); everything else is limited to the site, Supabase (HTTPS + realtime
 * websockets), Google Fonts and Cloudflare Turnstile. blob:/data: cover the 3D model's
 * embedded textures and local image previews/downloads.
 */
export const CSP_ENFORCED = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  "img-src 'self' https: data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.groq.com https://challenges.cloudflare.com data: blob:",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** http(s) origin plus its ws(s) twin, or nothing when the value is not an http(s) URL. */
function backendOrigins(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    return [
      url.origin,
      `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`,
    ];
  } catch {
    return [];
  }
}

/** Base64 nonce characters only, so a value can never break out of the header. */
const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,64}={0,2}$/;

/** Fresh per-response script nonce (128 random bits, base64). */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * CSP_ENFORCED plus the configured Supabase origin in connect-src (with its websocket) and
 * img-src. Needed for the local backend (http://127.0.0.1:54365) and custom Supabase
 * domains, which *.supabase.co does not cover.
 *
 * With a nonce, script-src also lists 'nonce-…'. Browsers that understand nonces then
 * ignore 'unsafe-inline', so only the server-rendered scripts that carry the nonce run and an
 * injected inline script is blocked; 'unsafe-inline' stays only as the fallback for
 * browsers without nonce support.
 */
export function contentSecurityPolicy(
  backendUrls: (string | undefined)[] = [],
  nonce?: string,
): string {
  const origins = [...new Set(backendUrls.flatMap(backendOrigins))];
  const scriptNonce =
    nonce && NONCE_PATTERN.test(nonce) ? `'nonce-${nonce}'` : "";
  if (!origins.length && !scriptNonce) return CSP_ENFORCED;
  return CSP_ENFORCED.split("; ")
    .map((directive) => {
      const [name] = directive.split(" ");
      const extra =
        name === "connect-src"
          ? origins
          : name === "img-src"
            ? origins.filter((o) => o.startsWith("http"))
            : name === "script-src" && scriptNonce
              ? [scriptNonce]
              : [];
      const missing = extra.filter((o) => !directive.split(" ").includes(o));
      return missing.length ? `${directive} ${missing.join(" ")}` : directive;
    })
    .join("; ");
}

function configuredBackendUrls(): (string | undefined)[] {
  if (typeof process === "undefined") return [];
  return [process.env["SUPABASE_URL"], process.env["VITE_SUPABASE_URL"]];
}

export function applySecurityHeaders(
  h: Headers,
  backendUrls: (string | undefined)[] = configuredBackendUrls(),
  nonce?: string,
): void {
  if (!h.has("x-content-type-options"))
    h.set("x-content-type-options", "nosniff");
  if (!h.has("referrer-policy"))
    h.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!h.has("permissions-policy"))
    h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("strict-transport-security"))
    h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (!h.has("content-security-policy"))
    h.set("content-security-policy", contentSecurityPolicy(backendUrls, nonce));
  if (!h.has("x-frame-options")) h.set("x-frame-options", "DENY");
}
