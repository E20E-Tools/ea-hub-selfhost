/** Response security headers shared by the request middleware (browser-safe, no imports). */

export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  "img-src 'self' https: data:",
  "connect-src 'self' https://*.supabase.co https://api.groq.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

/** Enforced policy: only framing is blocked, so existing scripts/styles keep working. */
export const CSP_ENFORCED = "frame-ancestors 'none'";

export function applySecurityHeaders(h: Headers): void {
  if (!h.has("x-content-type-options")) h.set("x-content-type-options", "nosniff");
  if (!h.has("referrer-policy")) h.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!h.has("permissions-policy"))
    h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("strict-transport-security"))
    h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  // Report-only: observes violations of the broader policy without blocking anything.
  if (!h.has("content-security-policy-report-only"))
    h.set("content-security-policy-report-only", CSP_REPORT_ONLY);
  if (!h.has("content-security-policy")) h.set("content-security-policy", CSP_ENFORCED);
  if (!h.has("x-frame-options")) h.set("x-frame-options", "DENY");
}
