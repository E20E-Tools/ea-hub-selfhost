import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LifeBuoy, MessageCircle, Sparkles, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyArchySummary } from "@/lib/archy-visitor.functions";
import { suggestArchyRoute, type ArchyRoute } from "@/lib/archy-settings";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { archyContext, archyComparePrompt } from "@/lib/archy-context.shared";

export type ArchyOpenIntent = { prefill?: string; human?: boolean };

/**
 * Archy's guide card: the visitor's own summary plus a suggested chat for this page.
 * Choosing only opens the existing assistant (optionally pre-filling a draft); it never
 * sends a message or creates a chat by itself.
 */
export function ArchyGuide({
  onClose,
  onChoose,
  autoFocus = true,
  inline = false,
}: {
  /** Rendered inside the chat window instead of as a floating card. */
  inline?: boolean;
  onClose: () => void;
  /** False when the card opened by itself, so it never steals focus from the page. */
  autoFocus?: boolean;
  onChoose: (intent: ArchyOpenIntent) => void;
}) {
  const { t, language } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fetchSummary = useServerFn(getMyArchySummary);
  const [accountId, setAccountId] = useState<string | null>(null);
  const { data: catalog } = useQuery(catalogQueryOptions);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setAccountId(data.user?.email_confirmed_at ? data.user.id : null);
      })
      .catch(() => {
        if (active) setAccountId(null);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccountId(session?.user.email_confirmed_at ? session.user.id : null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  const summary = useQuery({
    queryKey: ["archy-summary", accountId],
    queryFn: () => fetchSummary(),
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
  useEffect(() => {
    if (autoFocus) firstRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, inline]);

  const info = accountId ? (summary.data ?? null) : null;
  const contextual = archyContext(catalog?.products ?? [], language, pathname);
  const route = suggestArchyRoute(pathname, info?.openSupport ?? 0);
  const productId = /^\/product\/([^/]+)/.exec(pathname)?.[1];
  const product = productId ? catalog?.products.find((p) => p.id === productId) : undefined;
  const productName = product ? (language === "en" && product.labelEn) || product.label : "";

  const suggestion: Record<ArchyRoute, { label: string; intent: ArchyOpenIntent }> = {
    tool: {
      label: t("archyRouteTool"),
      intent: {
        prefill: t("archyPrefillTool") + (productName || decodeURIComponent(productId ?? "")),
      },
    },
    support: {
      label: t("archyRouteSupport"),
      intent: { prefill: t("archyPrefillSupport"), human: true },
    },
    request: { label: t("archyRouteRequest"), intent: { prefill: t("archyPrefillRequest") } },
    guide: { label: t("archyRouteGuide"), intent: {} },
  };
  const main = suggestion[route];

  return (
    <div
      className={inline ? "archy-guide archy-guide-inline" : "archy-guide"}
      role={inline ? "region" : "dialog"}
      aria-label={t("archyGuideTitle")}
    >
      <div className="archy-guide-head">
        <strong>{t("archyGuideTitle")}</strong>
        <button
          type="button"
          className="archy-dismiss"
          aria-label={t("archyGuideClose")}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {info ? (
        <div className="archy-guide-visitor">
          <p className="archy-guide-name">
            {t("archyGuideHello")}
            {info.name ? ` ${info.name}` : ""}
            <span dir="ltr">{info.email}</span>
          </p>
          <dl>
            <div>
              <dt>{t("archyGuideChats")}</dt>
              <dd>{info.chats}</dd>
            </div>
            <div>
              <dt>{t("archyGuideSupport")}</dt>
              <dd>{info.openSupport}</dd>
            </div>
          </dl>
          {info.support?.length ? (
            <div className="archy-guide-support">
              <ul>
                {info.support.map((r) => {
                  const fresh =
                    r.updatedAt && Date.now() - Date.parse(r.updatedAt) < 14 * 86_400_000;
                  return (
                    <li key={r.id}>
                      <span dir="ltr">#{r.id}</span>
                      <span className="archy-guide-status" data-status={r.status}>
                        {t(`archyStatus_${r.status}` as Parameters<typeof t>[0])}
                      </span>
                      {fresh ? <em>{t("archySupportUpdated")}</em> : null}
                    </li>
                  );
                })}
              </ul>
              <Link to="/support" onClick={onClose} className="archy-guide-support-link">
                <LifeBuoy aria-hidden="true" />
                {t("archySupportView")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : !accountId && !inline ? (
        <p className="archy-guide-note">{t("archyGuideSignedOut")}</p>
      ) : null}
      <p className="archy-guide-label">{t("archyGuideSuggested")}</p>
      <button
        ref={firstRef}
        type="button"
        className="archy-guide-main"
        data-route={route}
        onClick={() => onChoose(main.intent)}
      >
        <Sparkles aria-hidden="true" />
        <span>{main.label}</span>
      </button>
      <p className="archy-guide-label">{t("archyGuideMore")}</p>
      <div className="grid gap-2">
        <Button variant="outline" onClick={() => onChoose({ prefill: t("archyHelpChoosePrompt") })}>
          {t("archyHelpChoose")}
        </Button>
        {contextual.length >= 2 && (
          <Button
            variant="outline"
            onClick={() =>
              onChoose({
                prefill: archyComparePrompt(
                  contextual.slice(0, 2).map((p) => p.name),
                  language,
                ),
              })
            }
          >
            {t("archyCompare")}
          </Button>
        )}
        {contextual.map((p) => (
          <div key={p.id} className="border-s border-border ps-2">
            <Link
              to="/product/$productId"
              params={{ productId: p.id }}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              {p.name}
            </Link>
            <p className="text-xs text-muted-foreground">{p.reason}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChoose({ prefill: t("archyPrefillTool") + p.name })}
            >
              {t("archyRouteTool")}
            </Button>
          </div>
        ))}
      </div>
      <div className="archy-guide-options">
        {route !== "guide" && (
          <button type="button" onClick={() => onChoose({})}>
            <MessageCircle aria-hidden="true" />
            {t("archyRouteGuide")}
          </button>
        )}
        {route !== "support" && (
          <button type="button" onClick={() => onChoose({ human: true })}>
            <Users aria-hidden="true" />
            {t("archyRouteTeam")}
          </button>
        )}
        <Link to="/request" onClick={onClose}>
          <ArrowUpRight aria-hidden="true" />
          {t("archyRouteNewRequest")}
        </Link>
        <Link to="/support" onClick={onClose}>
          <LifeBuoy aria-hidden="true" />
          {t("archyRouteSupportPage")}
        </Link>
      </div>
    </div>
  );
}
