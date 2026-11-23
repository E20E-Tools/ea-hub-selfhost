import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import archyPoster from "@/assets/archy-atlas.webp";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { saveArchyGreeting } from "@/lib/admin.functions";
import type { AdminCopyKey } from "@/lib/admin-copy";
import {
  ARCHY_GREETING_MAX,
  ARCHY_PITCH_RANGE,
  ARCHY_RATE_RANGE,
  archyGreetingText,
  type ArchyGreetingSettings,
} from "@/lib/archy-settings";
import { pickArchyVoice } from "@/lib/archy-speech";
import type { Catalog } from "@/lib/catalog";
import { dictionaries } from "@/lib/copy";
import { BilingualField, Card, SaveBar, SettingRow, useAdminCopy, useDraft } from "./ui";

/** Admin preview and editor for Archy's greeting text and voice. */
export function ArchySettings({ catalog }: { catalog: Catalog }) {
  const { t } = useAdminCopy();
  const queryClient = useQueryClient();
  const save = useServerFn(saveArchyGreeting);
  const saved = catalog.settings.archyGreeting;
  const form = useDraft<ArchyGreetingSettings>({ ...saved });
  const value = form.value ?? saved;
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ArchyGreetingSettings>) =>
    form.setValue((current) => ({ ...current, ...patch }));
  const textFor = (lang: "ar" | "en") =>
    archyGreetingText(value, lang, dictionaries[lang].archyGreeting);

  const listen = (lang: "ar" | "en") => {
    try {
      const synthesis = window.speechSynthesis;
      const voice = synthesis ? pickArchyVoice(synthesis.getVoices(), lang) : undefined;
      if (!synthesis || !voice || !window.SpeechSynthesisUtterance) {
        toast.error(t("archyNoVoice"));
        return;
      }
      synthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(textFor(lang));
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = value.rate;
      utterance.pitch = value.pitch;
      synthesis.speak(utterance);
    } catch {
      toast.error(t("archyNoVoice"));
    }
  };

  const onSave = async () => {
    setBusy(true);
    try {
      const result = await save({ data: value });
      if (!result.ok) return void toast.error(t(result.message as AdminCopyKey));
      form.reset(value);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("errSaveArchy"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Card title={t("archyPreview")}>
        <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
          <img src={archyPoster} alt="" className="mx-auto h-24 w-24 object-contain" />
          <div className="grid gap-3">
            {(["ar", "en"] as const).map((lang) => (
              <div key={lang} className="rounded-lg border border-border bg-muted px-3 py-2">
                <p dir={lang === "ar" ? "rtl" : "ltr"} className="text-sm">
                  {textFor(lang)}
                </p>
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => listen(lang)}>
                  <Volume2 className="size-4" />
                  {t(lang === "ar" ? "archyListenAr" : "archyListenEn")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <BilingualField
          label={t("archyTextLabel")}
          hint={t("archyTextHint")}
          ar={value.ar}
          en={value.en}
          maxLength={ARCHY_GREETING_MAX}
          onChange={(next) => set(next)}
        />
        <SettingRow
          label={t("archyVoiceDefault")}
          hint={t("archyVoiceDefaultHint")}
          htmlFor="archy-voice"
        >
          <Switch
            id="archy-voice"
            checked={value.voiceOn}
            onCheckedChange={(v) => set({ voiceOn: v })}
          />
        </SettingRow>
        <SettingRow label={t("archyRate")} htmlFor="archy-rate">
          <div className="flex items-center gap-3">
            <Slider
              id="archy-rate"
              min={ARCHY_RATE_RANGE[0]}
              max={ARCHY_RATE_RANGE[1]}
              step={0.02}
              value={[value.rate]}
              onValueChange={([v]) => set({ rate: v ?? value.rate })}
            />
            <span className="w-10 text-sm tabular-nums">{value.rate.toFixed(2)}</span>
          </div>
        </SettingRow>
        <SettingRow label={t("archyPitch")} htmlFor="archy-pitch">
          <div className="flex items-center gap-3">
            <Slider
              id="archy-pitch"
              min={ARCHY_PITCH_RANGE[0]}
              max={ARCHY_PITCH_RANGE[1]}
              step={0.02}
              value={[value.pitch]}
              onValueChange={([v]) => set({ pitch: v ?? value.pitch })}
            />
            <span className="w-10 text-sm tabular-nums">{value.pitch.toFixed(2)}</span>
          </div>
        </SettingRow>
        <SaveBar
          dirty={form.dirty}
          busy={busy}
          onSave={() => void onSave()}
          onDiscard={form.discard}
        />
      </Card>
    </div>
  );
}
