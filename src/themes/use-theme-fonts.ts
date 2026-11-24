import { useEffect } from "react";

/** Adds a font stylesheet once per page (browser only); used when a design is previewed. */
export function ensureFontStylesheet(href: string): void {
  if (!href || typeof document === "undefined" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  for (const link of document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']")) {
    if (link.href === href || link.getAttribute("href") === href) return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset["themeFonts"] = "";
  document.head.appendChild(link);
}

/** Loads the given stylesheet after mount, only for the screens that need it. */
export function useFontStylesheet(href: string): void {
  useEffect(() => {
    ensureFontStylesheet(href);
  }, [href]);
}
