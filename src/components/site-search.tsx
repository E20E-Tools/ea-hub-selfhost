import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FileText, History, Package, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { ALL_CATEGORIES, filterCatalog, localizedProduct } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import type { Copy } from "@/lib/copy";
import { searchByMeaning } from "@/lib/semantic.functions";
import { normalizeQuery, type SemanticHit } from "@/lib/semantic.shared";

/** Wait after the last keystroke before asking the server to search by meaning. */
const MEANING_DEBOUNCE_MS = 350;

export type SearchPage = {
  to: string;
  key?: keyof Copy;
  label?: string;
  search?: Record<string, string>;
};

/** True when a "/" keypress should be left to the field the visitor is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

/** Site-wide Ctrl/Cmd+K palette: pages, products and passages close in meaning. */
export function SiteSearch({ pages }: { pages: SearchPage[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mac, setMac] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { language, dir, t } = useLanguage();
  const { data: catalog } = useSuspenseQuery(catalogQueryOptions);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      } else if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [meaning, setMeaning] = useState<{
    query: string;
    hits: SemanticHit[];
  } | null>(null);
  const meaningQuery = open ? normalizeQuery(query) : null;
  useEffect(() => {
    if (!meaningQuery) return;
    let live = true;
    const timer = setTimeout(() => {
      searchByMeaning({ data: { query: meaningQuery, language } })
        .then((result) => {
          if (live) setMeaning({ query: meaningQuery, hits: result.hits });
        })
        .catch(() => {
          if (live) setMeaning({ query: meaningQuery, hits: [] });
        });
    }, MEANING_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [meaningQuery, language]);

  const q = query.trim().toLowerCase();
  const pageLabel = (page: SearchPage) =>
    page.label ?? (page.key ? t(page.key) : "");
  const pageHits = pages.filter(
    (page) => !q || pageLabel(page).toLowerCase().includes(q),
  );
  const productHits = useMemo(
    () =>
      filterCatalog(catalog.products, query, ALL_CATEGORIES).map((p) =>
        localizedProduct(p, language),
      ),
    [catalog.products, query, language],
  );

  const meaningPending =
    meaningQuery !== null && meaning?.query !== meaningQuery;
  // Products already matched by text are not repeated under "close in meaning".
  const meaningHits = useMemo(() => {
    if (!meaningQuery || meaning?.query !== meaningQuery) return [];
    const shown = new Set(
      productHits.map((p) => "/product/" + encodeURIComponent(p.id)),
    );
    return meaning.hits.filter(
      (hit) => hit.kind !== "product" || !shown.has(hit.url),
    );
  }, [meaning, meaningQuery, productHits]);

  const go = (fn: () => void) => {
    setOpen(false);
    setQuery("");
    fn();
  };

  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        className="site-search-trigger"
        onClick={() => setOpen(true)}
        aria-label={t("paletteLabel")}
      >
        <Search size={15} aria-hidden="true" />
        <span className="site-search-label">{t("paletteLabel")}</span>
        <kbd className="site-search-kbd" dir="ltr">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            requestAnimationFrame(() => trigger.current?.focus());
          }
        }}
      >
        <DialogContent
          className="site-search overflow-hidden p-0"
          dir={dir}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">{t("paletteLabel")}</DialogTitle>
          <Command
            shouldFilter={false}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={t("palettePlaceholder")}
            />
            <CommandList>
              {pageHits.length + productHits.length + meaningHits.length ===
                0 && (
                <CommandEmpty>
                  {meaningPending ? t("searchSearching") : t("searchEmpty")}
                </CommandEmpty>
              )}
              {pageHits.length > 0 && (
                <CommandGroup heading={t("searchPages")}>
                  {pageHits.map((page) => (
                    <CommandItem
                      key={page.to}
                      value={`page:${page.to}`}
                      onSelect={() =>
                        go(() => {
                          if (page.label !== undefined)
                            window.location.assign(page.to);
                          else
                            void navigate({
                              to: page.to as never,
                              search: page.search as never,
                            });
                        })
                      }
                    >
                      <FileText aria-hidden="true" />
                      {pageLabel(page)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {productHits.length > 0 && (
                <CommandGroup heading={t("searchProducts")}>
                  {productHits.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={`product:${product.id}`}
                      onSelect={() =>
                        go(
                          () =>
                            void navigate({
                              to: "/product/$productId",
                              params: { productId: product.id },
                            }),
                        )
                      }
                    >
                      <Package aria-hidden="true" />
                      <bdi>{product.name}</bdi>
                      <span className="site-search-meta">
                        {product.comingSoon
                          ? t("comingSoonBadge")
                          : product.label}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {meaningHits.length > 0 && (
                <CommandGroup heading={t("searchRelated")}>
                  {meaningHits.map((hit) => (
                    <CommandItem
                      key={hit.kind + hit.url}
                      value={`meaning:${hit.kind}:${hit.url}`}
                      onSelect={() =>
                        go(() => void navigate({ to: hit.url as never }))
                      }
                    >
                      {hit.kind === "release" ? (
                        <History aria-hidden="true" />
                      ) : (
                        <Sparkles aria-hidden="true" />
                      )}
                      <bdi>{hit.title}</bdi>
                      {hit.kind === "release" ? (
                        <span className="site-search-meta">
                          {t("searchRelatedRelease")}
                        </span>
                      ) : (
                        <span
                          className="site-search-meta site-search-snippet"
                          title={hit.snippet}
                        >
                          {hit.snippet}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
