import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  CircuitBoard,
  ContactRound,
  UserRound,
  ExternalLink,
  Inbox,
  Languages,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ADMIN_NAV,
  TAB_LABELS,
  sectionMeta,
  type AdminSection,
  type AdminTab,
} from "@/lib/admin-sections";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { useAdminCopy } from "./ui";

const ICONS: Record<AdminSection, LucideIcon> = {
  dashboard: LayoutDashboard,
  customers: ContactRound,
  inbox: Inbox,
  livechat: MessagesSquare,
  feedback: Star,
  enterprise: Building2,
  content: Layers,
  settings: Settings,
  security: ShieldCheck,
};

export type Go = (section: AdminSection, tab?: AdminTab) => void;

function NavList({
  section,
  go,
  badge,
  liveBadge,
  collapsed,
}: {
  section: AdminSection;
  go: Go;
  badge: number;
  liveBadge: number;
  collapsed: boolean;
}) {
  const { t, dir } = useAdminCopy();
  return (
    <nav aria-label={t("sectionsNav")} className="ea-console-nav">
      {ADMIN_NAV.map((group) => (
        <div key={group.group} className="ea-console-group">
          {!collapsed ? (
            <p className="ea-group-label">{t(group.group)}</p>
          ) : null}
          {group.items.map((item) => {
            const Icon = ICONS[item.id];
            const active = section === item.id;
            const count =
              item.id === "inbox"
                ? badge
                : item.id === "livechat"
                  ? liveBadge
                  : 0;
            const button = (
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? t(item.label) : undefined}
                onClick={() => go(item.id)}
                className={cn(
                  "ea-nav-entry relative flex w-full items-center gap-3 rounded-md px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {!collapsed ? (
                  <span className="flex-1 truncate text-start">
                    {t(item.label)}
                  </span>
                ) : null}
                {count > 0 ? (
                  <span
                    className={cn(
                      "ea-rail-count min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5",
                      collapsed && "absolute -top-1 end-0",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
            return collapsed ? (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side={dir === "rtl" ? "left" : "right"}>
                  {t(item.label)}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.id}>{button}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  section,
  tab,
  go,
  account,
  siteTitle,
  inboxBadge,
  liveBadge = 0,
  onSignOut,
  children,
}: {
  liveBadge?: number;
  tab: AdminTab | undefined;
  section: AdminSection;
  go: Go;
  account: string;
  siteTitle: string;
  inboxBadge: number;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { t, dir, language, setLanguage } = useAdminCopy();
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const meta = sectionMeta(section);
  const menuToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate: Go = (next, tab) => {
    setSheetOpen(false);
    go(next, tab);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="ea-console flex min-h-dvh w-full overflow-x-clip"
        dir={dir}
      >
        <aside
          className={cn(
            "ea-console-rail sticky top-0 hidden h-dvh shrink-0 flex-col transition-[width] duration-200 motion-reduce:transition-none lg:flex",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div
            className={cn(
              "ea-rail-mast flex items-center gap-2 px-3",
              collapsed && "justify-center",
            )}
          >
            {!collapsed ? (
              <>
                <span aria-hidden="true" className="ea-rail-mark">
                  <CircuitBoard size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" dir="auto">
                    {siteTitle}
                  </p>
                  <p className="truncate text-[11px] ea-rail-caption">
                    {t("consoleTitle")}
                  </p>
                </div>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={collapsed ? t("expandMenu") : t("collapseMenu")}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen
                  className="size-4 rtl:-scale-x-100"
                  aria-hidden="true"
                />
              ) : (
                <PanelLeftClose
                  className="size-4 rtl:-scale-x-100"
                  aria-hidden="true"
                />
              )}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavList
              section={section}
              go={navigate}
              badge={inboxBadge}
              liveBadge={liveBadge}
              collapsed={collapsed}
            />
          </div>
          <button
            className="ea-rail-account"
            type="button"
            onClick={() => navigate("security", "account")}
            title={account}
            aria-label={t("tabAccount")}
          >
            <UserRound size={17} aria-hidden="true" />
            {!collapsed && (
              <span>
                <strong>{t("tabAccount")}</strong>
                <bdi dir="ltr">{account}</bdi>
              </span>
            )}
          </button>
        </aside>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side={dir === "rtl" ? "right" : "left"}
            className="ea-console-sheet w-72 overflow-y-auto p-0"
            closeLabel={t("close")}
            dir={dir}
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuToggle.current?.focus();
            }}
          >
            <SheetTitle className="ea-sheet-title border-b border-border py-4 ps-5 pe-14 text-sm">
              {t("consoleTitle")}
            </SheetTitle>
            <NavList
              section={section}
              go={navigate}
              badge={inboxBadge}
              liveBadge={liveBadge}
              collapsed={false}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ea-console-bar sticky top-0 z-20 flex items-center gap-2 px-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              ref={menuToggle}
              aria-expanded={sheetOpen}
              aria-label={t("openMenu")}
              onClick={() => setSheetOpen(true)}
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
              <span>{t(meta.label)}</span>
              {tab && (
                <span className="ea-console-crumb">
                  <i aria-hidden="true">/</i>
                  {t(TAB_LABELS[tab])}
                </span>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 text-muted-foreground sm:inline-flex"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" aria-hidden="true" />
              <span>{t("commandOpen")}</span>
              <kbd
                className="rounded border border-border px-1 text-[10px]"
                dir="ltr"
              >
                Ctrl K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label={t("commandOpen")}
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("switchLanguageLabel")}
              lang={language === "ar" ? "en" : "ar"}
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            >
              <Languages className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t("switchLanguage")}</span>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a
                href="/"
                target="_blank"
                rel="noopener"
                aria-label={t("viewSite")}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                <span className="hidden md:inline">{t("viewSite")}</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t("signOut")}</span>
            </Button>
          </header>
          <main className="ea-console-main mx-auto w-full min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          go={navigate}
        />
      </div>
    </TooltipProvider>
  );
}
