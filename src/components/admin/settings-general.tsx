import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGeneralSettings } from "@/lib/admin.functions";
import type { Catalog } from "@/lib/catalog";
import { footerLinksSchema, type FooterLink } from "@/lib/footer-links";
import { useImageUpload } from "./media";
import {
  BilingualField,
  Field,
  Card,
  SaveBar,
  SettingRow,
  useAdminCopy,
  useAssetUrl,
  useDraft,
} from "./ui";

type General = {
  displayTitle: string;
  displayTitleEn: string;
  arabicTitle: string;
  tagline: string;
  taglineEn: string;
  description: string;
  descriptionEn: string;
  footerText: string;
  footerTextEn: string;
  footerLinks: FooterLink[];
  logoUrl: string;
};

export function GeneralSettings({ catalog }: { catalog: Catalog }) {
  const { t, language } = useAdminCopy();
  const s = catalog.settings;
  const form = useDraft<General>({
    displayTitle: s.displayTitle,
    displayTitleEn: s.displayTitleEn,
    arabicTitle: s.arabicTitle,
    tagline: s.tagline,
    taglineEn: s.taglineEn,
    description: s.description,
    descriptionEn: s.descriptionEn,
    footerText: s.footerText,
    footerTextEn: s.footerTextEn,
    footerLinks: s.footerLinks ?? [],
    logoUrl: s.logoPath,
  });
  const draft = form.value;
  if (!draft) throw new Error("Missing general settings draft");
  const set = (patch: Partial<General>) => form.setValue((current) => ({ ...current, ...patch }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof General, string>>>({});
  const logoInput = useRef<HTMLInputElement>(null);
  const logo = useAssetUrl(draft.logoUrl);
  const upload = useImageUpload();
  const queryClient = useQueryClient();

  const save = async () => {
    const found: typeof errors = {};
    if (draft.displayTitle.trim().length < 2) found.displayTitle = t("tooShort");
    if (draft.description.trim().length < 10) found.description = t("tooShort");
    if (!footerLinksSchema.safeParse(draft.footerLinks).success)
      found.footerLinks = t("invalidUrl");
    setErrors(found);
    if (Object.keys(found).length) return void toast.error(t("saveFailed"));
    setBusy(true);
    try {
      const trimmed = Object.fromEntries(
        Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]),
      ) as General;
      const result = await saveGeneralSettings({ data: trimmed });
      if (!result.ok) return void toast.error(t(result.message));
      form.reset(trimmed);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const path = await upload(file, "branding");
    setBusy(false);
    if (path) {
      set({ logoUrl: path });
      toast.success(t("imageUploaded"));
    }
  };

  return (
    <div className="grid gap-5">
      <aside className="settings-identity-preview" aria-label={t("settingsPreview")}>
        <small>{t("settingsPreview")}</small>
        <div>
          {logo && <img src={logo} alt="" />}
          <div>
            <strong dir="auto">
              {language === "ar" ? draft.displayTitle : draft.displayTitleEn || draft.displayTitle}
            </strong>
            <p dir="auto">{language === "ar" ? draft.tagline : draft.taglineEn || draft.tagline}</p>
          </div>
        </div>
      </aside>
      <Card>
        <div className="grid gap-6">
          <BilingualField
            idPrefix="identity-name"
            label={t("siteName")}
            hint={t("siteNameHint")}
            ar={draft.displayTitle}
            en={draft.displayTitleEn}
            maxLength={80}
            requiredAr
            error={errors.displayTitle}
            onChange={(v) => set({ displayTitle: v.ar, displayTitleEn: v.en })}
          />
          <BilingualField
            idPrefix="identity-tagline"
            label={t("tagline")}
            hint={t("taglineHint")}
            ar={draft.tagline}
            en={draft.taglineEn}
            maxLength={120}
            onChange={(v) => set({ tagline: v.ar, taglineEn: v.en })}
          />
          <BilingualField
            label={t("siteDescription")}
            hint={t("siteDescriptionHint")}
            ar={draft.description}
            en={draft.descriptionEn}
            multiline
            maxLength={400}
            error={errors.description}
            onChange={(v) => set({ description: v.ar, descriptionEn: v.en })}
          />
          <BilingualField
            idPrefix="identity-footer"
            label={t("footerText")}
            hint={t("footerTextHint")}
            ar={draft.footerText}
            en={draft.footerTextEn}
            maxLength={200}
            onChange={(v) => set({ footerText: v.ar, footerTextEn: v.en })}
          />
        </div>
      </Card>
      <Card title={t("footerLinks")}>
        <p className="mb-4 text-sm text-muted-foreground">{t("footerLinksHint")}</p>
        <div className="grid gap-4">
          {draft.footerLinks.map((link, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <Field label={t("footerLinkName")} htmlFor={`footer-name-${index}`}>
                <Input
                  id={`footer-name-${index}`}
                  value={link.name}
                  maxLength={80}
                  onChange={(e) =>
                    set({
                      footerLinks: draft.footerLinks.map((item, i) =>
                        i === index ? { ...item, name: e.target.value } : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={t("footerLinkUrl")} htmlFor={`footer-url-${index}`}>
                <Input
                  id={`footer-url-${index}`}
                  value={link.url}
                  dir="ltr"
                  placeholder="https://"
                  maxLength={500}
                  onChange={(e) =>
                    set({
                      footerLinks: draft.footerLinks.map((item, i) =>
                        i === index ? { ...item, url: e.target.value } : item,
                      ),
                    })
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("delete")}
                onClick={() =>
                  set({
                    footerLinks: draft.footerLinks.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {errors.footerLinks ? (
            <p className="text-sm text-destructive">{errors.footerLinks}</p>
          ) : null}
          <Button
            variant="outline"
            className="w-fit"
            disabled={draft.footerLinks.length >= 20}
            onClick={() =>
              set({
                footerLinks: [...draft.footerLinks, { name: "", url: "" }],
              })
            }
          >
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>
      </Card>
      <Card>
        <SettingRow label={t("logo")} hint={t("logoHint")} htmlFor="settings-logo">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {logo ? (
                <img
                  src={logo}
                  alt={t("logoAlt")}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-xs text-muted-foreground">{t("noLogo")}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={logoInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                aria-label={t("uploadLogo")}
                onChange={(e) => {
                  void onLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                id="settings-logo"
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => logoInput.current?.click()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="size-4" aria-hidden="true" />
                )}
                {t("uploadLogo")}
              </Button>
              {draft.logoUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ logoUrl: "" })}
                >
                  <X className="size-4" aria-hidden="true" />
                  {t("removeLogo")}
                </Button>
              ) : null}
            </div>
          </div>
        </SettingRow>
        <SettingRow label={t("arabicTitle")} hint={t("arabicTitleHint")} htmlFor="arabic-title">
          <Input
            id="arabic-title"
            dir="rtl"
            lang="ar"
            maxLength={120}
            value={draft.arabicTitle}
            onChange={(e) => set({ arabicTitle: e.target.value })}
          />
        </SettingRow>
      </Card>
      <SaveBar dirty={form.dirty} busy={busy} onSave={() => void save()} onDiscard={form.discard} />
    </div>
  );
}
