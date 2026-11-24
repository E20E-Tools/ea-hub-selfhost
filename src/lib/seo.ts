/** Canonical public origin used by search engines and social previews. */
export const SITE_ORIGIN = "https://www.e20e.tools";

/** Builds a self-referencing absolute URL without visitor query parameters. */
export function pageUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid page path");
  return new URL(path, SITE_ORIGIN).toString();
}
