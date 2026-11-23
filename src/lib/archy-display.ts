export const ARCHY_LIGHTWEIGHT_KEY = "e20e-archy-lightweight-v1";

export function archyLightweightChoice(stored: string | null, saveData: boolean): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return saveData;
}
export function readArchyLightweight(
  store: Pick<Storage, "getItem"> | null,
  saveData: boolean,
): boolean {
  try {
    return archyLightweightChoice(store?.getItem(ARCHY_LIGHTWEIGHT_KEY) ?? null, saveData);
  } catch {
    return saveData;
  }
}
export function saveArchyLightweight(value: boolean): void {
  try {
    window.localStorage.setItem(ARCHY_LIGHTWEIGHT_KEY, value ? "1" : "0");
  } catch {
    /* preference remains in memory */
  }
}
export function browserSaveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}
