// Default security headers for every response of the Node server, including the static files
// (/assets/*, /guide/*.html, robots.txt…) that Nitro serves before the app's own middleware
// runs. A header the app already set is never replaced.
import http from "node:http";

const ALWAYS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
};

// Only for HTML that has no policy of its own (static pages such as the guides).
const STATIC_HTML_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function headerIn(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2)
      if (String(headers[i]).toLowerCase() === name) return headers[i + 1];
    return undefined;
  }
  for (const key of Object.keys(headers)) if (key.toLowerCase() === name) return headers[key];
  return undefined;
}

export function applyDefaults(res, extra) {
  const has = (name) => res.hasHeader(name) || headerIn(extra, name) !== undefined;
  for (const [name, value] of Object.entries(ALWAYS)) if (!has(name)) res.setHeader(name, value);
  const type = String(res.getHeader("content-type") ?? headerIn(extra, "content-type") ?? "");
  if (type.startsWith("text/html") && !has("content-security-policy"))
    res.setHeader("content-security-policy", STATIC_HTML_CSP);
}

export function install() {
  const proto = http.ServerResponse.prototype;
  if (proto.__eaHubDefaults) return;
  const writeHead = proto.writeHead;
  proto.writeHead = function (statusCode, ...rest) {
    // writeHead(status[, message][, headers])
    const extra = typeof rest[0] === "string" ? rest[1] : rest[0];
    if (!this.headersSent) applyDefaults(this, extra);
    return writeHead.call(this, statusCode, ...rest);
  };
  Object.defineProperty(proto, "__eaHubDefaults", { value: true });
}
