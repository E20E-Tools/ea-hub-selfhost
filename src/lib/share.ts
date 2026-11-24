import { pageUrl } from "./seo";

export function shareImageMeta(name: "home" | "tools") {
  const url = pageUrl(`/og/${name}.jpg`);
  return [
    { property: "og:image", content: url },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:image", content: url },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** Reads ?lang=ar|en from a URL search string; null when absent or invalid. */
export function languageFromSearch(search: string): "ar" | "en" | null {
  const value = new URLSearchParams(search).get("lang");
  return value === "ar" || value === "en" ? value : null;
}
