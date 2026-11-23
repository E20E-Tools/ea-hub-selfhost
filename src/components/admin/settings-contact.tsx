import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveContactInfo } from "@/lib/admin.functions";
import { getContactSettings, saveContactSettings } from "@/lib/contact-settings.functions";
import type { Catalog } from "@/lib/catalog";
import type { ContactInfo } from "@/lib/contact-info";
import {
  BilingualField,
  Card,
  ErrorBlock,
  LoadingBlock,
  SaveBar,
  SettingRow,
  useAdminCopy,
  useDraft,
} from "./ui";

type Notify = {
  recipientEmail: string;
  notifyEnabled: boolean;
  autoReplyEnabled: boolean;
  autoReplyText: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactSettings({
  catalog,
  mode = "public",
}: {
  catalog: Catalog;
  mode?: "public" | "notifications";
}) {
  const { t, date } = useAdminCopy();
  const queryClient = useQueryClient();
  const info = useDraft<ContactInfo>({ ...catalog.settings.contactInfo });
  const settings = useQuery({
    enabled: mode === "notifications",
    queryKey: ["admin", "contact-settings"],
    queryFn: () => getContactSettings(),
  });
  const notify = useDraft<Notify>(
    settings.data
      ? {
          recipientEmail: settings.data.recipientEmail,
          notifyEnabled: settings.data.notifyEnabled,
          autoReplyEnabled: settings.data.autoReplyEnabled,
          autoReplyText: settings.data.autoReplyText,
        }
      : undefined,
  );
  const saveInfo = useServerFn(saveContactInfo);
  const saveNotify = useServerFn(saveContactSettings);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const c = info.value!;
  const n = notify.value;
  const setInfo = (patch: Partial<ContactInfo>) =>
    info.setValue((current) => ({ ...current, ...patch }));
  const setNotify = (patch: Partial<Notify>) =>
    notify.setValue((current) => ({ ...current, ...patch }));

  const save = async () => {
    const found: Record<string, string> = {};
    if (info.dirty && c.email.trim() && !EMAIL.test(c.email.trim()))
      found["email"] = t("invalidEmail");
    if (info.dirty && c.website.trim() && !/^https:\/\/\S+$/i.test(c.website.trim()))
      found["website"] = t("invalidUrl");
    if (notify.dirty && n && !EMAIL.test(n.recipientEmail.trim()))
      found["recipient"] = t("invalidEmail");
    setErrors(found);
    if (Object.keys(found).length) return void toast.error(t("saveFailed"));
    setBusy(true);
    try {
      if (info.dirty) {
        const result = await saveInfo({ data: c });
        if (!result.ok) return void toast.error(t(result.message));
        info.reset(c);
        await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      }
      if (notify.dirty && n) {
        const result = await saveNotify({ data: n });
        if (!result.ok) return void toast.error(t(result.message));
        notify.reset(n);
        await queryClient.invalidateQueries({
          queryKey: ["admin", "contact-settings"],
        });
      }
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      {mode === "public" && (
        <Card title={t("publicContact")} description={t("publicContactDesc")}>
          <SettingRow label={t("email")} htmlFor="c-email" error={errors["email"]}>
            <Input
              id="c-email"
              type="email"
              dir="ltr"
              value={c.email}
              onChange={(e) => setInfo({ email: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("phone")} htmlFor="c-phone">
            <Input
              id="c-phone"
              dir="ltr"
              value={c.phone}
              onChange={(e) => setInfo({ phone: e.target.value })}
            />
          </SettingRow>
          <SettingRow label={t("website")} htmlFor="c-web" error={errors["website"]}>
            <Input
              id="c-web"
              dir="ltr"
              placeholder="https://hub.e20e.tools"
              value={c.website}
              onChange={(e) => setInfo({ website: e.target.value })}
            />
          </SettingRow>
          <div className="pt-4">
            <BilingualField
              label={t("address")}
              ar={c.addressAr}
              en={c.addressEn}
              multiline
              rows={2}
              onChange={(v) => setInfo({ addressAr: v.ar, addressEn: v.en })}
            />
          </div>
        </Card>
      )}

      {mode === "notifications" && (
        <Card title={t("notifications")} description={t("notificationsDesc")}>
          {settings.isPending ? <LoadingBlock rows={2} /> : null}
          {settings.isError ? <ErrorBlock onRetry={() => void settings.refetch()} /> : null}
          {settings.data && n ? (
            <>
              {!settings.data.emailSendingActive ? (
                <p className="mb-4 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t("emailInactive")}
                </p>
              ) : null}
              <SettingRow
                label={t("recipientEmail")}
                hint={t("recipientEmailHint")}
                htmlFor="n-email"
                error={errors["recipient"]}
              >
                <Input
                  id="n-email"
                  type="email"
                  dir="ltr"
                  value={n.recipientEmail}
                  onChange={(e) => setNotify({ recipientEmail: e.target.value })}
                />
              </SettingRow>
              <SettingRow label={t("notifyEnabled")} htmlFor="n-notify">
                <Switch
                  id="n-notify"
                  checked={n.notifyEnabled}
                  onCheckedChange={(v) => setNotify({ notifyEnabled: v })}
                />
              </SettingRow>
              <SettingRow label={t("autoReplyEnabled")} htmlFor="n-auto">
                <Switch
                  id="n-auto"
                  checked={n.autoReplyEnabled}
                  onCheckedChange={(v) => setNotify({ autoReplyEnabled: v })}
                />
              </SettingRow>
              {n.autoReplyEnabled ? (
                <SettingRow label={t("autoReplyText")} htmlFor="n-text">
                  <Textarea
                    id="n-text"
                    dir="auto"
                    rows={4}
                    maxLength={1000}
                    value={n.autoReplyText}
                    onChange={(e) => setNotify({ autoReplyText: e.target.value })}
                  />
                </SettingRow>
              ) : null}
              {settings.data.updatedAt ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  {t("lastUpdated", { date: date(settings.data.updatedAt) })}
                  {settings.data.updatedBy ? ` · ${settings.data.updatedBy}` : ""}
                </p>
              ) : null}
            </>
          ) : null}
        </Card>
      )}
      <SaveBar
        dirty={info.dirty || notify.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={() => {
          info.discard();
          notify.discard();
        }}
      />
    </div>
  );
}
