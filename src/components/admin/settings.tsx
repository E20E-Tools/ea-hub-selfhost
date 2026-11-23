import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AudioLines,
  Bell,
  Bot,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Contact,
  FileText,
  Fingerprint,
  History,
  LayoutGrid,
  MessageSquareQuote,
  MonitorCog,
  Palette,
  PanelsTopLeft,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import "./settings-workspace.css";
import { searchSettings } from "@/lib/settings-search.shared";
import { ApplicationHealth, SettingsHistory, RetentionManagement } from "./operations";
import { JourneyOverview } from "./journey";
import type { AdminTab } from "@/lib/admin-sections";
import { SETTINGS_GROUPS, TAB_LABELS } from "@/lib/admin-sections";

import type { AdminCopyKey } from "@/lib/admin-copy";
import type { Catalog } from "@/lib/catalog";
import type { DesignThemeId } from "@/lib/design-themes";

import { AiSettings } from "./settings-ai";
import { ArchySettings } from "./settings-archy";
import { AppearanceSettings } from "./settings-appearance";
import { ContactSettings } from "./settings-contact";
import { CustomizeSettings } from "./settings-customize";
import { TermsSettings } from "./settings-terms";
import { FeatureSettings } from "./settings-features";
import { FeatureStatus } from "./settings-feature-status";
import { GeneralSettings } from "./settings-general";
import { NavigationSettings } from "./settings-navigation";
import { TestimonialsSettings } from "./settings-testimonials";
import { useAdminCopy } from "./ui";
import {
  CommandConsole,
  ControlCenter,
  LayoutSwitcher,
  useSettingsLayout,
} from "./settings-layouts";

const DESCRIPTIONS: Partial<Record<AdminTab, AdminCopyKey>> = {
  general: "tabGeneralDesc",
  terms: "termsHint",
  notifications: "notificationsDesc",
  health: "opsHealthHint",
  history: "opsHistoryHint",
  retention: "opsRetentionHint",
  journey: "journeyMetricsHint",
  appearance: "tabAppearanceDesc",
  customize: "tabCustomizeDesc",
  testimonials: "tabTestimonialsDesc",
  navigation: "tabNavigationDesc",
  features: "tabFeaturesDesc",
  status: "tabFeatureStatusDesc",
  contact: "settingsPublicInfo",
  ai: "tabAiDesc",
  archy: "tabArchyDesc",
};

const groupIcons = [Fingerprint, PanelsTopLeft, AudioLines, MonitorCog] as const;
const icons = {
  general: Fingerprint,
  appearance: Palette,
  customize: SlidersHorizontal,
  navigation: Compass,
  testimonials: MessageSquareQuote,
  features: Settings2,
  status: ShieldCheck,
  terms: FileText,
  contact: Contact,
  notifications: Bell,
  ai: Sparkles,
  archy: Bot,
  health: MonitorCog,
  history: History,
  retention: Trash2,
  journey: ChartNoAxesCombined,
};
type WorkspaceTab = keyof typeof icons;

export function SettingsSection({
  catalog,
  tab,
  onTab,
}: {
  catalog: Catalog;
  tab: AdminTab | undefined;
  onTab: (tab: AdminTab) => void;
}) {
  const { t, dir, language } = useAdminCopy();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { focus?: string };
  const [query, setQuery] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const resultsList = useRef<HTMLUListElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [customizeTheme, setCustomizeTheme] = useState<DesignThemeId>();
  const layout = useSettingsLayout();
  const current = tab && Object.hasOwn(icons, tab) ? (tab as WorkspaceTab) : "overview";
  const group = SETTINGS_GROUPS.find((g) => (g.tabs as readonly string[]).includes(current));
  const matches = searchSettings(query);
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const searching = Boolean(query.trim());

  useEffect(() => {
    setQuery("");
  }, [current, search.focus]);

  useEffect(() => {
    const container = body.current;
    const target = search.focus;
    if (!container || !target || searching) return;
    let highlighted: HTMLElement | undefined;
    function focusField() {
      const node = document.getElementById(target!);
      if (!node || !container?.contains(node)) return false;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "center", behavior: "instant" });
      node.classList.add("settings-field-focus");
      highlighted = node;
      return true;
    }
    const observer = new MutationObserver(() => {
      if (focusField()) observer.disconnect();
    });
    if (!focusField()) observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      highlighted?.classList.remove("settings-field-focus");
    };
  }, [current, search.focus, searching]);
  useEffect(() => {
    if (current === "contact" && search.focus?.startsWith("n-")) {
      void navigate({
        replace: true,
        to: "/admin",
        search: {
          section: "settings",
          tab: "notifications",
          focus: search.focus,
        },
      });
    }
  }, [current, navigate, search.focus]);
  const open = (id: AdminTab, focus?: string) => {
    if (current === id && (search.focus === focus || !focus)) {
      setQuery("");
      requestAnimationFrame(() => focus && document.getElementById(focus)?.focus());
    } else if (focus) {
      void navigate({
        to: "/admin",
        search: { section: "settings", tab: id, focus },
      });
    } else {
      onTab(id);
    }
  };
  const openCustomize = (theme: DesignThemeId) => {
    setCustomizeTheme(theme);
    open("customize");
  };
  const Icon = current === "overview" ? LayoutGrid : icons[current];
  const formBody = (
          <div className="settings-form-body" ref={body}>
            {current === "general" ? <GeneralSettings catalog={catalog} /> : null}
            {current === "appearance" ? (
              <AppearanceSettings catalog={catalog} onCustomize={openCustomize} />
            ) : null}
            {current === "customize" && (
              <CustomizeSettings catalog={catalog} initialTheme={customizeTheme} />
            )}
            {current === "terms" && <TermsSettings catalog={catalog} />}
            {current === "notifications" && (
              <ContactSettings key="notifications" catalog={catalog} mode="notifications" />
            )}
            {current === "testimonials" ? <TestimonialsSettings /> : null}
            {current === "navigation" ? <NavigationSettings catalog={catalog} /> : null}
            {current === "features" ? <FeatureSettings catalog={catalog} /> : null}
            {current === "status" ? (
              <FeatureStatus
                catalog={catalog}
                onManage={(key) => open("features", "feature-" + key)}
              />
            ) : null}
            {current === "contact" ? (
              <ContactSettings key="public" catalog={catalog} mode="public" />
            ) : null}
            {current === "ai" ? <AiSettings /> : null}
            {current === "archy" ? <ArchySettings catalog={catalog} /> : null}
            {current === "health" ? <ApplicationHealth /> : null}
            {current === "history" ? <SettingsHistory /> : null}
            {current === "retention" ? <RetentionManagement /> : null}
            {current === "journey" ? <JourneyOverview /> : null}
          </div>
  );
  return (
    <div className="settings-workspace">
      <header className="settings-head">
        <div className="settings-path">
          <LayoutGrid size={16} aria-hidden="true" />
          {current === "overview" ? (
            <span>{t("settingsDirectory")}</span>
          ) : (
            <>
              <button type="button" onClick={() => open("overview")}>
                {t("settingsBack")}
              </button>
              <Next size={14} />
              <span>{group && t(group.label)}</span>
            </>
          )}
        </div>
        <div className="settings-heading-row">
          <div>
            <h1>{current === "overview" ? t("navSettings") : t(TAB_LABELS[current])}</h1>
            <p>{current === "overview" ? t("navSettingsDesc") : t(DESCRIPTIONS[current]!)}</p>
          </div>
          <div className="settings-finder" role="search">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              aria-label={t("opsSettingsSearch")}
              placeholder={t("settingsLookup")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && matches.length) {
                  e.preventDefault();
                  resultsList.current?.querySelector("button")?.focus();
                }
                const first = matches[0];
                if (e.key === "Enter" && first && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  open(first.tab, first.control?.replace(/-ar$/, "-" + language));
                }
                if (e.key === "Escape") setQuery("");
              }}
            />
            {query && (
              <button
                type="button"
                aria-label={t("settingsSearchClear")}
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <LayoutSwitcher state={layout} />
      </header>
      {searching && (
        <section className="settings-results" aria-label={t("opsSettingsSearch")}>
          {matches.length > 0 && <p role="status">{t("searchSettingsResults")} · {matches.length}</p>}
          <ul ref={resultsList} onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              searchInput.current?.focus();
            }
          }}>
            {matches.map((m) => (
              <li key={m.tab + "-" + (m.control ?? "")}>
                <button
                  type="button"
                  onClick={() => open(m.tab, m.control?.replace(/-ar$/, "-" + language))}
                >
                  <span>
                    {t(m.label)}
                    {m.control && <small>{t(TAB_LABELS[m.tab])}</small>}
                  </span>
                  <Next size={17} />
                </button>
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">{t("opsSearchEmpty")}</p>}
        </section>
      )}
      {current === "overview" && !searching && layout.active === "classic" && (
        <section className="settings-quick" aria-labelledby="settings-quick-title">
          <h2 id="settings-quick-title">{t("quickSettingsTitle")}</h2>
          <div>
            <button type="button" onClick={() => open("navigation")}>{t("quickSettingsMenu")}<Next size={16} /></button>
            <button type="button" onClick={() => open("ai", "archy-test-input")}>{t("quickSettingsChat")}<Next size={16} /></button>
            <button type="button" onClick={() => open("contact", "c-email")}>{t("quickSettingsEmail")}<Next size={16} /></button>
          </div>
        </section>
      )}
      {layout.active === "command" && !searching ? (
        <CommandConsole
          catalog={catalog}
          current={current}
          icons={icons}
          open={open}
          editor={formBody}
        />
      ) : current === "overview" && layout.active === "control" ? (
        <div hidden={searching}>
          <ControlCenter catalog={catalog} icons={icons} descriptions={DESCRIPTIONS} open={open} />
        </div>
      ) : current === "overview" ? (
        <div className="settings-directory" hidden={searching}>
          {SETTINGS_GROUPS.map((g, i) => {
            const GroupIcon = groupIcons[i] ?? Workflow;
            return (
              <section key={g.label} className="settings-domain">
                <header>
                  <span>
                    <GroupIcon size={23} strokeWidth={1.7} />
                  </span>
                  <h2>{t(g.label)}</h2>
                </header>
                <ul>
                  {g.tabs.map((id) => {
                    const TileIcon = icons[id];
                    return (
                      <li key={id}>
                        <button type="button" onClick={() => open(id)}>
                          <TileIcon size={16} />
                          <span>{t(TAB_LABELS[id])}
                            {DESCRIPTIONS[id] && <small>{t(DESCRIPTIONS[id]!)}</small>}
                          </span>
                          <Next size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="settings-editor" hidden={searching}>
          <nav className="settings-neighbors" aria-label={t("settingsNav")}>
            <span className="settings-nav-icon">
              <Icon size={18} />
            </span>
            <div>
              {group?.tabs.map((id) => (
                <button
                  type="button"
                  key={id}
                  aria-current={id === current ? "page" : undefined}
                  onClick={() => open(id)}
                >
                  {t(TAB_LABELS[id])}
                </button>
              ))}
            </div>
            <label className="settings-jump">
              <select
                value={current}
                aria-label={t("settingsNav")}
                onChange={(e) => open(e.target.value as WorkspaceTab)}
              >
                {SETTINGS_GROUPS.map((g) => (
                  <optgroup label={t(g.label)} key={g.label}>
                    {g.tabs.map((id) => (
                      <option value={id} key={id}>
                        {t(TAB_LABELS[id])}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </nav>
          {formBody}
        </div>
      )}
    </div>
  );
}
