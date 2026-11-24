import workspaceCss from "@/studio/workspace.css?url";
import { directionBootstrap } from "@/studio/directions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { fontsHref, themeCss, type SiteSettings } from "@/lib/catalog";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/assistant-chat";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
  directionOf,
  effectiveLanguage,
  type Language,
} from "@/lib/language";
import { savedLanguage } from "@/lib/language-cookie.functions";
import { StudioHeader, StudioFooter } from "@/studio/shell";
import studioCss from "@/studio/studio.css?url";
import { VisitTracker } from "@/components/visit-tracker";
import { ProductMotion } from "@/components/product-motion";

import { Toaster } from "@/components/ui/sonner";
import { useLanguage } from "@/lib/language";
import { featureEnabled } from "@/lib/site-features";
import { useFontStylesheet } from "@/themes/use-theme-fonts";
import { ThemePreview } from "@/themes/theme-preview";
import { defaultDesignTheme } from "@/lib/design-themes";
import { ARCHY_TOUR_KEY } from "@/lib/archy-tour";
import { reloadForStaleChunk } from "@/lib/stale-chunk";

/**
 * Runs before the first paint so a returning visitor who chose Arabic does not
 * see the English direction first. It only touches inline styles — the `lang` and
 * `dir` attributes belong to the rendered document, and changing them here
 * before hydration would leave React's view of the page out of step with the DOM.
 */
/** First-paint direction hint; with Arabic switched off it applies only inside the admin console. */
const languageBootstrap = (arabicEnabled: boolean) =>
  `(function(){try{var a=${arabicEnabled ? "true" : "false"}||location.pathname.indexOf("/admin")===0;if(a&&localStorage.getItem(${JSON.stringify(LANGUAGE_STORAGE_KEY)})==="ar"){var e=document.documentElement;e.style.direction="rtl";e.style.textAlign="right";}}catch(err){}})();`;
/** Hides only a pending tour's middle state; the stage reveals it after applying Legacy. */
const archyTourBootstrap = `(function(){var e=document.documentElement;if(location.pathname!=="/"||e.dataset.designTheme!=="transformation-board"||innerWidth<640||e.dataset.motion==="off"||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var forced=new URLSearchParams(location.search).get("archyTour")==="1",done=false;try{done=localStorage.getItem(${JSON.stringify(ARCHY_TOUR_KEY)})==="done";}catch(err){}if(forced||!done){e.setAttribute("data-archy-tour-pending","");e.style.setProperty("--archy-tour-board-opacity","0");}})();`;

function SiteTheme({ settings }: { settings: SiteSettings }) {
  useFontStylesheet(fontsHref(settings.headingFont, settings.bodyFont));
  return (
    <>
      <style>{themeCss(settings)}</style>
    </>
  );
}

function NotFoundComponent() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("notFoundTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("notFoundBody")}
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">{t("backHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  if (import.meta.env.DEV) console.error(error);
  const router = useRouter();
  const { t } = useLanguage();
  useEffect(() => {
    reloadForStaleChunk(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {t("errorTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              // A full reload also fetches the newest page files after a publish.
              if (typeof window !== "undefined") window.location.reload();
              else {
                router.invalidate();
                reset();
              }
            }}
          >
            {t("retry")}
          </Button>
          <Button asChild variant="outline">
            <a href="/">{t("backHome")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: async ({ context }) => {
      const [catalog, language] = await Promise.all([
        context.queryClient.ensureQueryData(catalogQueryOptions),
        savedLanguage().catch(() => null),
      ]);
      return { catalog, language: language ?? ("ar" as Language) };
    },
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "EA-Hub | E20E Tools" },
        {
          name: "description",
          content:
            "مكتبة منتجات البنية المؤسسية وإدارة التقنيات. Enterprise architecture and technology management product library.",
        },
        { property: "og:title", content: "EA-Hub | E20E Tools" },
        {
          property: "og:description",
          content: "مكتبة منتجات البنية المؤسسية وإدارة التقنيات.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        // Only the active design's fonts; Classic adds none.

        { rel: "stylesheet", href: studioCss },
        { rel: "stylesheet", href: workspaceCss },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", type: "image/png", href: "/favicon.png" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  // Theme attributes are rendered on the server so the first paint already uses the saved theme.
  const data = Route.useLoaderData({
    select: (d) => d?.catalog.settings.designTheme,
  }) as typeof defaultDesignTheme | undefined;
  const design = data ?? defaultDesignTheme;
  const assistantEnabled = Route.useLoaderData({
    select: (d) =>
      featureEnabled(d?.catalog.settings.featureFlags, "assistant"),
  });
  const arabicEnabled = Route.useLoaderData({
    select: (d) => featureEnabled(d?.catalog.settings.featureFlags, "arabic"),
  });
  const saved = Route.useLoaderData({ select: (d) => d?.language }) ?? "ar";
  const onAdmin = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });
  // The cookie's language (masked by the Arabic switch) is sent from the first byte.
  const lang = effectiveLanguage(saved, arabicEnabled, onAdmin);
  return (
    <html
      lang={lang}
      dir={directionOf(lang)}
      data-design-theme={design.theme}
      data-motion={design.animations ? "on" : "off"}
      data-motion-intensity={design.intensity}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: directionBootstrap }} />
        <script
          dangerouslySetInnerHTML={{ __html: languageBootstrap(arabicEnabled) }}
        />
        {assistantEnabled ? (
          <script dangerouslySetInnerHTML={{ __html: archyTourBootstrap }} />
        ) : null}
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { catalog, language: savedChoice } = Route.useLoaderData();
  // Hydrate the browser cache with the server's catalog so signed image links match the SSR HTML.
  if (queryClient.getQueryData(catalogQueryOptions.queryKey) === undefined) {
    queryClient.setQueryData(catalogQueryOptions.queryKey, catalog);
  }
  const onAdmin = useRouterState({
    select: (state) => state.location.pathname.startsWith("/admin"),
  });

  // Read the live catalog so an admin's Arabic switch applies without a reload.
  const arabicEnabled = featureEnabled(
    (queryClient.getQueryData(catalogQueryOptions.queryKey) ?? catalog).settings
      .featureFlags,
    "arabic",
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider
        arabicEnabled={arabicEnabled}
        onAdmin={onAdmin}
        initialLanguage={savedChoice}
      >
        <SiteTheme settings={catalog.settings} />
        <ThemePreview saved={catalog.settings.designTheme.theme} />
        <ProductMotion />
        <div
          className="flex min-h-screen flex-col"
          data-surface={onAdmin ? "admin" : "site"}
        >
          {!onAdmin && <StudioHeader />}
          <div id="main-content" tabIndex={-1} />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <div className="site-content flex flex-1 flex-col">
            <Outlet />
          </div>
          {!onAdmin && <StudioFooter />}
        </div>
        <Toaster />
        <VisitTracker />
        {!onAdmin &&
        featureEnabled(catalog.settings.featureFlags, "assistant") ? (
          <AssistantChat />
        ) : null}
      </LanguageProvider>
    </QueryClientProvider>
  );
}
