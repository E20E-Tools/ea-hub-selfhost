import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { saveFeatureFlags } from "@/lib/admin.functions";
import type { Catalog } from "@/lib/catalog";
import { FEATURE_KEYS, featureEnabled, type FeatureFlags } from "@/lib/site-features";
import { Card, SaveBar, SettingRow, useAdminCopy, useDraft } from "./ui";

export function FeatureSettings({ catalog }: { catalog: Catalog }) {
  const { t } = useAdminCopy();
  const form = useDraft<FeatureFlags>({ ...catalog.settings.featureFlags });
  const flags = form.value ?? catalog.settings.featureFlags;
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveFeatureFlags({ data: flags });
      if (!result.ok) return void toast.error(t(result.message));
      form.reset(flags);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card description={t("featuresDesc")}>
      {FEATURE_KEYS.map((key) => (
        <SettingRow
          key={key}
          label={t(`feature_${key}`)}
          hint={t(`feature_${key}Desc`)}
          htmlFor={`feature-${key}`}
        >
          <div className="flex items-center gap-3">
            <Switch
              id={`feature-${key}`}
              checked={featureEnabled(flags, key)}
              onCheckedChange={(v) => form.setValue((current) => ({ ...current, [key]: v }))}
            />
            <span className="text-sm text-muted-foreground">
              {featureEnabled(flags, key) ? t("enabled") : t("disabled")}
            </span>
          </div>
        </SettingRow>
      ))}
      <SaveBar dirty={form.dirty} busy={busy} onSave={() => void save()} onDiscard={form.discard} />
    </Card>
  );
}
