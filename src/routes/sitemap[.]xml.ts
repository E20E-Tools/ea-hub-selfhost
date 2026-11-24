import { createFileRoute } from "@tanstack/react-router";
import { pageUrl } from "@/lib/seo";
import { SITEMAP_STATIC_PATHS, sitemapPaths } from "@/lib/sitemap.shared";

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let paths: string[];
        try {
          const { publishableClient } = await import("@/lib/catalog.functions");
          const client = publishableClient();
          const [products, settings, testimonials] = await Promise.all([
            client
              .from("products")
              .select("id,coming_soon,publication_date")
              .order("sort_order"),
            client
              .from("site_settings")
              .select("feature_flags,navigation_items")
              .eq("id", true)
              .maybeSingle(),
            client
              .from("testimonials")
              .select("id", { count: "exact", head: true })
              .eq("published", true),
          ]);
          if (products.error || settings.error || testimonials.error)
            throw new Error("read");
          paths = sitemapPaths({
            featureFlags: settings.data?.feature_flags,
            navigationItems: settings.data?.navigation_items,
            hasTestimonials: (testimonials.count ?? 0) > 0,
            products: products.data ?? [],
          });
        } catch {
          // Without settings the exclusions cannot be known: list only always-on pages.
          paths = SITEMAP_STATIC_PATHS.filter((p) =>
            ["/", "/discover", "/compare", "/request"].includes(p),
          );
        }
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
          .map((p) => `  <url><loc>${escapeXml(pageUrl(p))}</loc></url>`)
          .join("\n")}\n</urlset>\n`;
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
