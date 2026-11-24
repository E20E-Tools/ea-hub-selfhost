import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/catalog";
import { fill, fill2 } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import { countdownParts, formatLaunchDate, launchInstant } from "./launch";

/** Headless open/close state; closing returns focus to the node that opened it. */
export function useProductInspector() {
  const [openId, setOpenId] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const open = useCallback((id: string, from: HTMLElement | null) => {
    trigger.current = from;
    setOpenId(id);
  }, []);
  const close = useCallback(() => {
    setOpenId(null);
    trigger.current?.focus();
  }, []);
  return { openId, open, close };
}

/** Facts every theme shows: status, launch label and live countdown. */
export function useInspectorFacts(product: Product) {
  const { language, t } = useLanguage();
  const target = product.comingSoon ? launchInstant(product) : null;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (!target) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [target?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const parts = target && now ? countdownParts(target, now) : null;
  return {
    available: !product.comingSoon,
    status: product.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable"),
    launch:
      product.comingSoon && product.publicationDate
        ? fill(
            t("inspectorLaunches"),
            formatLaunchDate(product.publicationDate, language),
          )
        : null,
    countdown: parts
      ? fill2(t("inspectorCountdown"), String(parts.days), String(parts.hours))
      : null,
    features: product.features.slice(0, 5),
    canOpen: !product.comingSoon && Boolean(product.url),
  };
}

export function InspectorActions({
  product,
  className = "inspector-actions",
  details,
  openTool,
}: {
  product: Product;
  className?: string;
  details?: ReactNode;
  openTool?: ReactNode;
}) {
  const { t } = useLanguage();
  const canOpen = !product.comingSoon && Boolean(product.url);
  return (
    <div className={className}>
      <Link
        to="/product/$productId"
        params={{ productId: product.id }}
        className="inspector-btn inspector-btn-details"
      >
        {details ?? t("details")}
      </Link>
      {canOpen ? (
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inspector-btn inspector-btn-open"
          aria-label={fill(t("openInNewWindow"), product.name)}
        >
          {openTool ?? `${t("inspectorOpenTool")} ↗`}
        </a>
      ) : null}
    </div>
  );
}

/**
 * Accessible inspector shell. Esc or a click outside closes it; under 640px CSS turns it
 * into a bottom sheet. Themes skin it with `className` and pass their own body.
 */
export function InspectorPanel({
  product,
  title,
  onClose,
  className = "",
  children,
}: {
  product: Product;
  title: ReactNode;
  onClose: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const { t, dir } = useLanguage();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && panel.current && !panel.current.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      dir={dir}
      className={`product-inspector ${className}`}
      data-product={product.id}
    >
      <div className="inspector-head">
        <span id={titleId} className="inspector-title">
          {title}
        </span>
        <button
          type="button"
          className="inspector-close"
          onClick={onClose}
          aria-label={t("inspectorClose")}
        >
          ×
        </button>
      </div>
      {children ?? <InspectorBody product={product} />}
    </div>
  );
}

/** Default body for themes that do not render their own. */
export function InspectorBody({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  return (
    <div className="inspector-body">
      <span className="inspector-category">{product.label}</span>
      <strong className="inspector-name" dir="ltr">
        {product.name}
      </strong>
      <p>{product.description}</p>
      <p className="inspector-status">
        {facts.status}
        {facts.launch ? ` · ${facts.launch}` : ""}
        {facts.countdown ? ` · ${facts.countdown}` : ""}
      </p>
      {facts.features.length ? (
        <ul>
          {facts.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      {product.version ? (
        <p>
          {t("inspectorVersion")}: <bdi>{product.version}</bdi>
        </p>
      ) : null}
      {product.whatsNew ? (
        <p>
          {t("inspectorWhatsNew")}: {product.whatsNew}
        </p>
      ) : null}
      <InspectorActions product={product} />
    </div>
  );
}
