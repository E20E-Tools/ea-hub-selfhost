// Server-only, per-instance memory caches for the public catalog. Signed storage links are
// valid for 6 hours but reused for at most 1 hour, and the assembled catalog for 45 seconds.
// Admin saves clear both on the instance that handled the save; other instances catch up
// within the catalog TTL, and a reused link always has at least 5 hours of validity left.

export const SIGNED_URL_REUSE_MS = 60 * 60 * 1000;
export const CATALOG_TTL_MS = 45 * 1000;
const MAX_SIGNED_ENTRIES = 500;

type Entry<T> = { value: T; until: number };

const signed = new Map<string, Entry<string>>();
let catalogEntry: Entry<unknown> | null = null;
let generation = 0;

export function cachedSignedUrl(path: string, now = Date.now()): string | null {
  const hit = signed.get(path);
  if (!hit) return null;
  if (hit.until <= now) {
    signed.delete(path);
    return null;
  }
  return hit.value;
}

export function rememberSignedUrl(
  path: string,
  url: string,
  now = Date.now(),
): void {
  if (!url) return;
  if (signed.size >= MAX_SIGNED_ENTRIES) {
    const oldest = signed.keys().next().value;
    if (oldest !== undefined) signed.delete(oldest);
  }
  signed.set(path, { value: url, until: now + SIGNED_URL_REUSE_MS });
}

export function cachedCatalog<T>(now = Date.now()): T | null {
  if (!catalogEntry || catalogEntry.until <= now) return null;
  return catalogEntry.value as T;
}

/** Stores a freshly built catalog unless an admin save happened while it was being built. */
export function rememberCatalog<T>(
  value: T,
  builtAtGeneration: number,
  now = Date.now(),
): void {
  if (builtAtGeneration !== generation) return;
  catalogEntry = { value, until: now + CATALOG_TTL_MS };
}

export function catalogGeneration(): number {
  return generation;
}

/** Called after every admin save so the next visitor read sees the change. */
export function invalidateCatalogCache(): void {
  generation += 1;
  catalogEntry = null;
  signed.clear();
}
