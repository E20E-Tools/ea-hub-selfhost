/** Per-tab theme preview (`/?preview-theme=<id>`). Browser-safe pure helpers. */
import { isDesignThemeId, type DesignThemeId } from "@/lib/design-themes";

export const PREVIEW_PARAM = "preview-theme";
export const PREVIEW_STORAGE_KEY = "e20e-preview-theme";

/** A valid URL param wins; otherwise a valid value already stored for this tab; otherwise none. */
export function resolvePreviewTheme(search: string, stored: string | null): DesignThemeId | null {
  const param = new URLSearchParams(search).get(PREVIEW_PARAM);
  if (isDesignThemeId(param)) return param;
  return isDesignThemeId(stored) ? stored : null;
}

export function previewUrl(id: DesignThemeId): string {
  return `/?${PREVIEW_PARAM}=${encodeURIComponent(id)}`;
}

/** Removes the preview param, keeping every other query value. */
export function stripPreviewParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PREVIEW_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
