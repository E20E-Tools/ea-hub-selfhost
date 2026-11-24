import { ProductExercise } from "./product-exercise";
import { FeatureOnly } from "./feature-gate";
import { useEffect, useRef } from "react";
import type { Product } from "@/lib/products";
import { cases } from "@/lib/product-cases";
import { trackJourney } from "@/lib/journey-client";

export function ProductCase({
  product,
  language,
}: {
  product: Product;
  language: "ar" | "en";
}) {
  const example = cases[product.id],
    ref = useRef<HTMLElement>(null);
  const ar = language === "ar",
    i = ar ? 0 : 1,
    url =
      !product.comingSoon && /^https?:\/\//i.test(product.url)
        ? product.url
        : "";
  useEffect(() => {
    if (!example || !url || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void trackJourney("case_viewed", language, { oncePerSession: true });
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [example, url, language]);
  if (!example) return null;
  return (
    <section ref={ref} className="bx-panel ea-case" id="use-case">
      <small>{ar ? "حالة استخدام توضيحية" : "Illustrative use case"}</small>
      <h2>{example.question[i]}</h2>
      <dl>
        <div>
          <dt>{ar ? "المدخلات" : "Inputs"}</dt>
          <dd>{example.input[i]}</dd>
        </div>
        <div>
          <dt>{ar ? "النتيجة والقرار" : "Outcome and decision"}</dt>
          <dd>{example.result[i]}</dd>
        </div>
      </dl>
      {url && (
        <a
          className="s-solid"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            void trackJourney("case_opened", language, { oncePerSession: true })
          }
        >
          {ar ? "جرّب" : "Try"} {product.name} ↗
        </a>
      )}
      {product.servicesEnabled !== false && !product.comingSoon && (
        <a
          className="ms-4 underline"
          href={
            "/enterprise-services?service=training&tool=" +
            encodeURIComponent(product.id)
          }
        >
          {ar ? "تدريب على هذه الحالة" : "Training for this use case"}
        </a>
      )}
      {!product.comingSoon && (
        <FeatureOnly feature="trials">
          <ProductExercise key={product.id + language} product={product} language={language} />
        </FeatureOnly>
      )}
    </section>
  );
}
