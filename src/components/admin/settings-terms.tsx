import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveTerms } from "@/lib/admin.functions";
import type { AdminCopyKey } from "@/lib/admin-copy";
import type { Catalog } from "@/lib/catalog";
import { DEFAULT_TERMS_AR, DEFAULT_TERMS_EN, TERMS_MAX } from "@/lib/terms";
import { BilingualField, Card, SaveBar, useAdminCopy, useDraft } from "./ui";

/** Terms of service editor shown in the design customisation tab. */
export function TermsSettings({
  catalog,
  theme,
}: {
  catalog: Catalog;
  theme?: string | undefined;
}) {
  const { t } = useAdminCopy();
  const queryClient = useQueryClient();
  const save = useServerFn(saveTerms);
  const saved = {
    ar: catalog.settings.terms.ar,
    en: catalog.settings.terms.en,
  };
  const form = useDraft(saved);
  const value = form.value ?? saved;
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    setBusy(true);
    try {
      const result = await save({ data: value });
      if (!result.ok)
        return void toast.error(t(result.message as AdminCopyKey));
      form.reset(value);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("errSaveTerms"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5">
      <Card title={t("termsTitle")} description={t("termsHint")}>
        <p className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t("termsDraftNote")}
        </p>
        <BilingualField
          label={t("termsTitle")}
          ar={value.ar}
          en={value.en}
          multiline
          rows={14}
          maxLength={TERMS_MAX}
          onChange={(next) => form.setValue(next)}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {!value.ar && !value.en ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                form.setValue({ ar: DEFAULT_TERMS_AR, en: DEFAULT_TERMS_EN })
              }
            >
              <FileText className="size-4" aria-hidden="true" />
              {t("termsUseDraft")}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <a
              href={`/terms${theme ? `?preview-theme=${theme}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("termsOpenPage")}
            </a>
          </Button>
        </div>
      </Card>
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void onSave()}
        onDiscard={form.discard}
      />
    </div>
  );
}
