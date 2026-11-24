import {
  FEATURE_KEYS,
  FEATURE_PATHS,
  featureEnabled,
  type FeatureFlags,
  type FeatureKey,
} from "./site-features";

export type FeatureStatusRow = {
  key: FeatureKey;
  enabled: boolean;
  path: string | null;
};

/** Every feature in switch order with its saved state and the page it controls (if any). */
export function featureStatusRows(
  flags: FeatureFlags | undefined,
): FeatureStatusRow[] {
  return FEATURE_KEYS.map((key) => ({
    key,
    enabled: featureEnabled(flags, key),
    path: FEATURE_PATHS[key] ?? null,
  }));
}
