import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import type { Catalog } from "@/lib/catalog";
import type { AdminTab } from "@/lib/admin-sections";
import { SETTINGS_GROUPS, TAB_LABELS } from "@/lib/admin-sections";
import type { AdminCopyKey } from "@/lib/admin-copy";
import { PRODUCT_LAYOUT_META, themeMeta } from "@/lib/design-themes";
import { isEmptyCustomization } from "@/lib/theme-customization";
import { useAdminCopy } from "./ui";

export const SETTINGS_LAYOUTS = ["classic", "control", "command"] as const;
export type SettingsLayout = (typeof SETTINGS_LAYOUTS)[number];
const STORAGE_KEY = "e20e-admin-settings-layout";

export const SETTINGS_LAYOUT_NAMES: Record<SettingsLayout, AdminCopyKey> = {
  classic: "slLayoutClassic",
  control: "slLayoutControl",
  command: "slLayoutCommand",
};

function isLayout(v: unknown): v is SettingsLayout {
  return (
    typeof v === "string" && (SETTINGS_LAYOUTS as readonly string[]).includes(v)
  );
}

/** Saved layout (per browser) plus an unsaved preview. */
export function useSettingsLayout() {
  const [saved, setSaved] = useState<SettingsLayout>("classic");
  const [preview, setPreview] = useState<SettingsLayout | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (isLayout(v)) setSaved(v);
    } catch {
      // Storage can be unavailable (private mode); the layout then lasts for this visit.
    }
  }, []);
  const apply = (v: SettingsLayout) => {
    setSaved(v);
    setPreview(null);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // Storage can be unavailable (private mode); the layout then lasts for this visit.
    }
  };
  return { saved, preview, active: preview ?? saved, setPreview, apply };
}

export function LayoutSwitcher({
  state,
}: {
  state: ReturnType<typeof useSettingsLayout>;
}) {
  const { t } = useAdminCopy();
  return (
    <div className="sl-switch">
      <div role="radiogroup" aria-label={t("sl1")}>
        {SETTINGS_LAYOUTS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={state.active === id}
            data-saved={state.saved === id ? "" : undefined}
            onClick={() =>
              id === state.saved ? state.setPreview(null) : state.setPreview(id)
            }
          >
            {t(SETTINGS_LAYOUT_NAMES[id])}
          </button>
        ))}
      </div>
      {state.preview && (
        <div className="sl-preview" role="status">
          <Eye size={15} aria-hidden="true" />
          <span>
            {t("sl2")}
            <b>{t(SETTINGS_LAYOUT_NAMES[state.preview])}</b>
          </span>
          <button
            type="button"
            data-primary=""
            onClick={() => state.apply(state.preview!)}
          >
            {t("sl3")}
          </button>
          <button type="button" onClick={() => state.setPreview(null)}>
            {t("sl4")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- live values for each settings tab ---------- */

type Tone = "ok" | "warn" | "info";
type Summary = { value: string; tone: Tone };

export function tabSummary(
  tab: AdminTab,
  catalog: Catalog,
  t: (key: AdminCopyKey) => string,
): Summary | null {
  const s = catalog.settings;
  const flags = Object.values(s.featureFlags ?? {});
  switch (tab) {
    case "general":
      return {
        value: s.displayTitle || t("sl5"),
        tone: s.displayTitle ? "ok" : "warn",
      };
    case "navigation": {
      const items = s.navigationItems ?? [];
      const hidden = items.filter((i) => i.hidden).length;
      return {
        value: t("slNavCount")
          .replace("{n}", String(items.length))
          .replace("{h}", String(hidden)),
        tone: "ok",
      };
    }
    case "appearance":
      return {
        value: themeMeta(s.designTheme.theme).name[
          t("slLang") === "ar" ? "ar" : "en"
        ],
        tone: "ok",
      };
    case "customize": {
      const n = Object.values(s.themeCustomizations ?? {}).filter(
        (c) => !isEmptyCustomization(c),
      ).length;
      return {
        value: n ? t("slCustomized").replace("{n}", String(n)) : t("sl6"),
        tone: "info",
      };
    }
    case "features":
      return {
        value: `${flags.filter(Boolean).length} / ${flags.length}`,
        tone: flags.every(Boolean) ? "ok" : "info",
      };
    case "terms":
      return s.terms?.updatedAt
        ? { value: t("sl7") + s.terms.updatedAt.slice(0, 10), tone: "ok" }
        : { value: t("sl8"), tone: "info" };
    case "contact":
      return s.contactInfo?.email
        ? { value: s.contactInfo.email, tone: "ok" }
        : { value: t("sl9"), tone: "warn" };
    case "archy":
      return {
        value: s.archyGreeting?.voiceOn ? t("sl10") : t("sl11"),
        tone: "ok",
      };
    default:
      return null;
  }
}

function identityScore(catalog: Catalog): number {
  const s = catalog.settings;
  return [s.displayTitle, s.description, s.logoUrl, s.footerText].filter((v) =>
    Boolean(v?.trim()),
  ).length;
}

const ZONE_ACCENTS = ["#3ee39a", "#7fd1ff", "#e6b25c", "#c7b8ff"] as const;

/* ---------- A · Control center (overview) ---------- */

export function ControlCenter({
  catalog,
  icons,
  descriptions,
  open,
}: {
  catalog: Catalog;
  icons: Record<string, ComponentType<{ size?: number }>>;
  descriptions: Partial<Record<AdminTab, AdminCopyKey>>;
  open: (id: AdminTab, focus?: string) => void;
}) {
  const { t, language, dir } = useAdminCopy();
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  const s = catalog.settings;
  const flags = Object.values(s.featureFlags ?? {});
  const id = identityScore(catalog);
  const tiles = [
    {
      t: t("sl12"),
      v: `${id}/4`,
      d: t("sl13"),
      tone: id === 4 ? "dark" : "warn",
      go: "general" as AdminTab,
    },
    {
      t: t("sl14"),
      v: `${flags.filter(Boolean).length}/${flags.length}`,
      d: t("sl15"),
      tone: "light",
      go: "features" as AdminTab,
    },
    {
      t: t("sl16"),
      v: themeMeta(s.designTheme.theme).name[language],
      d: t("sl17"),
      tone: "light",
      go: "appearance" as AdminTab,
      small: true,
    },
    {
      t: t("sl18"),
      v: PRODUCT_LAYOUT_META[s.designTheme.productLayout ?? "classic"].name[
        language
      ],
      d: t("sl19"),
      tone: "light",
      go: "appearance" as AdminTab,
      small: true,
    },
  ];
  return (
    <div className="sl-control">
      <section className="sl-tiles" aria-label={t("sl20")}>
        {tiles.map((tile) => (
          <button
            key={tile.t}
            type="button"
            data-tone={tile.tone}
            onClick={() => open(tile.go)}
          >
            <span>{tile.t}</span>
            <strong data-small={tile.small ? "" : undefined}>{tile.v}</strong>
            <small>{tile.d}</small>
          </button>
        ))}
      </section>
      <section className="sl-quick" aria-label={t("quickSettingsTitle")}>
        <b>{t("quickSettingsTitle")}</b>
        <button type="button" onClick={() => open("navigation")}>
          {t("quickSettingsMenu")}
        </button>
        <button type="button" onClick={() => open("ai", "archy-test-input")}>
          {t("quickSettingsChat")}
        </button>
        <button type="button" onClick={() => open("contact", "c-email")}>
          {t("quickSettingsEmail")}
        </button>
        <button
          type="button"
          data-warn=""
          onClick={() => open("notifications")}
        >
          {t("sl21")}
        </button>
      </section>
      {SETTINGS_GROUPS.map((g, gi) => (
        <section
          key={g.label}
          className="sl-zone"
          style={{ ["--zone" as string]: ZONE_ACCENTS[gi] }}
        >
          <header>
            <span dir="ltr">{String.fromCharCode(65 + gi)}</span>
            <h2>{t(g.label)}</h2>
            <small>
              {t("slSections").replace("{n}", String(g.tabs.length))}
            </small>
          </header>
          <div>
            {g.tabs.map((tab) => {
              const Icon = icons[tab];
              const sum = tabSummary(tab, catalog, t);
              const desc = descriptions[tab];
              return (
                <button key={tab} type="button" onClick={() => open(tab)}>
                  <span className="sl-item-head">
                    {Icon ? <Icon size={17} /> : null}
                    <b>{t(TAB_LABELS[tab])}</b>
                    <Next size={16} />
                  </span>
                  {desc && <small>{t(desc)}</small>}
                  {sum && (
                    <em data-tone={sum.tone}>
                      <i aria-hidden="true" />
                      {sum.value}
                    </em>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- B · Command console (overview + editor) ---------- */

export function CommandConsole({
  catalog,
  current,
  icons,
  open,
  editor,
}: {
  catalog: Catalog;
  current: AdminTab | "overview";
  icons: Record<string, ComponentType<{ size?: number }>>;
  open: (id: AdminTab, focus?: string) => void;
  editor: ReactNode;
}) {
  const { t } = useAdminCopy();
  const owning = SETTINGS_GROUPS.findIndex((g) =>
    (g.tabs as readonly string[]).includes(current),
  );
  const [zone, setZone] = useState(Math.max(0, owning));
  useEffect(() => {
    if (owning >= 0) setZone(owning);
  }, [owning]);
  const group = SETTINGS_GROUPS[zone]!;
  return (
    <div className="sl-command">
      <nav className="sl-zones" aria-label={t("sl22")}>
        {SETTINGS_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            aria-pressed={zone === i}
            style={{ ["--zone" as string]: ZONE_ACCENTS[i] }}
            onClick={() => setZone(i)}
          >
            <i aria-hidden="true" />
            <span>{t(g.label)}</span>
            <small dir="ltr">{g.tabs.length}</small>
          </button>
        ))}
      </nav>
      <nav className="sl-items" aria-label={t(group.label)}>
        <small>{t(group.label)}</small>
        {group.tabs.map((tab) => {
          const Icon = icons[tab];
          const sum = tabSummary(tab, catalog, t);
          return (
            <button
              key={tab}
              type="button"
              aria-current={current === tab ? "page" : undefined}
              onClick={() => open(tab)}
            >
              <span>
                {Icon ? <Icon size={16} /> : null}
                <b>{t(TAB_LABELS[tab])}</b>
              </span>
              {sum && <small data-tone={sum.tone}>{sum.value}</small>}
            </button>
          );
        })}
      </nav>
      <section className="sl-editor" aria-live="polite">
        {current === "overview" ? (
          <div className="sl-empty">
            <strong dir="ltr">&gt; settings</strong>
            <p>{t("sl23")}</p>
          </div>
        ) : (
          editor
        )}
      </section>
    </div>
  );
}
