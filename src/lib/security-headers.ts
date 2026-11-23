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

export function applySecurityHeaders(h: Headers): void {
  if (!h.has("x-content-type-options")) h.set("x-content-type-options", "nosniff");
  if (!h.has("referrer-policy")) h.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!h.has("permissions-policy"))
    h.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!h.has("strict-transport-security"))
    h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (!h.has("content-security-policy")) h.set("content-security-policy", CSP_ENFORCED);
  if (!h.has("x-frame-options")) h.set("x-frame-options", "DENY");
}
