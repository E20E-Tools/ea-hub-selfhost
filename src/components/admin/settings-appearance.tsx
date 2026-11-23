import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Palette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ExternalLink } from "lucide-react";
import { THEME_THUMBS } from "@/themes/thumbs";
import { previewUrl } from "@/themes/preview";
import { saveAppearanceSettings } from "@/lib/admin.functions";
import {
  colorTokens,
  defaultSettings,
  bundledFonts,
  fontsHref,
  pickerFonts,
  siteFontStack,
  isValidColor,
  themeCss,
  type Catalog,
  type SiteSettings,
} from "@/lib/catalog";
import { isEmptyCustomization } from "@/lib/theme-customization";
import { ensureFontStylesheet, useFontStylesheet } from "@/themes/use-theme-fonts";
import {
  DESIGN_THEMES,
  PRODUCT_LAYOUTS,
  PRODUCT_LAYOUT_META,
  themeFontsHref,
  THEME_FONTS_HREF,
  type DesignThemeId,
  type AnimationIntensity,
  type DesignThemeSetting,
} from "@/lib/design-themes";
import type { AdminCopyKey } from "@/lib/admin-copy";
import { Card, SaveBar, SettingRow, selectClass, useAdminCopy, useAssetUrl, useDraft } from "./ui";

type Appearance = {
  designTheme: DesignThemeSetting;
  headingFont: string;
  bodyFont: string;
  colors: Record<string, string>;
  imageFit: SiteSettings["imageFit"];
  imageBrightness: number;
  imageContrast: number;
  imageSaturation: number;
  imageSharpen: boolean;
  motionEnabled: boolean;
  motionSpeed: number;
  motionDirection: SiteSettings["motionDirection"];
};

const LEVELS: AnimationIntensity[] = ["low", "medium", "high"];
const SPEEDS = [0.5, 0.75, 1, 1.5, 2];
const TOKEN_LABEL: Record<string, AdminCopyKey> = {
  "--background": "color_background",
  "--foreground": "color_foreground",
  "--primary": "color_primary",
  "--primary-foreground": "color_primaryForeground",
  "--muted-foreground": "color_mutedForeground",
  "--card": "color_card",
  "--accent": "color_accent",
  "--library-rule": "color_rule",
};

function fromSettings(s: SiteSettings): Appearance {
  return {
    designTheme: s.designTheme,
    headingFont: s.headingFont,
    bodyFont: s.bodyFont,
    colors: { ...s.colors },
    imageFit: s.imageFit,
    imageBrightness: s.imageBrightness,
    imageContrast: s.imageContrast,
    imageSaturation: s.imageSaturation,
    imageSharpen: s.imageSharpen,
    motionEnabled: s.motionEnabled,
    motionSpeed: s.motionSpeed,
    motionDirection: s.motionDirection,
  };
}

/** Writes theme attributes on <html>; the backdrop and every token follow them. */
function applyTheme(s: DesignThemeSetting) {
  const el = document.documentElement;
  // The picked design's fonts load only when an admin previews it here.
  ensureFontStylesheet(themeFontsHref(s.theme));
  el.classList.add("theme-transition");
  el.dataset["designTheme"] = s.theme;
  el.dataset["motion"] = s.animations ? "on" : "off";
  el.dataset["motionIntensity"] = s.intensity;
  window.setTimeout(() => el.classList.remove("theme-transition"), 450);
}

export function toHex(value: string, fallback = "#808080"): string {
  const raw = (value ?? "").trim();
  if (!raw || !isValidColor(raw) || typeof document === "undefined") return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = Array.from(ctx.getImageData(0, 0, 1, 1).data);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function Percent({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label}>
      <div className="flex items-center gap-3">
        <Slider
          min={0.5}
          max={1.5}
          step={0.05}
          value={[value]}
          thumbLabel={label}
          onValueChange={([v]) => onChange(v ?? 1)}
        />
        <span
          className="w-12 shrink-0 text-end text-sm tabular-nums text-muted-foreground"
          dir="ltr"
        >
          {Math.round(value * 100)}%
        </span>
      </div>
    </SettingRow>
  );
}

export function AppearanceSettings({
  catalog,
  onCustomize,
}: {
  catalog: Catalog;
  /** Opens Design customisation for one design. */
  onCustomize?: (theme: DesignThemeId) => void;
}) {
  const { t, language, dir } = useAdminCopy();
  const [localPreview, setLocalPreview] = useState(false);
  useEffect(() => {
    setLocalPreview(["127.0.0.1", "localhost"].includes(window.location.hostname));
  }, []);
  // The design chooser previews every design, so its fonts load only while it is open.
  useFontStylesheet(THEME_FONTS_HREF);
  const saved = fromSettings(catalog.settings);
  const form = useDraft<Appearance>(saved);
  const draft = form.value ?? saved;
  useFontStylesheet(fontsHref(draft.headingFont, draft.bodyFont));
  const set = (patch: Partial<Appearance>) =>
    form.setValue((current) => ({ ...current, ...patch }));
  const [busy, setBusy] = useState(false);
  const [computed, setComputed] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const savedTheme = useRef(catalog.settings.designTheme);
  savedTheme.current = catalog.settings.designTheme;
  const sample = catalog.products.find((p) => p.image) ?? catalog.products[0];
  const sampleImage = useAssetUrl(sample?.image ?? "");

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const values: Record<string, string> = {};
    for (const { token } of colorTokens) values[token] = styles.getPropertyValue(token).trim();
    setComputed(values);
  }, [draft.designTheme.theme]);

  // Live theme preview; restore the saved theme when leaving without saving.
  const themeKey = JSON.stringify(draft.designTheme);
  useEffect(() => {
    applyTheme(draft.designTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);
  useEffect(() => () => applyTheme(savedTheme.current), []);

  const save = async () => {
    setBusy(true);
    try {
      const colors = Object.fromEntries(
        Object.entries(draft.colors)
          .filter(([, value]) => isValidColor(value))
          .map(([k, v]) => [k, v.trim()]),
      );
      const result = await saveAppearanceSettings({ data: { ...draft, colors } });
      if (!result.ok) return void toast.error(t(result.message));
      savedTheme.current = draft.designTheme;
      form.reset({ ...draft, colors });
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const filter = `brightness(${draft.imageBrightness}) contrast(${draft.imageContrast}) saturate(${draft.imageSaturation})`;

  return (
    <div className="grid gap-5">
      {form.dirty ? <style>{themeCss({ ...catalog.settings, ...draft })}</style> : null}
      {localPreview && (
        <aside className="settings-runtime-note">
          <Palette size={20} aria-hidden="true" />
          <div>
            <p>{t("settingsStudioScope")}</p>
            <a
              className="font-semibold underline underline-offset-4"
              href="/design-lab"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("settingsStudioDirections")}
            </a>
          </div>
        </aside>
      )}

      <Card
        title={t("themeCard")}
        description={t("themeCardDesc")}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              set({ designTheme: { theme: "classic", animations: true, intensity: "medium" } })
            }
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t("resetClassic")}
          </Button>
        }
      >
        <div
          className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3"
          role="radiogroup"
          aria-label={t("themeCard")}
        >
          {DESIGN_THEMES.map((theme) => {
            const selected = draft.designTheme.theme === theme.id;
            const Thumb = THEME_THUMBS[theme.id];
            return (
              <div key={theme.id} className="theme-pick" data-selected={selected ? "" : undefined}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={theme.name[language]}
                  tabIndex={selected ? 0 : -1}
                  className="theme-pick-main"
                  onKeyDown={(event) => {
                    const backwards =
                      event.key === "ArrowUp" ||
                      event.key === (dir === "rtl" ? "ArrowRight" : "ArrowLeft");
                    const forwards =
                      event.key === "ArrowDown" ||
                      event.key === (dir === "rtl" ? "ArrowLeft" : "ArrowRight");
                    if (!backwards && !forwards && event.key !== "Home" && event.key !== "End")
                      return;
                    event.preventDefault();
                    const count = DESIGN_THEMES.length;
                    const index = DESIGN_THEMES.findIndex((item) => item.id === theme.id);
                    const nextIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? count - 1
                          : (index + (backwards ? -1 : 1) + count) % count;
                    const next = DESIGN_THEMES[nextIndex];
                    if (!next) return;
                    set({ designTheme: { ...draft.designTheme, theme: next.id } });
                    event.currentTarget
                      .closest('[role="radiogroup"]')
                      ?.querySelectorAll<HTMLElement>('[role="radio"]')
                      [nextIndex]?.focus();
                  }}
                  onClick={() => set({ designTheme: { ...draft.designTheme, theme: theme.id } })}
                >
                  <span className="theme-pick-thumb">
                    <Thumb />
                  </span>
                  <span className="theme-pick-body">
                    <span className="flex min-h-6 flex-wrap items-center gap-1.5">
                      <strong className="text-sm">{theme.name[language]}</strong>
                      {catalog.settings.designTheme.theme === theme.id ? (
                        <Badge variant="secondary">{t("themeLive")}</Badge>
                      ) : null}
                      {!isEmptyCustomization(catalog.settings.themeCustomizations?.[theme.id]) ? (
                        <Badge variant="outline">{t("customizeEdited")}</Badge>
                      ) : null}
                      {selected ? (
                        <Badge>
                          <Check className="size-3" aria-hidden="true" />
                          {t("themeSelected")}
                        </Badge>
                      ) : null}
                    </span>
                    <small
                      className="line-clamp-3 min-h-12 text-xs text-muted-foreground"
                      title={theme.description[language]}
                    >
                      {theme.description[language]}
                    </small>
                  </span>
                </button>
                <div className="theme-pick-foot">
                  <a
                    href={previewUrl(theme.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    {t("themePreviewHome")}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  {onCustomize ? (
                    <button
                      type="button"
                      onClick={() => onCustomize(theme.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      <Palette className="size-3" aria-hidden="true" />
                      {t("customizeThisDesign")}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <SettingRow label={t("animations")} hint={t("animationsHint")} htmlFor="theme-anim">
            <Switch
              id="theme-anim"
              checked={draft.designTheme.animations}
              onCheckedChange={(v) => set({ designTheme: { ...draft.designTheme, animations: v } })}
            />
          </SettingRow>
          <SettingRow label={t("intensity")}>
            <div className="grid gap-1">
              <Slider
                min={0}
                max={2}
                step={1}
                dir={dir}
                disabled={!draft.designTheme.animations}
                value={[LEVELS.indexOf(draft.designTheme.intensity)]}
                thumbLabel={t("intensity")}
                onValueChange={([v]) =>
                  set({
                    designTheme: { ...draft.designTheme, intensity: LEVELS[v ?? 1] ?? "medium" },
                  })
                }
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {LEVELS.map((l) => (
                  <span key={l}>{t(`intensity_${l}`)}</span>
                ))}
              </div>
            </div>
          </SettingRow>
        </div>
      </Card>

      <Card
        title={t("sl24")}
        description={
          t("sl25")
        }
      >
        <div
          className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label={t("sl26")}
        >
          {PRODUCT_LAYOUTS.map((id) => {
            const meta = PRODUCT_LAYOUT_META[id];
            const current = draft.designTheme.productLayout ?? "classic";
            const selected = current === id;
            const live = (catalog.settings.designTheme.productLayout ?? "classic") === id;
            const sample =
              catalog.products.find((p) => !p.comingSoon)?.id ?? catalog.products[0]?.id ?? "";
            return (
              <div key={id} className="theme-pick" data-selected={selected ? "" : undefined}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="theme-pick-main"
                  onClick={() => {
                    const { productLayout: _previous, ...rest } = draft.designTheme;
                    set({ designTheme: id === "classic" ? rest : { ...rest, productLayout: id } });
                  }}
                >
                  <span className="theme-pick-thumb pl-thumb" data-layout={id} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="theme-pick-body">
                    <span className="flex min-h-6 flex-wrap items-center gap-1.5">
                      <strong className="text-sm">{meta.name[language]}</strong>
                      {live ? <Badge variant="secondary">{t("themeLive")}</Badge> : null}
                      {selected ? (
                        <Badge>
                          <Check className="size-3" aria-hidden="true" />
                          {t("themeSelected")}
                        </Badge>
                      ) : null}
                    </span>
                    <small className="line-clamp-3 min-h-12 text-xs text-muted-foreground">
                      {meta.description[language]}
                    </small>
                  </span>
                </button>
                {sample ? (
                  <div className="theme-pick-foot">
                    <a
                      href={`/product/${encodeURIComponent(sample)}?layout=${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      {t("sl27")}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={t("brandCard")}
        description={t("brandCardDesc")}
        actions={
          <Button variant="ghost" size="sm" onClick={() => set({ colors: {} })}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t("resetColors")}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {(["headingFont", "bodyFont"] as const).map((key) => (
            <label key={key} className="grid gap-1.5 text-sm font-medium">
              {t(key)}
              <select
                className={selectClass}
                value={draft[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              >
                {pickerFonts(localPreview, saved[key]).map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.id === defaultSettings[key] ? t("studioProfileFont") : font.label}
                    {localPreview &&
                    font.id !== defaultSettings[key] &&
                    !bundledFonts.some((id) => id === font.id)
                      ? ` — ${t("studioOnlineFont")}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {colorTokens.map(({ token }) => {
            const name = t(TOKEN_LABEL[token] ?? "color_accent");
            const value = draft.colors[token] ?? computed[token] ?? "";
            return (
              <div key={token} className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={name}
                  className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                  value={toHex(value)}
                  onChange={(e) => set({ colors: { ...draft.colors, [token]: e.target.value } })}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">{name}</p>
                  <Input
                    dir="ltr"
                    className="h-8 font-mono text-xs"
                    aria-label={t("colorValue", { name })}
                    value={value}
                    onChange={(e) => set({ colors: { ...draft.colors, [token]: e.target.value } })}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-lg border border-border bg-background p-4">
          <p
            className="text-lg font-semibold"
            style={{
              fontFamily:
                draft.headingFont === defaultSettings.headingFont
                  ? `var(--studio-sample-heading,${siteFontStack("Geist")})`
                  : siteFontStack(draft.headingFont),
            }}
          >
            {t("previewHeading")}
          </p>
          <p
            className="mt-1 text-sm text-muted-foreground"
            style={{
              fontFamily:
                draft.bodyFont === defaultSettings.bodyFont
                  ? siteFontStack("Geist")
                  : siteFontStack(draft.bodyFont),
            }}
          >
            {t("previewBody")}
          </p>
          <Button size="sm" className="mt-3">
            {t("previewButton")}
          </Button>
        </div>
      </Card>

      <Card title={t("imagesCard")} description={t("imagesCardDesc")}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <SettingRow label={t("imageFit")} htmlFor="img-fit">
              <select
                id="img-fit"
                className={selectClass}
                value={draft.imageFit}
                onChange={(e) => set({ imageFit: e.target.value as Appearance["imageFit"] })}
              >
                <option value="contain">{t("imageFit_contain")}</option>
                <option value="cover">{t("imageFit_cover")}</option>
              </select>
            </SettingRow>
            <Percent
              label={t("brightness")}
              value={draft.imageBrightness}
              onChange={(v) => set({ imageBrightness: v })}
            />
            <Percent
              label={t("contrast")}
              value={draft.imageContrast}
              onChange={(v) => set({ imageContrast: v })}
            />
            <Percent
              label={t("saturation")}
              value={draft.imageSaturation}
              onChange={(v) => set({ imageSaturation: v })}
            />
            <SettingRow label={t("sharpen")} hint={t("sharpenHint")} htmlFor="img-sharpen">
              <Switch
                id="img-sharpen"
                checked={draft.imageSharpen}
                onCheckedChange={(v) => set({ imageSharpen: v })}
              />
            </SettingRow>
            <SettingRow label={t("motionEnabled")} hint={t("animationsHint")} htmlFor="img-motion">
              <Switch
                id="img-motion"
                checked={draft.motionEnabled}
                onCheckedChange={(v) => set({ motionEnabled: v })}
              />
            </SettingRow>
            <SettingRow label={t("motionSpeed")} htmlFor="img-speed">
              <select
                id="img-speed"
                className={selectClass}
                disabled={!draft.motionEnabled}
                value={String(draft.motionSpeed)}
                onChange={(e) => set({ motionSpeed: Number(e.target.value) })}
              >
                {SPEEDS.map((speed) => (
                  <option key={speed} value={speed}>
                    {t(`speed_${String(speed).replace(".", "_")}`)}
                  </option>
                ))}
              </select>
            </SettingRow>
            <SettingRow label={t("motionDirection")} htmlFor="img-dir">
              <select
                id="img-dir"
                className={selectClass}
                disabled={!draft.motionEnabled}
                value={draft.motionDirection}
                onChange={(e) =>
                  set({ motionDirection: e.target.value as Appearance["motionDirection"] })
                }
              >
                {(["normal", "reverse", "alternate"] as const).map((d) => (
                  <option key={d} value={d}>
                    {t(`direction_${d}`)}
                  </option>
                ))}
              </select>
            </SettingRow>
          </div>
          <figure className="h-fit overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-20">
            <div className="flex aspect-[4/3] items-center justify-center bg-muted">
              {sampleImage ? (
                <img
                  src={sampleImage}
                  alt=""
                  className={`h-full w-full ${draft.imageFit === "cover" ? "object-cover" : "object-contain"} ${draft.motionEnabled ? "admin-motion-sample" : ""}`}
                  style={{
                    filter,
                    animationDuration: `${8 / draft.motionSpeed}s`,
                    animationDirection: draft.motionDirection,
                    imageRendering: draft.imageSharpen ? "crisp-edges" : undefined,
                  }}
                />
              ) : null}
            </div>
            <figcaption className="p-3">
              <strong className="block text-sm" dir="ltr">
                {sample?.name ?? t("sampleProduct")}
              </strong>
              <span className="text-xs text-muted-foreground">{t("sampleProductDesc")}</span>
            </figcaption>
          </figure>
        </div>
      </Card>
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={() => {
          form.discard();
          applyTheme(savedTheme.current);
        }}
      />
    </div>
  );
}
