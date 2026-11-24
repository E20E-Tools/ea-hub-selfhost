import { ArrowUpLeft, Check, Clock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizedProduct, type Product } from "@/lib/catalog";
import { fill } from "@/lib/copy";
import { useLanguage } from "@/lib/language";

/** The real catalog tool page, compacted into the open chat instead of navigating away. */
export function ChatProductPage({
  product: stored,
  onBack,
}: {
  product: Product;
  onBack: () => void;
}) {
  const { language, dir, t } = useLanguage();
  const product = localizedProduct(stored, language);
  const notes = (product.whatsNew ?? "").trim();

  return (
    <div className="assistant-product" dir={dir}>
      <div className="assistant-product-back">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          autoFocus
        >
          <Undo2 className="size-4" aria-hidden="true" />
          {t("chatBackToConversation")}
        </Button>
      </div>
      <div className="assistant-product-scroll">
        {product.image ? (
          <img
            className="assistant-product-image"
            src={product.image}
            alt={product.imageAlt || product.name}
            width={1280}
            height={832}
          />
        ) : null}
        <span className="detail-label">{product.label}</span>
        <h2 dir="ltr">{product.name}</h2>
        <p className="assistant-product-overview">{product.overview}</p>

        {product.comingSoon ? (
          <Button type="button" variant="ghost" disabled>
            <Clock className="size-4" aria-hidden="true" />
            {t("comingSoonBadge")}
          </Button>
        ) : product.url ? (
          <Button asChild>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={fill(t("openInNewWindow"), product.name)}
            >
              {t("openProduct")}
              <ArrowUpLeft className="size-4" aria-hidden="true" />
            </a>
          </Button>
        ) : null}

        {product.features.length ? (
          <section className="assistant-product-section">
            <h3>{t("productFeatures")}</h3>
            <ul>
              {product.features.map((feature) => (
                <li key={feature}>
                  <Check className="size-4" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.version || notes ? (
          <section className="assistant-product-section">
            <h3>{t("productVersion")}</h3>
            {product.version ? <bdi dir="ltr">{product.version}</bdi> : null}
            {notes ? (
              <div>
                <h4>{t("productWhatsNew")}</h4>
                <p>{notes}</p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
