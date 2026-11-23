/** Pure helpers for "EA Layers" (browser-safe). */
import type { Product } from "@/lib/catalog";
import { EA_LAYERS, type EaLayer } from "@/lib/beneficiary-metadata";

export { EA_LAYERS, type EaLayer };
export const CYCLE_MS = 6400;

/** Default layer per catalog category; unknown categories serve applications. */
export const CATEGORY_LAYER: Record<string, EaLayer> = {
  architecture: "business",
  technology: "technology",
  platform: "applications",
};

/** Admin override (product editor) wins over the category default. */
export function layerFor(product: Pick<Product, "category" | "beneficiaryDetails">): EaLayer {
  const own = product.beneficiaryDetails?.eaLayer;
  if (own) return own;
  return CATEGORY_LAYER[product.category] ?? "applications";
}

/** Products grouped by layer, keeping catalog order inside each layer. */
export function groupByLayer(products: Product[]): Record<EaLayer, Product[]> {
  const out = { business: [], applications: [], data: [], technology: [] } as Record<
    EaLayer,
    Product[]
  >;
  for (const p of products) out[layerFor(p)].push(p);
  return out;
}

/** Exploded-view gap share (0 = stacked, 1 = fully apart) at time ms; smooth in-out loop. */
export function explodeAt(ms: number): number {
  const k = (ms % CYCLE_MS) / CYCLE_MS;
  return 0.5 - 0.5 * Math.cos(k * Math.PI * 2);
}

/** Isometric projection of a plane point (x, y in -1..1) at height z. */
export function iso(x: number, y: number, z: number, cx: number, cy: number, s: number) {
  return { x: cx + (x - y) * s * 0.87, y: cy + (x + y) * s * 0.5 - z };
}

/** Slot of the j-th tool on a layer plane: a row along the plane diagonal that projects horizontally. */
export function slotOnLayer(j: number, count: number) {
  const u = -0.8 + ((j + 0.5) * 1.6) / Math.max(1, count);
  return { x: u, y: -u };
}

/** Chip width so a layer's chips fit side by side on screen. */
export function chipWidth(count: number, s: number, max: number): number {
  return Math.max(64, Math.min(max, (2.6 * s) / Math.max(1, count) - 8));
}
