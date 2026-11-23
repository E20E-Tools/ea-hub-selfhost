import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  ASSET_BUCKET,
  fallbackCatalog,
  mapProduct,
  mapSettings,
  type Catalog,
  type ProductRow,
  type SettingsRow,
} from "./catalog";
import { customizationPaths, normalizeThemeCustomizations } from "./theme-customization";

const ASSET_TTL = 60 * 60 * 6;

// Library uploads are full-size originals (a 1342px logo shown at 60px). On Vercel the
// built-in image optimizer serves a resized WebP; elsewhere the original is used as is.
const STORAGE_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\//i;
export function optimizedImage(url: string, width: number): string {
  if (!url || !process.env["VERCEL"] || !STORAGE_URL.test(url)) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=78`;
}

export function publishableClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Missing Supabase environment variables.");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    // Opaque sb_ keys are not JWTs: send apikey only, never the bearer default.
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export type PublishableClient = ReturnType<typeof publishableClient>;

export async function resolveAsset(client: PublishableClient, value: string): Promise<string> {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith(`${ASSET_BUCKET}/`)
    ? raw.slice(ASSET_BUCKET.length + 1)
    : raw.replace(/^\/+/, "");
  // Storage is admin-only; sign just the paths the catalog itself references.
  void client;
  const cache = await import("./catalog-cache.server");
  const cached = cache.cachedSignedUrl(path);
  if (cached) return cached;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(path, ASSET_TTL);
  if (error || !data?.signedUrl) return "";
  cache.rememberSignedUrl(path, data.signedUrl);
  return data.signedUrl;
}

export const getCatalog = createServerFn({ method: "GET" }).handler(async (): Promise<Catalog> => {
  const cache = await import("./catalog-cache.server");
  const hit = cache.cachedCatalog<Catalog>();
  if (hit) return hit;
  const generation = cache.catalogGeneration();
  const { catalog, complete } = await buildCatalog();
  // Only a complete read is kept; after any database error the next visitor read retries.
  if (complete) cache.rememberCatalog(catalog, generation);
  return catalog;
});

async function buildCatalog(): Promise<{ catalog: Catalog; complete: boolean }> {
  try {
    const client = publishableClient();
    const [productsResult, settingsResult] = await Promise.all([
      client
        .from("products")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      client.from("site_settings").select("*").eq("id", true).maybeSingle(),
    ]);

    const rows = (productsResult.data ?? []) as unknown as ProductRow[];
    const settingsRow = (settingsResult.data ?? null) as unknown as SettingsRow | null;
    const designPaths = customizationPaths(
      normalizeThemeCustomizations(settingsRow?.theme_customizations),
    );
    const [logo, ...designUrls] = await Promise.all([
      resolveAsset(client, settingsRow?.logo_url ?? ""),
      ...designPaths.map((path) => resolveAsset(client, path)),
    ]);
    const themeAssetUrls: Record<string, string> = {};
    designPaths.forEach((path, i) => {
      const url = designUrls[i];
      if (url) themeAssetUrls[path] = url;
    });
    const settings = mapSettings(settingsRow, optimizedImage(logo ?? "", 256), themeAssetUrls);
    const products = await Promise.all(
      rows.map(async (row) => {
        const signed = await resolveAsset(client, row.image_url);
        const thumb = optimizedImage(signed, 640);
        const product = {
          ...mapProduct(row, optimizedImage(signed, 1080)),
          ...(thumb !== signed ? { imageThumb: thumb } : {}),
        };
        const shots = product.beneficiaryDetails?.screenshots ?? [];
        if (!shots.length) return product;
        // Library paths are signed like the product image. The saved path stays in `url`
        // so the admin editor never stores an expiring link; pages show `src`.
        const resolved = await Promise.all(
          shots.map(async (shot) => ({ ...shot, src: await resolveAsset(client, shot.url) })),
        );
        return {
          ...product,
          beneficiaryDetails: { ...product.beneficiaryDetails!, screenshots: resolved },
        };
      }),
    );

    const complete = !productsResult.error && !settingsResult.error;
    if (products.length === 0) return { catalog: { ...fallbackCatalog, settings }, complete };
    return { catalog: { products, settings }, complete };
  } catch {
    return { catalog: fallbackCatalog, complete: false };
  }
}

export const catalogQueryOptions = queryOptions({
  queryKey: ["catalog"],
  queryFn: () => getCatalog(),
  // Default focus behaviour: a returning tab refetches only once the data is stale.
  staleTime: 60_000,
});
