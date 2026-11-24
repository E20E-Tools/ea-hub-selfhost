import { hasLaunched } from "./archone-launch";
import { readNavigation } from "./navigation.shared";
import { isDisabledFeaturePath, normalizeFeatureFlags } from "./site-features";

/** Public pages that may appear in /sitemap.xml before per-site exclusions. */
export const SITEMAP_STATIC_PATHS = [
  "/",
  "/about",
  "/affiliates",
  "/contact",
  "/discover",
  "/compare",
  "/consultations",
  "/courses",
  "/enterprise-services",
  "/enterprise-services/request",
  "/request",
  "/support",
  "/technology-roadmap",
  "/privacy",
  "/terms",
  "/testimonials",
] as const;

export type SitemapInput = {
  featureFlags: unknown;
  navigationItems: unknown;
  /** True when at least one testimonial is published. */
  hasTestimonials: boolean;
  products: {
    id: string;
    coming_soon: boolean;
    publication_date?: string | null;
  }[];
  now?: number;
};

/** Pages linked only from hidden menu items (an internal path no visible item points to). */
export function hiddenMenuPaths(navigationItems: unknown): Set<string> {
  const items = readNavigation(navigationItems);
  const path = (url: string) =>
    url.startsWith("/") ? url.split(/[?#]/)[0] || "/" : null;
  const visible = new Set(
    items.filter((i) => !i.hidden).map((i) => path(i.url)),
  );
  const hidden = new Set<string>();
  for (const item of items) {
    const p = path(item.url);
    if (item.hidden && p && p !== "/" && !visible.has(p)) hidden.add(p);
  }
  return hidden;
}

/**
 * Pages for the sitemap: drops pages whose feature is switched off, pages the owner hid
 * from the menu, and /testimonials while nothing is published.
 */
export function sitemapPaths(input: SitemapInput): string[] {
  const flags = normalizeFeatureFlags(input.featureFlags);
  const hidden = hiddenMenuPaths(input.navigationItems);
  const now = input.now ?? Date.now();
  const keep = (p: string) =>
    !isDisabledFeaturePath(flags, p) &&
    !hidden.has(p) &&
    !(p === "/testimonials" && !input.hasTestimonials);
  const paths: string[] = SITEMAP_STATIC_PATHS.filter(keep);
  for (const row of input.products) {
    const product = `/product/${encodeURIComponent(row.id)}`;
    if (!hidden.has(product)) paths.push(product);
    const available =
      !row.coming_soon || hasLaunched(row.id, row.publication_date, now);
    if (available) paths.push(`/try/${encodeURIComponent(row.id)}`);
  }
  return paths;
}
