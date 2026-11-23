import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "./catalog.functions";
import { featureEnabled, type FeatureKey } from "./site-features";

/**
 * Whether a visitor feature is switched on, read from the catalog the root route
 * already loaded (the same source every page uses). A switch missing from saved
 * settings counts as on, matching the documented default.
 */
export function useFeature(key: FeatureKey): boolean {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  return featureEnabled(data?.settings?.featureFlags, key);
}
