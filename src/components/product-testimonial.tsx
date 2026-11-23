import { useQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { featureEnabled } from "@/lib/site-features";
import { testimonialsQueryOptions } from "@/lib/testimonials.functions";
import {
  testimonialsForProduct,
  testimonialText,
} from "@/lib/testimonials.shared";

/**
 * One short customer quote about this product, shown beside the main call to action.
 * Renders nothing until a published testimonial names the product.
 */
export function ProductTestimonial({
  product,
  ar,
  className = "",
}: {
  product: { id: string; name: string };
  ar: boolean;
  className?: string;
}) {
  const catalog = useQuery(catalogQueryOptions);
  const on = featureEnabled(
    catalog.data?.settings.featureFlags,
    "testimonials",
  );
  const list = useQuery({ ...testimonialsQueryOptions, enabled: on });
  const match = on
    ? testimonialsForProduct(list.data ?? [], product)[0]
    : undefined;
  if (!match) return null;
  const text = testimonialText(match, ar ? "ar" : "en");
  const byline = [text.role, text.organization].filter(Boolean).join(" · ");
  return (
    <figure className={`ea-ptest ${className}`}>
      <blockquote>
        <p>{text.quote}</p>
      </blockquote>
      <figcaption>
        {match.image ? (
          <img src={match.image} alt="" width={36} height={36} loading="lazy" />
        ) : (
          <span aria-hidden="true">{match.name.trim().charAt(0)}</span>
        )}
        <span>
          <b>{match.name}</b>
          {byline && <small>{byline}</small>}
        </span>
      </figcaption>
    </figure>
  );
}
