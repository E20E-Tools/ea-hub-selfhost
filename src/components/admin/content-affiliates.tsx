import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteAffiliate, saveAffiliate } from "@/lib/admin.functions";
import { affiliatesQueryOptions, type AffiliateRow } from "@/lib/affiliates.functions";
import { ImagePicker } from "./media";
import {
  BilingualField,
  Card,
  EmptyBlock,
  Field,
  QueryState,
  SaveBar,
  useAdminCopy,
  useAssetUrl,
  useDraft,
} from "./ui";

type Draft = AffiliateRow & { imageUrl: string; sortOrder: number; isNew: boolean; key: string };

const slugId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `affiliate-${Math.random().toString(36).slice(2, 8)}`;

function Preview({ path }: { path: string }) {
  const src = useAssetUrl(path);
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="h-14 w-24 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span
      className="h-14 w-24 shrink-0 rounded-md border border-dashed border-border bg-muted"
      aria-hidden="true"
    />
  );
}

export function AffiliatesTab() {
  const { t, dir, language } = useAdminCopy();
  const read = useQuery(affiliatesQueryOptions);
  const saved: Draft[] | undefined = read.data?.map((row, index) => ({
    ...row,
    imageUrl: row.imagePath,
    sortOrder: index + 1,
    isNew: false,
    key: row.id,
  }));
  const form = useDraft<Draft[]>(saved);
  const drafts = form.value ?? [];
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useServerFn(saveAffiliate);
  const remove = useServerFn(deleteAffiliate);
  const queryClient = useQueryClient();
  const [confirm, dialog] = useConfirm();

  const update = (key: string, patch: Partial<Draft>) =>
    form.setValue((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const submit = async () => {
    const found: Record<string, string> = {};
    for (const row of drafts) {
      if (!row.titleAr.trim() || !row.descriptionAr.trim()) found[row.key] = t("required");
      else if (!/^https:\/\/\S+$/i.test(row.url.trim())) found[row.key] = t("invalidUrl");
    }
    setErrors(found);
    if (Object.keys(found).length) return void toast.error(t("saveFailed"));
    setBusy(true);
    try {
      const used = new Set(drafts.filter((r) => !r.isNew).map((r) => r.id));
      const next: Draft[] = [];
      for (const row of drafts) {
        const id = row.isNew ? slugId(row.titleEn || row.titleAr) : row.id;
        if (row.isNew && used.has(id)) {
          toast.error(t("affiliateIdTaken", { id }));
          return;
        }
        used.add(id);
        const result = await save({
          data: {
            id,
            titleAr: row.titleAr,
            titleEn: row.titleEn,
            descriptionAr: row.descriptionAr,
            descriptionEn: row.descriptionEn,
            imageUrl: row.imageUrl,
            url: row.url,
            sortOrder: row.sortOrder,
          },
        });
        if (!result.ok) return void toast.error(t(result.message));
        next.push({ ...row, id, isNew: false });
      }
      form.reset(next);
      await queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      toast.success(t("saved"));
    } catch {
      toast.error(t("errSaveAffiliate"));
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (row: Draft) => {
    const name =
      (language === "ar" ? row.titleAr : row.titleEn) || row.titleAr || t("newAffiliate");
    const ok = await confirm({
      title: t("deleteAffiliateTitle", { name }),
      body: t("cannotUndo"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      dir,
    });
    if (!ok) return;
    if (row.isNew) return form.setValue((current) => current.filter((r) => r.key !== row.key));
    try {
      const result = await remove({ data: { id: row.id } });
      if (!result.ok) return void toast.error(t(result.message));
      form.setValue((current) => current.filter((r) => r.key !== row.key));
      await queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      toast.success(t("affiliateDeleted"));
    } catch {
      toast.error(t("errDeleteAffiliate"));
    }
  };

  return (
    <Card
      title={t("affiliatesTitle")}
      description={t("affiliatesDesc")}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            form.setValue((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                id: "",
                titleAr: "",
                titleEn: "",
                descriptionAr: "",
                descriptionEn: "",
                image: "",
                imagePath: "",
                url: "",
                imageUrl: "",
                sortOrder: current.length + 1,
                isNew: true,
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addAffiliate")}
        </Button>
      }
    >
      {dialog}
      <QueryState query={read} empty={t("noAffiliates")} isEmpty={false}>
        {drafts.length === 0 ? <EmptyBlock text={t("noAffiliates")} /> : null}
        <div className="grid gap-4">
          {drafts.map((row) => (
            <div key={row.key} className="grid gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <Preview path={row.imageUrl || row.image} />
                <strong className="min-w-0 flex-1 truncate" dir="auto">
                  {(language === "ar" ? row.titleAr : row.titleEn) ||
                    row.titleAr ||
                    t("newAffiliate")}
                </strong>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteAffiliateTitle", { name: row.titleAr || row.titleEn || "" })}
                  onClick={() => void removeRow(row)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <BilingualField
                label={t("affiliateTitle")}
                ar={row.titleAr}
                en={row.titleEn}
                maxLength={120}
                onChange={(v) => update(row.key, { titleAr: v.ar, titleEn: v.en })}
              />
              <BilingualField
                label={t("affiliateDescription")}
                ar={row.descriptionAr}
                en={row.descriptionEn}
                multiline
                rows={2}
                maxLength={600}
                onChange={(v) => update(row.key, { descriptionAr: v.ar, descriptionEn: v.en })}
              />
              <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
                <Field label={t("affiliateUrl")} htmlFor={`aff-url-${row.key}`}>
                  <Input
                    id={`aff-url-${row.key}`}
                    dir="ltr"
                    maxLength={400}
                    placeholder="https://"
                    value={row.url}
                    onChange={(e) => update(row.key, { url: e.target.value })}
                  />
                </Field>
                <Field label={t("affiliateOrder")} htmlFor={`aff-order-${row.key}`}>
                  <Input
                    id={`aff-order-${row.key}`}
                    type="number"
                    dir="ltr"
                    min={0}
                    max={9999}
                    value={row.sortOrder}
                    onChange={(e) => update(row.key, { sortOrder: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPicking(row.key)}
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  {t("pickFromGallery")}
                </Button>
                {row.imageUrl ? (
                  <span className="min-w-0 truncate text-xs text-muted-foreground" dir="ltr">
                    {row.imageUrl}
                  </span>
                ) : null}
              </div>
              {errors[row.key] ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors[row.key]}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </QueryState>
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void submit()}
        onDiscard={form.discard}
      />
      {picking !== null ? (
        <ImagePicker
          onClose={() => setPicking(null)}
          onPick={(path) => {
            update(picking, { imageUrl: path, image: "" });
            setPicking(null);
            toast.success(t("imagePicked"));
          }}
        />
      ) : null}
    </Card>
  );
}
