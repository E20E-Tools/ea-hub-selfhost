import { Link, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bookmark, Compass, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteSearch } from "@/components/site-search";
import { LanguageSwitcher } from "@/components/language-switcher";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedSettings } from "@/lib/catalog";
import { IntroVideoButton } from "@/components/intro-video";
import { featureEnabled, isDisabledFeaturePath, type FeatureFlags } from "@/lib/site-features";
import { useLanguage } from "@/lib/language";
import type { Copy } from "@/lib/copy";
import { useThemeArt } from "@/themes/use-theme-art";
import { readNavigation, navigationLabel, type NavigationItem } from "@/lib/navigation.shared";

type NavItem = { to: string; key: keyof Copy; search?: Record<string, string>; cta?: boolean };

/** Four links plus the primary "send a request" call to action. */
export const MAIN_NAV: NavItem[] = [
  { to: "/", key: "navLibrary" },
  { to: "/technology-roadmap", key: "navRoadmap" },
  { to: "/support", key: "navSupport" },
  { to: "/about", key: "navBlog" },
  { to: "/affiliates", key: "navAffiliates" },
  { to: "/request", key: "requestCta", cta: true },
];

export const SEARCH_PAGES: NavItem[] = [...MAIN_NAV];

export function isActivePath(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}

/** The film lives on the About us page, so its header button follows that switch. */
export function showsIntroVideo(flags: FeatureFlags | undefined) {
  return featureEnabled(flags, "blog");
}

/**
 * One shared sticky bar for every visitor page: the brand on top and the compact
 * menu row underneath. The admin console keeps its own header.
 */
export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t, arabicAvailable } = useLanguage();
  const art = useThemeArt();
  if (pathname.startsWith("/admin")) return null;
  const settings = localizedSettings(catalog.settings, language);
  const navigation = readNavigation(settings.navigationItems);
  // Hidden menu items and links into switched-off features stay saved but invisible.
  const visibleNavigation = navigation.filter(
    (item) => item.hidden !== true && !isDisabledFeaturePath(settings.featureFlags, item.url),
  );
  const searchPages = [
    ...visibleNavigation.map((item) => ({ to: item.url, label: navigationLabel(item, language) })),
    { to: "/discover", label: t("bxStartNeed") },
    { to: "/my-tools", label: t("bxMyTools") },
    { to: "/my-requests", label: t("bxTrackRequests") },
  ];

  // Only one menu item may be current: the longest matching path wins, ties go to the first item.
  let activeId: string | undefined;
  let activeLen = -1;
  for (const item of visibleNavigation) {
    if (!item.url.startsWith("/")) continue;
    const path = item.url.split("?")[0] || "/";
    if (isActivePath(pathname, path) && path.length > activeLen) {
      activeId = item.id;
      activeLen = path.length;
    }
  }

  const link = (item: NavigationItem, className: string) => (
    <a
      key={item.id}
      href={item.url}
      className={className}
      aria-current={item.id === activeId ? "page" : undefined}
    >
      {navigationLabel(item, language)}
    </a>
  );

  return (
    <>
      <a href="#main-content" className="skip-link">
        {t("skipToContent")}
      </a>
      <header className="site-header" dir={dir} data-nav-style={settings.navStyle}>
        <div className="site-header-top">
          <Link to="/" className="site-brand" aria-label={settings.displayTitle}>
            {art.logo(settings.logoUrl) ? (
              <img src={art.logo(settings.logoUrl)} alt="" width={132} height={78} />
            ) : null}
            <span className="site-brand-text">
              <bdi dir="ltr">{settings.displayTitle}</bdi>
              {settings.tagline ? (
                <small className="site-brand-tagline" dir="ltr">
                  {settings.tagline}
                </small>
              ) : null}
            </span>
          </Link>
          <div className="site-actions">
            {/* Journey shortcuts sit beside the search and the introduction film. */}
            <div className="site-journey-links" aria-label={t("bxJourneyLinks")}>
              <Button asChild size="sm" className="site-journey-link">
                <Link to="/discover" aria-label={t("bxStartNeed")}>
                  <Compass size={14} aria-hidden="true" />
                  <span className="site-journey-label">{t("bxStartNeed")}</span>
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="site-journey-link">
                <Link to="/my-tools" aria-label={t("bxMyTools")}>
                  <Bookmark size={14} aria-hidden="true" />
                  <span className="site-journey-label">{t("bxMyTools")}</span>
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="site-journey-link">
                <Link to="/my-requests" aria-label={t("bxTrackRequests")}>
                  <MessagesSquare size={14} aria-hidden="true" />
                  <span className="site-journey-label">{t("bxTrackShort")}</span>
                </Link>
              </Button>
            </div>
            <span className="site-actions-divider" aria-hidden="true" />
            <div className="site-tools">
              {showsIntroVideo(settings.featureFlags) ? <IntroVideoButton /> : null}
              <SiteSearch pages={searchPages} />
              {arabicAvailable ? (
                <div className="site-lang">
                  <LanguageSwitcher inline />
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <nav
          className="site-nav site-menu-row"
          data-style={settings.navStyle}
          aria-label={t("navigationLabel")}
        >
          {visibleNavigation.map((item) =>
            link(item, item.cta ? "site-nav-link site-nav-cta" : "site-nav-link"),
          )}
        </nav>
      </header>
    </>
  );
}
