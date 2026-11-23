import { useState } from "react";
import { TeamTrials } from "@/components/team-trials";
import { SavedExercises } from "@/components/saved-exercises";
import {SavedDecisions} from "@/components/comparison-decision";
import { JourneyHeading } from "@/studio/journey-heading";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Heart } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedProduct } from "@/lib/catalog";
import { useMyTools } from "@/lib/use-my-tools";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { CompareTray, ProductToolsActions } from "@/components/product-tools";
import { useThemeArt } from "@/themes/use-theme-art";
import { pageUrl } from "@/lib/seo";

export const Route = createFileRoute("/my-tools")({
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQueryOptions),
  head: () => ({
    meta: [
      { title: "My tools — E20E Tools | أدواتي" },
      {
        name: "description",
        content: "Browser-local tool favorites and comparisons using only public product IDs.",
      },
      { property: "og:title", content: "My tools — E20E Tools" },
      {
        property: "og:description",
        content: "Review local favorites, compare tools and securely track your requests.",
      },
      { property: "og:url", content: pageUrl("/my-tools") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: pageUrl("/my-tools") }],
  }),
  component: MyToolsPage,
});

function MyToolsPage() {
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t } = useLanguage();
  const tools = useMyTools();
  const [removed, setRemoved] = useState<string[]>([]);
  const art = useThemeArt();
  const favorites = tools.favorites
    .map((id) => catalog.products.find((product) => product.id === id))
    .filter((product) => Boolean(product))
    .map((product) => localizedProduct(product!, language));
  return (
    <main className="bx-page ea-workspace ea-my-tools" dir={dir}>
      <JourneyHeading
        icon={Heart}
        title={t("bxMyToolsTitle")}
        description={t("bxMyToolsLead")}
        view="my-tools"
      />
      <a className="ea-guide-step" href={`/guide/${language}.html#s3`}>{language === "ar" ? "أين أجد أدواتي المحفوظة؟" : "How do I find my saved tools?"}</a>
      <p className="bx-local-note">{t("bxLocalOnly")}</p>
      {tools.status !== "ok" && (
        <p className="bx-local-note" role="status">
          {t("bxStorageBlocked")}
        </p>
      )}
      <CompareTray />
      <div className="bx-actions">
        <Button asChild>
          <Link to="/discover">{t("bxStartNeed")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/my-requests">{t("bxTrackRequests")}</Link>
        </Button>

      </div>
      <section className="mt-8" aria-labelledby="favorite-tools">
        <div className="ea-favorites-heading">
        <h2 id="favorite-tools" className="ea-shelf-heading">
          <Bookmark size={20} />
          {t("bxFavorites")} <span>{favorites.length}</span>
        </h2>
        {favorites.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setRemoved(tools.clearFavorites())}
        >
          {t("bxClearFavorites")}
        </Button>
        )}
        </div>
        {removed.length > 0 && (
          <div className="bx-actions">
            <span role="status">{language === "ar" ? "أُزيلت من المفضلة" : "Removed from favorites"} ({removed.length})</span>
            <Button type="button" variant="outline" onClick={() => {
              tools.restoreFavorites(removed);
              setRemoved([]);
            }}>{language === "ar" ? "تراجع" : "Undo"}</Button>
          </div>
        )}
        {!tools.hydrated ? (
          <p role="status">…</p>
        ) : favorites.length === 0 ? (
          <div className="bx-empty">
            <p>{t("bxNoFavorites")}</p>
            <Button asChild variant="outline">
              <Link to="/" hash="catalog">{t("backToLibrary")}</Link>
            </Button>
          </div>
        ) : (
          <div className="bx-results">
            {favorites.map((product) => (
              <article className="bx-result ea-shelf-record" key={product.id}>
                <Link
                  to="/product/$productId"
                  params={{ productId: product.id }}
                  aria-label={product.name}
                  className="ea-shelf-art"
                >
                  <img src={art.image(product)} alt="" loading="lazy" />
                  <span>{product.comingSoon ? t("comingSoonBadge") : product.label}</span>
                </Link>
                <h3 dir="ltr">{product.name}</h3>
                <p>{product.description}</p>
                <ProductToolsActions product={product} />
                <div className="bx-actions">
                  <Button asChild variant="outline">
                    <Link to="/product/$productId" params={{ productId: product.id }}>
                      {t("bxOpenDetails")}
                    </Link>
                  </Button>
                  {!product.comingSoon && (
                    <Button asChild variant="ghost">
                      <Link to="/try/$productId" params={{ productId: product.id }}>
                        {t("bxTryDemo")}
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
<TeamTrials ar={language === "ar"}/>
<SavedExercises ar={language === "ar"}/>
<SavedDecisions/>
    </main>
  );
}
