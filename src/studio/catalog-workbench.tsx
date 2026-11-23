import { ArrowDownToLine, ArrowUpRight, Check, Clock3 } from "lucide-react";
import { useLanguage } from "@/lib/language";
import type { Product } from "@/lib/catalog";
import { CompareTray, ProductToolsActions } from "@/components/product-tools";
import { useThemeArt } from "@/themes/use-theme-art";
import { useDirection } from "./directions";

function downloadCard(p: Product, ar: boolean) {
  const availability = p.comingSoon
    ? ar
      ? "قيد التطوير"
      : "In development"
    : ar
      ? "متاحة"
      : "Available";
  const lines = [
    p.name,
    p.label + " · " + availability,
    p.version || "",
    "",
    p.overview || p.description,
    "",
    ...p.features.map((f) => "• " + f),
    "",
    new URL("/product/" + encodeURIComponent(p.id), location.origin).href,
  ];
  const file = new Blob(["\uFEFF", lines.join("\n")], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = p.id + "-brief.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CatalogWorkbench({ products }: { products: Product[] }) {
  const { language, t } = useLanguage();
  const ar = language === "ar";
  const art = useThemeArt();
  const design = useDirection();
  return (
    <section className="nx-catalog" id="catalog" aria-label={ar ? "مكتبة الأدوات" : "Tool library"}>
      <CompareTray />
      {products.length ? (
        <div className="nx-card-grid" data-layout={design}>
          {products.map((product) => {
            const url = "/product/" + encodeURIComponent(product.id);
            const fileLabel = (ar ? "تنزيل بطاقة " : "Download brief for ") + product.name;
            const image = art.image(product);
            return (
              <article
                className="nx-product-card"
                key={product.id}
                id={"catalog-" + product.id}
                aria-labelledby={"catalog-name-" + product.id}
              >
                <div className="nx-card-visual">
                  {image && (
                    <img src={image} alt={product.imageAlt} loading="lazy" decoding="async" />
                  )}
                  <span className="nx-card-state" data-available={!product.comingSoon}>
                    {product.comingSoon ? (
                      <Clock3 size={13} aria-hidden="true" />
                    ) : (
                      <Check size={13} aria-hidden="true" />
                    )}
                    {product.comingSoon ? t("comingSoonBadge") : ar ? "متاحة الآن" : "Available now"}
                  </span>
                </div>
                <div className="nx-card-copy">
                  <p className="nx-card-domain">{product.label}</p>
                  <h2 id={"catalog-name-" + product.id}>
                    <bdi dir="auto">{product.name}</bdi>
                  </h2>
                  <p className="nx-card-description">{product.description}</p>
                </div>
                <div className="nx-card-actions">
                  <a
                    className="nx-card-open"
                    href={url}
                    aria-label={t("details") + " · " + product.name}
                  >
                    {t("details")} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                  <div className="nx-card-tools">
                    <ProductToolsActions product={product} compact />
                    <button
                      className="nx-card-download"
                      type="button"
                      aria-label={fileLabel}
                      title={fileLabel}
                      onClick={() => downloadCard(product, ar)}
                    >
                      <ArrowDownToLine size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="s-empty" role="status">
          {t("noResultsTitle")}
        </p>
      )}
    </section>
  );
}
