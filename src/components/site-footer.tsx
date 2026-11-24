import { useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedSettings } from "@/lib/catalog";
import { featureEnabled } from "@/lib/site-features";
import { useLanguage } from "@/lib/language";
import { linkedFooterParts } from "@/lib/footer-links";
import { useState } from "react";
import { useActiveTheme } from "@/themes/use-active-theme";

/** Shared visitor footer: settings footer text. */
export function SiteFooter() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);
  const { language, dir, t } = useLanguage();
  const theme = useActiveTheme(catalog.settings.designTheme.theme);
  const [phosphor, setPhosphor] = useState(false);
  if (pathname.startsWith("/admin")) return null;
  const { footerText } = localizedSettings(catalog.settings, language);
  return (
    <>
      {featureEnabled(catalog.settings.featureFlags, "newsletter") && (
        <aside className="mx-auto my-4 text-center">
          <a className="underline underline-offset-4" href="/newsletter">
            {language === "ar"
              ? "اشترك في النشرة الشهرية"
              : "Subscribe to monthly updates"}
          </a>
        </aside>
      )}
      <footer
        className="site-footer"
        dir={dir}
        data-phosphor={
          theme === "legacy-to-digital" && phosphor ? "" : undefined
        }
      >
        <div className="site-footer-inner">
          {theme === "legacy-to-digital" ? (
            <button
              type="button"
              className="ld-crt-egg"
              aria-pressed={phosphor}
              aria-label={t("ldCrt")}
              onClick={() => setPhosphor((v) => !v)}
            >
              <svg viewBox="0 0 24 20" aria-hidden="true">
                <rect x="1" y="1" width="22" height="15" rx="3" />
                <rect x="4" y="4" width="16" height="9" rx="1" />
                <path d="M8 19h8M12 16v3" />
              </svg>
            </button>
          ) : null}
          <div className="site-footer-bottom">
            {footerText ? (
              <p dir="ltr">
                {footerText.split("♥").map((part, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <Heart
                        size={14}
                        className="library-footer-heart"
                        aria-label="love"
                      />
                    )}
                    {linkedFooterParts(
                      part,
                      catalog.settings.footerLinks ?? [],
                    ).map((segment, index) =>
                      segment.url ? (
                        <a
                          key={index}
                          href={segment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4 hover:text-primary"
                        >
                          {segment.text}
                        </a>
                      ) : (
                        <span key={index}>{segment.text}</span>
                      ),
                    )}
                  </span>
                ))}
              </p>
            ) : (
              <span />
            )}
          </div>
        </div>
      </footer>
    </>
  );
}
