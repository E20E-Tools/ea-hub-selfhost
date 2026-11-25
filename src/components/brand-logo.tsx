import { useEffect, useState, type CSSProperties } from "react";

/** Same-origin and inline images can always be used as a CSS mask. */
function maskableNow(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//")
    ? true
    : src.startsWith("data:") || src.startsWith("blob:");
}

/**
 * The site logo, drawn without a box or frame and tinted with the active design colours.
 *
 * The uploaded image becomes a CSS mask over a fill (`--brand-logo-fill`, set by each
 * placement), so the mark follows the studio direction, the design and the admin colours.
 * Masks need a same-origin or CORS-enabled image; for any other source the logo is shown
 * as the original image instead of disappearing. The <img> always stays in the box, hidden
 * while masked, so the logo keeps its real proportions and remains the fallback.
 */
export function BrandLogo({
  src,
  className,
  width,
  height,
}: {
  src: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [masked, setMasked] = useState(() => maskableNow(src));
  useEffect(() => {
    if (maskableNow(src)) {
      setMasked(true);
      return;
    }
    setMasked(false);
    let live = true;
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => live && setMasked(true);
    probe.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  // Quotes, backslashes and line breaks would end the url() token early.
  const safe = src.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c));
  const style = masked
    ? ({ "--brand-logo-src": `url("${safe}")` } as CSSProperties)
    : undefined;
  return (
    <span
      className={className ? `brand-logo ${className}` : "brand-logo"}
      data-masked={masked ? "" : undefined}
      style={style}
    >
      <img src={src} alt="" width={width} height={height} decoding="async" />
    </span>
  );
}
