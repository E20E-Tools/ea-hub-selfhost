export const MY_TOOLS_KEY = "e20e-my-tools-v1";
export const MY_TOOLS_CHANGED = "e20e:my-tools-changed";
export const MAX_COMPARE = 3;

export type MyToolsValue = { favorites: string[]; compare: string[] };
export type MyToolsRead = { value: MyToolsValue; status: "ok" | "malformed" | "unavailable" };
export const EMPTY_MY_TOOLS: MyToolsValue = { favorites: [], compare: [] };

export function isPublicProductId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,40}$/.test(value);
}
export function productIds(value: unknown, maximum: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter(isPublicProductId))].slice(0, maximum)
    : [];
}
export function parseMyTools(raw: string | null): MyToolsRead {
  if (!raw) return { value: EMPTY_MY_TOOLS, status: "ok" };
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Array.isArray(value["favorites"]) ||
      !Array.isArray(value["compare"]) ||
      value["favorites"].some((id) => !isPublicProductId(id)) ||
      value["compare"].some((id) => !isPublicProductId(id))
    )
      return { value: EMPTY_MY_TOOLS, status: "malformed" };
    return {
      value: {
        favorites: productIds(value["favorites"], 100),
        compare: productIds(value["compare"], MAX_COMPARE),
      },
      status: "ok",
    };
  } catch {
    return { value: EMPTY_MY_TOOLS, status: "malformed" };
  }
}
export function readMyTools(store: Pick<Storage, "getItem"> | null): MyToolsRead {
  if (!store) return { value: EMPTY_MY_TOOLS, status: "unavailable" };
  try {
    return parseMyTools(store.getItem(MY_TOOLS_KEY));
  } catch {
    return { value: EMPTY_MY_TOOLS, status: "unavailable" };
  }
}
export function encodeComparisonIds(ids: string[]): string {
  return productIds(ids, MAX_COMPARE).join(",");
}
export function decodeComparisonIds(raw: unknown): string[] {
  return typeof raw === "string" ? productIds(raw.split(","), MAX_COMPARE) : [];
}
export function toggleComparison(ids: string[], id: string): { ids: string[]; limited: boolean } {
  if (!isPublicProductId(id)) return { ids, limited: false };
  if (ids.includes(id)) return { ids: ids.filter((item) => item !== id), limited: false };
  if (ids.length >= MAX_COMPARE) return { ids, limited: true };
  return { ids: [...ids, id], limited: false };
}
