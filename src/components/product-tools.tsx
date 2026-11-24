import { Link } from "@tanstack/react-router";
import { Check, Heart, Scale, X } from "lucide-react";
import type { Product } from "@/lib/products";
import { Button } from "./ui/button";
import { useLanguage } from "@/lib/language";
import { useMyTools } from "@/lib/use-my-tools";
import { encodeComparisonIds } from "@/lib/my-tools";
import { trackJourney } from "@/lib/journey-client";
import { useFeature } from "@/lib/use-feature";

export function ProductToolsActions({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const tools = useMyTools();
  const favorite = tools.favorites.includes(product.id);
  const comparing = tools.compare.includes(product.id);
  const canSave = useFeature("myTools");
  const canCompare = useFeature("compare") && !product.comingSoon;
  if (!canSave && !canCompare) return null;
  return (
    <div className="bx-product-tools" aria-label={t("bxMyTools")}>
      {canSave && (
        <Button
          type="button"
          variant={favorite ? "secondary" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "min-h-11 min-w-11" : ""}
          aria-label={`${favorite ? t("bxRemove") : t("bxSaveTool")}: ${product.name}`}
          aria-pressed={favorite}
          title={favorite ? t("bxSavedTool") : t("bxSaveTool")}
          onClick={() => tools.toggleFavorite(product.id)}
        >
          <Heart
            size={16}
            fill={favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
          {!compact && (
            <span>{favorite ? t("bxSavedTool") : t("bxSaveTool")}</span>
          )}
        </Button>
      )}
      {canCompare && (
        <Button
          type="button"
          variant={comparing ? "secondary" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "min-h-11 min-w-11" : ""}
          aria-label={`${comparing ? t("bxRemove") : t("bxCompare")}: ${product.name}`}
          aria-pressed={comparing}
          title={t("bxCompare")}
          onClick={() => tools.toggleCompare(product.id)}
        >
          {comparing ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <Scale size={16} aria-hidden="true" />
          )}
          {!compact && <span>{t("bxCompare")}</span>}
        </Button>
      )}
      {tools.limited && (
        <p className="bx-inline-note" role="alert">
          {t("bxCompareLimit")}
        </p>
      )}
      {tools.status !== "ok" && (
        <p className="bx-inline-note" role="status">
          {t("bxStorageBlocked")}
        </p>
      )}
    </div>
  );
}

export function CompareTray({
  goal,
}: {
  goal?: import("@/lib/beneficiary-metadata").DiscoveryGoal | undefined;
} = {}) {
  const { t, language } = useLanguage();
  const tools = useMyTools();
  const enabled = useFeature("compare");
  if (!enabled || !tools.compare.length) return null;
  const ids = encodeComparisonIds(tools.compare);
  return (
    <section className="bx-compare-tray" aria-label={t("bxCompare")}>
      <p>
        <strong>{tools.compare.length}</strong> / {tools.maxCompare}{" "}
        {t("bxSelected")}
      </p>
      <div className="bx-chip-list">
        {tools.compare.map((id) => (
          <button
            key={id}
            type="button"
            className="bx-id-chip"
            onClick={() => tools.toggleCompare(id)}
            aria-label={`${t("bxRemove")}: ${id}`}
          >
            <bdi dir="ltr">{id}</bdi>
            <X size={14} aria-hidden="true" />
          </button>
        ))}
      </div>
      {tools.compare.length < 2 ? (
        // A link cannot be disabled; a real disabled button keeps one-tool selections here.
        <Button type="button" disabled title={t("bxCompareNeedTwo")}>
          <Scale size={16} aria-hidden="true" />
          {t("bxCompare")}
        </Button>
      ) : (
        <Button asChild>
          <Link
            to="/compare"
            search={{ ids, goal }}
            onClick={() => void trackJourney("comparison_opened", language)}
          >
            <Scale size={16} aria-hidden="true" />
            {t("bxCompare")}
          </Link>
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={tools.clearCompare}>
        {t("bxCompareClear")}
      </Button>
    </section>
  );
}
