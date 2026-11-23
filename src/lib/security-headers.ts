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

/** Editor previews must stay embeddable by the Lovable editor and nothing else. */
export const CSP_PREVIEW = "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PREVIEW_HOST = new RegExp(`^(?:id-preview(?:-[a-z0-9]+)?|project|live)--${UUID}`, "i");

/** True only for Lovable editor preview hosts; published domains are never previews. */
export function isEditorPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.endsWith(".lovableproject.com") || host.endsWith(".lovableproject-dev.com")) return true;
  return host.endsWith(".lovable.app") && PREVIEW_HOST.test(host);
}

export function applySecurityHeaders(h: Headers, hostname: string, dev: boolean): void {
  if (!h.has("x-content-type-options")) h.set("x-content-type-options", "nosniff");
  if (!h.has("referrer-policy")) h.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!h.has("permissions-policy"))
    h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("strict-transport-security"))
    h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  // Report-only: observes violations of the broader policy without blocking anything.
  if (!h.has("content-security-policy-report-only"))
    h.set("content-security-policy-report-only", CSP_REPORT_ONLY);
  const preview = dev || isEditorPreviewHost(hostname);
  if (!h.has("content-security-policy"))
    h.set("content-security-policy", preview ? CSP_PREVIEW : CSP_ENFORCED);
  // X-Frame-Options cannot allow-list the editor, so it is omitted on previews only.
  if (!preview && !h.has("x-frame-options")) h.set("x-frame-options", "DENY");
}
