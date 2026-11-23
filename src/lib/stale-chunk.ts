/** After a new publish, an open tab may ask for page files that no longer exist. */
const STALE_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
const KEY = "e20e-stale-reload-at";

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return STALE_RE.test(message);
}

/** Reloads once per minute at most, so a real outage can't loop. Returns true when reloading. */
export function reloadForStaleChunk(error: unknown, now = Date.now()): boolean {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (now - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
