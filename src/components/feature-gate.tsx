import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { useLanguage } from "@/lib/language";
import { featureEnabled, type FeatureKey } from "@/lib/site-features";
import { useFeature } from "@/lib/use-feature";

/**
 * Wraps a public page's content: when the admin switched the feature off the
 * page shows a short notice instead of its body (and the menu link is hidden).
 */
export function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: FeatureKey;
  children: ReactNode;
}) {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { dir, t } = useLanguage();
  if (featureEnabled(catalog.settings?.featureFlags, featureKey))
    return <>{children}</>;
  return (
    <main className="library-page" dir={dir}>
      <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">{t("featureDisabledTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("featureDisabledBody")}</p>
      </section>
    </main>
  );
}

/** Renders a link or control only while its feature is switched on. */
export function FeatureOnly({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  return useFeature(feature) ? <>{children}</> : null;
}
