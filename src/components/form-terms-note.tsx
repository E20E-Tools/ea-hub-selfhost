import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { featureEnabled } from "@/lib/site-features";
import { dictionaries } from "@/lib/copy";

/** Small note under request forms linking to the terms of service. */
export function FormTermsNote() {
  const { t, language } = useLanguage();
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const ar = language !== "en";
  const privacy = (
    <a href="/privacy" target="_blank" className="text-primary underline underline-offset-4">
      {dictionaries[ar ? "ar" : "en"].formTermsNotePrivacyPolicy}
    </a>
  );
  if (!featureEnabled(catalog.settings.featureFlags, "terms")) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {dictionaries[ar ? "ar" : "en"].formTermsNoteWeHandleYourData}
        {privacy}.
      </p>
    );
  }
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {t("formTermsNote")}{" "}
      <Link to="/terms" target="_blank" className="text-primary underline underline-offset-4">
        {t("formTermsLink")}
      </Link>
      {dictionaries[ar ? "ar" : "en"].formTermsNoteAndWeHandleYour}
      {privacy}.
    </p>
  );
}
