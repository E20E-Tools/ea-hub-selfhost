import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, ImagePlus, Images, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { saveThemeCustomization } from "@/lib/admin.functions";
import type { AdminCopyKey } from "@/lib/admin-copy";
import type { Catalog } from "@/lib/catalog";
import {
  DESIGN_THEMES,
  DESIGN_THEME_IDS,
  themeFontsHref,
  type DesignThemeId,
} from "@/lib/design-themes";
import { useFontStylesheet } from "@/themes/use-theme-fonts";
import {
  CUSTOM_COLOR_TOKENS,
  SIZE_KEYS,
  SIZE_LIMITS,
  compactCustomization,
  emptyCustomization,
  isEmptyCustomization,
  isConsultantEmail,
  isSafeColor,
  isWhatsappNumber,
  normalizeWhatsapp,
  whatsappUrl,
  type CustomColorToken,
  type SizeKey,
  type ThemeCustomization,
} from "@/lib/theme-customization";
import { ABOUT_IMAGE_URL } from "@/lib/about-art";
import { previewUrl } from "@/themes/preview";
import { themedImage, themedLogo } from "@/themes/theme-art";
import { ImagePicker, useImageUpload } from "./media";
import { toHex } from "./settings-appearance";
import { Card, SaveBar, SettingRow, selectClass, useAdminCopy, useAssetUrl, useDraft } from "./ui";

type Drafts = Record<DesignThemeId, ThemeCustomization>;

const TOKEN_LABEL: Record<CustomColorToken, AdminCopyKey> = {
  "--background": "color_background",
  "--foreground": "color_foreground",
  "--primary": "color_primary",
  "--primary-foreground": "color_primaryForeground",
  "--muted-foreground": "color_mutedForeground",
  "--card": "color_card",
  "--accent": "color_accent",
  "--library-rule": "color_rule",
};
const SIZE_LABEL: Record<SizeKey, AdminCopyKey> = {
  logo: "size_logo",
  text: "size_text",
  cards: "size_cards",
  header: "size_header",
};
const SIZE_DEFAULT: Record<SizeKey, number> = {
  logo: 1,
  text: 1,
  cards: 1,
  header: 10,
};

function fromCatalog(catalog: Catalog): Drafts {
  const saved = catalog.settings.themeCustomizations ?? {};
  return Object.fromEntries(
    DESIGN_THEME_IDS.map((id) => [id, { ...emptyCustomization(), ...(saved[id] ?? {}) }]),
  ) as Drafts;
}

/** The design's own colours, read with the saved overrides switched off. */
function readDesignColors(theme: DesignThemeId): Record<string, string> {
  const el = document.documentElement;
  const previous = el.getAttribute("data-design-theme");
  el.setAttribute("data-theme-defaults", "");
  el.setAttribute("data-design-theme", theme);
  const styles = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const token of CUSTOM_COLOR_TOKENS) out[token] = styles.getPropertyValue(token).trim();
  el.removeAttribute("data-theme-defaults");
  if (previous === null) el.removeAttribute("data-design-theme");
  else el.setAttribute("data-design-theme", previous);
  return out;
}

function formatSize(key: SizeKey, value: number): string {
  return key === "header" ? `${Math.round(value)}px` : `${Math.round(value * 100)}%`;
}

export function ImageChoice({
  label,
  hint,
  path,
  fallbackUrl,
  fallbackText,
  folder,
  onChange,
}: {
  label: string;
  hint?: string;
  path: string;
  fallbackUrl: string;
  fallbackText: string;
  folder: "products" | "branding";
  onChange: (path: string) => void;
}) {
  const { t } = useAdminCopy();
  const signed = useAssetUrl(path);
  const upload = useImageUpload();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const shown = path ? signed : fallbackUrl;
  return (
    <SettingRow label={label} {...(hint ? { hint } : {})}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted sm:w-40">
          {shown ? (
            <img src={shown} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">{fallbackText}</span>
          )}
        </div>
        <div className="grid min-w-0 gap-2">
          <Badge variant={path ? "default" : "secondary"} className="w-fit">
            {path ? t("usingCustomImage") : t("usingDesignImage")}
          </Badge>
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              aria-label={`${t("uploadImage")} — ${label}`}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                const saved = await upload(file, folder);
                setBusy(false);
                if (saved) onChange(saved);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              {t("uploadImage")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
              <Images className="size-4" aria-hidden="true" />
              {t("pickFromGallery")}
            </Button>
            {path ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
                <X className="size-4" aria-hidden="true" />
                {t("resetToDesign")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {picking ? (
        <ImagePicker
          onPick={(picked) => {
            setPicking(false);
            onChange(picked);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </SettingRow>
  );
}

export function CustomizeSettings({
  catalog,
  initialTheme,
}: {
  catalog: Catalog;
  /** Design to open first (from Appearance's "Customise this design"). */
  initialTheme?: DesignThemeId | undefined;
}) {
  const { t, language } = useAdminCopy();
  const queryClient = useQueryClient();
  const save = useServerFn(saveThemeCustomization);
  const saved = useMemo(() => fromCatalog(catalog), [catalog]);
  const form = useDraft<Drafts>(saved);
  const drafts = form.value ?? saved;
  const [theme, setTheme] = useState<DesignThemeId>(
    initialTheme ?? catalog.settings.designTheme.theme,
  );
  const [busy, setBusy] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const draft = drafts[theme];
  const live = catalog.settings.designTheme.theme;
  const meta = DESIGN_THEMES.find((d) => d.id === theme);

  useEffect(() => setDefaults(readDesignColors(theme)), [theme]);
  useFontStylesheet(themeFontsHref(theme));

  const set = (patch: Partial<ThemeCustomization>) =>
    form.setValue((current) => ({
      ...current,
      [theme]: { ...current[theme], ...patch },
    }));
  const setColor = (token: CustomColorToken, value: string) =>
    set({ colors: { ...draft.colors, [token]: value } });
  const setSize = (key: SizeKey, value: number | undefined) => {
    const sizes = { ...draft.sizes };
    if (value === undefined) delete sizes[key];
    else sizes[key] = value;
    set({ sizes });
  };

  const onSave = async () => {
    const changed = DESIGN_THEME_IDS.filter(
      (id) => JSON.stringify(drafts[id]) !== JSON.stringify(saved[id]),
    );
    const invalid = changed.find((id) =>
      Object.values(drafts[id].colors).some((v) => v && !isSafeColor(v)),
    );
    if (invalid) return void toast.error(t("errSaveCustomize"));
    const badContact = changed.find((id) => {
      const c = drafts[id].consultants;
      return (
        (c?.email && !isConsultantEmail(c.email)) || (c?.whatsapp && !isWhatsappNumber(c.whatsapp))
      );
    });
    if (badContact) return void toast.error(t("consultantsInvalid"));
    setBusy(true);
    try {
      for (const id of changed) {
        const result = await save({
          data: { theme: id, value: compactCustomization(drafts[id]) },
        });
        if (!result.ok) return void toast.error(t(result.message as AdminCopyKey));
        queryClient.setQueryData<Catalog>(
          ["catalog"],
          (current) =>
            current && {
              ...current,
              settings: {
                ...current.settings,
                themeCustomizations: {
                  ...current.settings.themeCustomizations,
                  [id]: compactCustomization(drafts[id]),
                },
              },
            },
        );
      }
      form.reset(drafts);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("errSaveCustomize"));
    } finally {
      setBusy(false);
    }
  };

  const color = (token: CustomColorToken) => {
    const value = draft.colors[token] ?? "";
    return value && isSafeColor(value) ? value : defaults[token] || "";
  };
  const size = (key: SizeKey) => draft.sizes[key] ?? SIZE_DEFAULT[key];

  const consultantEmail = draft.consultants?.email ?? "";
  const consultantWhatsapp = draft.consultants?.whatsapp ?? "";
  const logoPath = draft.logo;
  const logoSigned = useAssetUrl(logoPath);
  const designLogo = themedLogo(theme, catalog.settings.logoUrl);
  const sample = catalog.products.find((p) => p.image) ?? catalog.products[0];
  const samplePath = sample ? (draft.productImages[sample.id] ?? "") : "";
  const sampleSigned = useAssetUrl(samplePath);
  const bgSigned = useAssetUrl(draft.background);
  const sampleImage = samplePath ? sampleSigned : sample ? themedImage(theme, sample) : "";
  const previewStyle = {
    ...Object.fromEntries(CUSTOM_COLOR_TOKENS.map((token) => [token, color(token)])),
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    ...(bgSigned
      ? {
          backgroundImage: `linear-gradient(color-mix(in oklab, var(--background) 72%, transparent), color-mix(in oklab, var(--background) 72%, transparent)), url("${bgSigned}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  } as CSSProperties;

  return (
    <fieldset disabled={busy} className="grid min-w-0 gap-5 border-0 p-0">
      <Card title={t("customizeDesign")} description={t("customizeDesignHint")}>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label={t("customizeDesign")}
            className={`${selectClass} max-w-xs`}
            value={theme}
            onChange={(event) => setTheme(event.target.value as DesignThemeId)}
          >
            {DESIGN_THEMES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name[language]}
                {d.id === live ? ` — ${t("themeLive")}` : ""}
                {!isEmptyCustomization(drafts[d.id]) ? ` · ${t("customizeEdited")}` : ""}
              </option>
            ))}
          </select>
          {theme === live ? <Badge variant="secondary">{t("themeLive")}</Badge> : null}
          <Button asChild variant="outline" size="sm">
            <a href={previewUrl(theme)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("customizeOpenPreview")}
            </a>
          </Button>
          {!isEmptyCustomization(draft) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set(emptyCustomization())}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("resetAllDesign")}
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("customizePreviewNote")}</p>

        <div
          className="mt-4 overflow-hidden rounded-xl border"
          style={{ ...previewStyle, borderColor: "var(--library-rule)" }}
          aria-label={t("customizePreview")}
          data-testid="customize-preview"
        >
          <div
            className="flex items-center gap-3 border-b px-4"
            style={{
              borderColor: "var(--library-rule)",
              paddingBlock: `${Math.max(4, size("header"))}px`,
            }}
          >
            <div className="flex items-center gap-2" style={{ zoom: size("logo") }}>
              {logoSigned || designLogo ? (
                <img src={logoSigned || designLogo} alt="" className="h-8 w-auto" />
              ) : null}
              <strong className="text-base" dir="ltr">
                {catalog.settings.displayTitle}
              </strong>
            </div>
          </div>
          <div className="p-4" style={{ zoom: size("text") }}>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {meta?.description[language]}
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div
                className="overflow-hidden rounded-lg border"
                style={{
                  width: `${Math.round(176 * size("cards"))}px`,
                  background: "var(--card)",
                  borderColor: "var(--library-rule)",
                }}
              >
                <div className="aspect-video bg-muted/40">
                  {sampleImage ? (
                    <img src={sampleImage} alt="" className="h-full w-full object-contain" />
                  ) : null}
                </div>
                <div className="p-2 text-sm font-semibold">{sample?.name}</div>
              </div>
              <span
                className="rounded-md px-3 py-1.5 text-sm font-medium"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {t("previewButton")}
              </span>
              <span
                className="rounded-md px-3 py-1.5 text-sm"
                style={{ background: "var(--accent)" }}
              >
                {t("color_accent")}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t("customizeColors")} description={t("customizeColorsDesc")}>
        <div className="grid gap-3 sm:grid-cols-2">
          {CUSTOM_COLOR_TOKENS.map((token) => {
            const name = t(TOKEN_LABEL[token]);
            const value = draft.colors[token] ?? "";
            const invalid = value !== "" && !isSafeColor(value);
            return (
              <div key={token} className="flex min-w-0 items-center gap-2">
                <input
                  type="color"
                  aria-label={name}
                  value={toHex(color(token))}
                  onChange={(event) => setColor(token, event.target.value)}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{name}</span>
                  <Input
                    dir="ltr"
                    value={value}
                    placeholder={defaults[token] || t("designDefault")}
                    aria-label={t("colorValue", { name })}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => setColor(token, event.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                {value ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("resetToDesign")} — ${name}`}
                    onClick={() => setColor(token, "")}
                  >
                    <RotateCcw className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t("customizeSizes")} description={t("customizeSizesDesc")}>
        {SIZE_KEYS.map((key) => {
          const limits = SIZE_LIMITS[key];
          const isSet = draft.sizes[key] !== undefined;
          const label = t(SIZE_LABEL[key]);
          return (
            <SettingRow
              key={key}
              label={label}
              {...(key === "header" ? { hint: t("size_headerHint") } : {})}
            >
              <div className="flex items-center gap-3">
                <Slider
                  min={limits.min}
                  max={limits.max}
                  step={limits.step}
                  value={[size(key)]}
                  thumbLabel={label}
                  onValueChange={([v]) => setSize(key, v ?? SIZE_DEFAULT[key])}
                />
                <span
                  className="w-16 shrink-0 text-end text-sm tabular-nums text-muted-foreground"
                  dir="ltr"
                >
                  {isSet ? formatSize(key, size(key)) : t("designDefault")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!isSet}
                  aria-label={`${t("resetToDesign")} — ${label}`}
                  onClick={() => setSize(key, undefined)}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </SettingRow>
          );
        })}
      </Card>

      <Card title={t("customizeImages")} description={t("customizeImagesDesc")}>
        <ImageChoice
          label={t("customLogo")}
          path={draft.logo}
          fallbackUrl={designLogo}
          fallbackText={t("noImage")}
          folder="branding"
          onChange={(logo) => set({ logo })}
        />
        <ImageChoice
          label={t("customBackground")}
          hint={t("customBackgroundHint")}
          path={draft.background}
          fallbackUrl=""
          fallbackText={t("noBackground")}
          folder="branding"
          onChange={(background) => set({ background })}
        />
        <ImageChoice
          label={t("customAboutImage")}
          hint={t("customAboutImageHint")}
          path={draft.aboutImage ?? ""}
          fallbackUrl={ABOUT_IMAGE_URL}
          fallbackText={t("noImage")}
          folder="branding"
          onChange={(aboutImage) => set({ aboutImage })}
        />
        <h3 className="mt-5 text-sm font-semibold">{t("customProductImages")}</h3>
        {catalog.products.map((product) => (
          <ImageChoice
            key={product.id}
            label={product.name}
            path={draft.productImages[product.id] ?? ""}
            fallbackUrl={themedImage(theme, product)}
            fallbackText={t("noImage")}
            folder="products"
            onChange={(path) => {
              const productImages = { ...draft.productImages };
              if (path) productImages[product.id] = path;
              else delete productImages[product.id];
              set({ productImages });
            }}
          />
        ))}
      </Card>

      <Card title={t("customizeConsultants")} description={t("customizeConsultantsDesc")}>
        <SettingRow
          label={t("consultantsEmail")}
          hint={t("consultantsEmailHint", {
            email: catalog.settings.contactInfo.email || "—",
          })}
          htmlFor="consultants-email"
          error={
            consultantEmail && !isConsultantEmail(consultantEmail)
              ? t("consultantsEmailInvalid")
              : undefined
          }
        >
          <Input
            id="consultants-email"
            type="email"
            dir="ltr"
            maxLength={160}
            placeholder={catalog.settings.contactInfo.email || "team@example.com"}
            value={consultantEmail}
            onChange={(event) =>
              set({
                consultants: {
                  ...draft.consultants,
                  email: event.target.value.trim(),
                },
              })
            }
          />
        </SettingRow>
        <SettingRow
          label={t("consultantsWhatsapp")}
          hint={t("consultantsWhatsappHint")}
          htmlFor="consultants-whatsapp"
          error={
            consultantWhatsapp && !isWhatsappNumber(consultantWhatsapp)
              ? t("consultantsWhatsappInvalid")
              : undefined
          }
        >
          <div className="grid gap-2">
            <Input
              id="consultants-whatsapp"
              inputMode="tel"
              dir="ltr"
              maxLength={24}
              placeholder="9665XXXXXXXX"
              value={consultantWhatsapp}
              onChange={(event) =>
                set({
                  consultants: {
                    ...draft.consultants,
                    whatsapp: normalizeWhatsapp(event.target.value),
                  },
                })
              }
            />
            {whatsappUrl(consultantWhatsapp) ? (
              <a
                href={whatsappUrl(consultantWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit text-xs text-primary underline underline-offset-4"
                dir="ltr"
              >
                {whatsappUrl(consultantWhatsapp)}
              </a>
            ) : null}
          </div>
        </SettingRow>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <a
              href={`/enterprise-services?preview-theme=${theme}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("consultantsOpenPage")}
            </a>
          </Button>
        </div>
      </Card>

      <SaveBar dirty={form.dirty} busy={busy} onSave={onSave} onDiscard={form.discard} />
    </fieldset>
  );
}
