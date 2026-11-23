import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-dialog";
import type { AdminCopyKey } from "@/lib/admin-copy";
import {
  deleteTestimonial,
  listAllTestimonials,
  saveTestimonial,
} from "@/lib/testimonials.functions";
import { testimonialInputSchema, type Testimonial } from "@/lib/testimonials.shared";
import { ImageChoice } from "./settings-customize";
import {
  BilingualField,
  Card,
  EmptyBlock,
  Field,
  QueryState,
  SaveBar,
  useAdminCopy,
  useDraft,
} from "./ui";

type Draft = Testimonial & { key: string; isNew: boolean };

const blank = (order: number): Draft => ({
  key: crypto.randomUUID(),
  isNew: true,
  id: "",
  name: "",
  roleAr: "",
  roleEn: "",
  organizationAr: "",
  organizationEn: "",
  quoteAr: "",
  quoteEn: "",
  image: "",
  imagePath: "",
  sortOrder: order,
  published: true,
});

const toInput = (row: Draft) => ({
  ...(row.isNew ? {} : { id: row.id }),
  name: row.name,
  roleAr: row.roleAr,
  roleEn: row.roleEn,
  organizationAr: row.organizationAr,
  organizationEn: row.organizationEn,
  quoteAr: row.quoteAr,
  quoteEn: row.quoteEn,
  imagePath: row.imagePath,
  sortOrder: row.sortOrder,
  published: row.published,
});

/** Settings → Testimonials: add, edit, hide and order customer testimonials. */
export function TestimonialsSettings() {
  const { t, dir } = useAdminCopy();
  const list = useServerFn(listAllTestimonials);
  const read = useQuery({ queryKey: ["admin", "testimonials"], queryFn: () => list() });
  const saved: Draft[] | undefined = read.data?.map((row) => ({
    ...row,
    key: row.id,
    isNew: false,
  }));
  const form = useDraft<Draft[]>(saved);
  const drafts = form.value ?? [];
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useServerFn(saveTestimonial);
  const remove = useServerFn(deleteTestimonial);
  const queryClient = useQueryClient();
  const [confirm, dialog] = useConfirm();

  const update = (key: string, patch: Partial<Draft>) =>
    form.setValue((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "testimonials"] });
    await queryClient.invalidateQueries({ queryKey: ["testimonials"] });
  };

  const submit = async () => {
    const found: Record<string, string> = {};
    for (const row of drafts) {
      if (!row.name.trim()) found[row.key] = t("testimonialNameRequired");
      else if (!row.quoteAr.trim() && !row.quoteEn.trim())
        found[row.key] = t("testimonialQuoteRequired");
      else if (!testimonialInputSchema.safeParse(toInput(row)).success)
        found[row.key] = t("saveFailed");
    }
    setErrors(found);
    if (Object.keys(found).length) return void toast.error(t("saveFailed"));
    const base = new Map((saved ?? []).map((row) => [row.key, JSON.stringify(row)]));
    setBusy(true);
    try {
      const next: Draft[] = [];
      for (const row of drafts) {
        if (!row.isNew && base.get(row.key) === JSON.stringify(row)) {
          next.push(row);
          continue;
        }
        const result = await save({ data: toInput(row) });
        if (!result.ok) return void toast.error(t(result.message as AdminCopyKey));
        next.push({ ...row, id: result.id ?? row.id, key: result.id ?? row.key, isNew: false });
      }
      form.reset(next);
      await refresh();
      toast.success(t("saved"));
    } catch {
      toast.error(t("errSaveTestimonial"));
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (row: Draft) => {
    const ok = await confirm({
      title: t("deleteTestimonialTitle", { name: row.name || t("newTestimonial") }),
      body: t("cannotUndo"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      dir,
    });
    if (!ok) return;
    if (row.isNew) return form.setValue((current) => current.filter((r) => r.key !== row.key));
    try {
      const result = await remove({ data: { id: row.id } });
      if (!result.ok) return void toast.error(t(result.message as AdminCopyKey));
      form.setValue((current) => current.filter((r) => r.key !== row.key));
      await refresh();
      toast.success(t("testimonialDeleted"));
    } catch {
      toast.error(t("errDeleteTestimonial"));
    }
  };

  const visible = drafts.filter((row) => row.published && !row.isNew).length;

  return (
    <div className="grid gap-5">
      {dialog}
      <Card
        title={t("testimonialsTitle")}
        description={t("testimonialsDesc")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/testimonials" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("testimonialsOpenPage")}
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => form.setValue((current) => [...current, blank(current.length + 1)])}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("addTestimonial")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("testimonialsCount", { count: String(visible) })} {t("testimonialsMenuNote")}
        </p>
      </Card>
      <QueryState query={read} empty={t("noTestimonials")} isEmpty={false}>
        {drafts.length === 0 ? <EmptyBlock text={t("noTestimonials")} /> : null}
        <div className="grid gap-5">
          {drafts.map((row) => (
            <Card
              key={row.key}
              title={row.name || t("newTestimonial")}
              description={row.published ? t("testimonialShown") : t("testimonialHidden")}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteTestimonialTitle", {
                    name: row.name || t("newTestimonial"),
                  })}
                  onClick={() => void removeRow(row)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              }
            >
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
                  <Field label={t("testimonialName")} htmlFor={`tm-name-${row.key}`}>
                    <Input
                      id={`tm-name-${row.key}`}
                      dir="auto"
                      maxLength={120}
                      value={row.name}
                      onChange={(e) => update(row.key, { name: e.target.value })}
                    />
                  </Field>
                  <Field label={t("affiliateOrder")} htmlFor={`tm-order-${row.key}`}>
                    <Input
                      id={`tm-order-${row.key}`}
                      type="number"
                      dir="ltr"
                      min={0}
                      max={9999}
                      value={row.sortOrder}
                      onChange={(e) =>
                        update(row.key, {
                          sortOrder: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </Field>
                </div>
                <BilingualField
                  label={t("testimonialRole")}
                  ar={row.roleAr}
                  en={row.roleEn}
                  maxLength={160}
                  onChange={(v) => update(row.key, { roleAr: v.ar, roleEn: v.en })}
                />
                <BilingualField
                  label={t("testimonialOrganization")}
                  ar={row.organizationAr}
                  en={row.organizationEn}
                  maxLength={160}
                  onChange={(v) => update(row.key, { organizationAr: v.ar, organizationEn: v.en })}
                />
                <BilingualField
                  label={t("testimonialQuote")}
                  hint={t("testimonialQuoteHint")}
                  ar={row.quoteAr}
                  en={row.quoteEn}
                  multiline
                  rows={4}
                  maxLength={1200}
                  onChange={(v) => update(row.key, { quoteAr: v.ar, quoteEn: v.en })}
                />
                <ImageChoice
                  label={t("testimonialPhoto")}
                  hint={t("testimonialPhotoHint")}
                  path={row.imagePath}
                  fallbackUrl=""
                  fallbackText={t("noImage")}
                  folder="branding"
                  onChange={(imagePath) => update(row.key, { imagePath, image: "" })}
                />
                <label className="flex items-center gap-3 text-sm" htmlFor={`tm-pub-${row.key}`}>
                  <Switch
                    id={`tm-pub-${row.key}`}
                    checked={row.published}
                    onCheckedChange={(published) => update(row.key, { published })}
                  />
                  {t("testimonialPublished")}
                </label>
                {errors[row.key] ? (
                  <p role="alert" className="text-xs text-destructive">
                    {errors[row.key]}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </QueryState>
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void submit()}
        onDiscard={form.discard}
      />
    </div>
  );
}
