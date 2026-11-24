import { Link } from "@tanstack/react-router";
import { CalendarClock, ListChecks, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acquisitionGuide, salesMailto } from "@/lib/acquisition";
import { useLanguage } from "@/lib/language";
import type { Product } from "@/lib/products";

/** Requirements, availability and purchase path for a coming-soon tool (renders nothing otherwise). */
export function AcquisitionGuidePanel({
  product,
  salesEmail,
  variant = "card",
}: {
  /** Localized product (the guide reads the raw bilingual metadata it carries). */
  product: Product;
  salesEmail: string;
  variant?: "card" | "page";
}) {
  const { language, t } = useLanguage();
  const guide = acquisitionGuide(product, language);
  if (!guide) return null;
  const Heading = variant === "page" ? "h2" : "h4";
  const Sub = variant === "page" ? "h3" : "h5";
  const headingId = `acquire-${variant}-${product.id}`;
  return (
    <section
      className={
        variant === "page"
          ? "bx-panel bx-acquire bx-acquire-page"
          : "bx-acquire"
      }
      aria-labelledby={headingId}
    >
      <Heading id={headingId} className="bx-acquire-title">
        <ListChecks aria-hidden="true" size={18} />
        {t("bxAcquireTitle")}
      </Heading>
      <p className="bx-acquire-lead">{t("bxAcquireLead")}</p>
      <p className="bx-acquire-launch">
        <CalendarClock aria-hidden="true" size={16} />
        <span>
          {t("bxLaunchDate")}:{" "}
          <strong>{guide.launch ?? t("bxLaunchUnknown")}</strong>
        </span>
      </p>
      <div>
        <Sub className="bx-acquire-sub">{t("bxRequirements")}</Sub>
        {guide.requirements.length ? (
          <ul className="bx-acquire-list">
            {guide.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="bx-acquire-unknown">{t("bxRequirementsUnknown")}</p>
        )}
      </div>
      <div>
        <Sub className="bx-acquire-sub">{t("bxPurchaseSteps")}</Sub>
        {guide.steps.length ? (
          <ol className="bx-acquire-steps">
            {guide.steps.map((step, index) => (
              <li key={`${index}-${step}`}>{step}</li>
            ))}
          </ol>
        ) : (
          <p className="bx-acquire-unknown">{t("bxPurchaseStepsUnknown")}</p>
        )}
      </div>
      <Button asChild variant="outline" size="sm" className="self-start">
        {salesEmail ? (
          <a href={salesMailto(salesEmail, product.name, language)}>
            <Mail aria-hidden="true" />
            {t("bxContactSales")}
          </a>
        ) : (
          <Link to="/contact">
            <Mail aria-hidden="true" />
            {t("bxContactSales")}
          </Link>
        )}
      </Button>
    </section>
  );
}
