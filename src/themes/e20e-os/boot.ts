/** Boot screen plays once per browser session and never when motion is off or reduced. */
export const BOOT_STORAGE_KEY = "e20e-os-booted";

export type BootStore = Pick<Storage, "getItem" | "setItem">;

export function shouldBoot(opts: { animate: boolean; store: BootStore | null }): boolean {
  if (!opts.animate) return false;
  try {
    return opts.store?.getItem(BOOT_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markBooted(store: BootStore | null): void {
  try {
    store?.setItem(BOOT_STORAGE_KEY, "1");
  } catch {
    /* storage blocked: boot may replay, harmless */
  }
}

/** Deterministic hue from a product id, so each app keeps its own icon colour. */
export function appHue(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function appGradient(id: string): string {
  const hue = appHue(id);
  return `linear-gradient(145deg, oklch(0.78 0.13 ${hue}), oklch(0.5 0.16 ${(hue + 38) % 360}))`;
}
