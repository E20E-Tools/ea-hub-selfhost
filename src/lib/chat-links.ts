/**
 * Classifies a chat link: same-site paths stay in-app, external links must be plain
 * http(s) without credentials; anything else (javascript:, data:, //host, \\host) is text.
 */
export function chatLinkTarget(
  href: string | undefined,
):
  { kind: "internal"; to: string } | { kind: "external"; href: string } | null {
  if (!href) return null;
  const value = href.trim();
  if (/^\/(?![/\\])/.test(value) && !/[\\\s]/.test(value))
    return { kind: "internal", to: value };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!/^https?:\/\/[^/\\]/i.test(value)) return null;
  return { kind: "external", href: url.href };
}

/** Returns the catalog id only for a direct, same-site product page link. */
export function chatProductId(href: string | undefined): string | null {
  const target = chatLinkTarget(href);
  if (target?.kind !== "internal") return null;
  const match = /^\/product\/([^/?#]+)\/?$/.exec(target.to);
  const rawId = match?.[1];
  if (!rawId) return null;
  try {
    const id = decodeURIComponent(rawId);
    return /^[a-z0-9][a-z0-9_-]*$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}
