import type { Product } from "./products";
import { localizeBeneficiaryDetails } from "./beneficiary-metadata";
import { pick, type Language } from "./language-core";
import { archoneLaunchLabel } from "./archone-launch";

export type AcquisitionGuide = {
  /** Owner-entered prerequisites only; empty means not published yet. */
  requirements: string[];
  /** Owner-entered purchase steps only; empty means the process has not been provided. */
  steps: string[];
  /** Announced launch label, or null when no date has been announced. */
  launch: string | null;
};

/** Requirements and purchase path for a tool that cannot be requested yet; null when available. */
export function acquisitionGuide(
  product: Product,
  language: Language,
): AcquisitionGuide | null {
  if (!product.comingSoon) return null;
  const details = localizeBeneficiaryDetails(
    product.beneficiaryDetails,
    language,
  );
  return {
    requirements: details.prerequisites,
    // Never substitute a generic process: an empty list is shown as "not provided".
    steps: details.purchaseSteps,
    launch:
      product.id === "archone"
        ? archoneLaunchLabel(language === "ar", product.publicationDate) || null
        : null,
  };
}

/** Pre-filled sales email subject so the team sees which upcoming tool the visitor wants. */
export function salesMailto(
  email: string,
  productName: string,
  language: Language,
): string {
  const subject = pick(
    language,
    `اهتمام بشراء ${productName}`,
    `Purchase interest: ${productName}`,
  );
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
