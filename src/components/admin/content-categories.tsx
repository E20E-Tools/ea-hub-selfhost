import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCategories } from "@/lib/admin.functions";
import type { Catalog } from "@/lib/catalog";
import {
  Card,
  EmptyBlock,
  FieldError,
  LangTag,
  SaveBar,
  useAdminCopy,
  useDraft,
} from "./ui";

type Row = { key: string; id: string; ar: string; en: string };

const toRows = (catalog: Catalog): Row[] =>
  Object.entries(catalog.settings.categories).map(([id, ar]) => ({
    key: id,
    id,
    ar,
    en: catalog.settings.categoriesEn[id] ?? "",
  }));

export function CategoriesTab({ catalog }: { catalog: Catalog }) {
  const { t } = useAdminCopy();
  const queryClient = useQueryClient();
  const form = useDraft<Row[]>(toRows(catalog));
  const rows = form.value ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: string, patch: Partial<Row>) =>
    form.setValue((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const save = async () => {
    const valid = rows.every(
      (r) =>
        /^[a-z0-9-]{2,40}$/.test(r.id.trim()) &&
        r.ar.trim().length >= 2 &&
        (r.en.trim() === "" || r.en.trim().length >= 2),
    );
    const unique = new Set(rows.map((r) => r.id.trim())).size === rows.length;
    if (!valid || !unique) {
      setError(t("categoryInvalid"));
      return;
    }
    setError("");
    const categories: Record<string, string> = {};
    const categoriesEn: Record<string, string> = {};
    for (const r of rows) {
      categories[r.id.trim()] = r.ar.trim();
      if (r.en.trim()) categoriesEn[r.id.trim()] = r.en.trim();
    }
    setBusy(true);
    try {
      const result = await saveCategories({
        data: { categories, categoriesEn },
      });
      if (!result.ok) return void toast.error(t(result.message));
      toast.success(t("saved"));
      form.reset(rows);
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={t("categoriesTitle")}
      description={t("categoriesDesc")}
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            form.setValue((current) => [
              ...current,
              { key: crypto.randomUUID(), id: "", ar: "", en: "" },
            ])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addCategory")}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyBlock text={t("noCategories")} />
      ) : (
        <div className="grid gap-3">
          <div className="hidden grid-cols-[10rem_1fr_1fr_2.25rem] gap-3 px-1 text-xs text-muted-foreground md:grid">
            <span>{t("categoryId")}</span>
            <span className="flex items-center gap-1.5">
              {t("categoryName")} <LangTag lang="ar" />
            </span>
            <span className="flex items-center gap-1.5">
              {t("categoryName")} <LangTag lang="en" />
            </span>
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[10rem_1fr_1fr_2.25rem] md:items-center md:gap-3 md:border-0 md:p-0"
            >
              <Input
                aria-label={t("categoryId")}
                dir="ltr"
                value={row.id}
                onChange={(e) =>
                  update(row.key, { id: e.target.value.toLowerCase() })
                }
              />
              <Input
                aria-label={`${t("categoryName")} AR`}
                dir="rtl"
                lang="ar"
                value={row.ar}
                onChange={(e) => update(row.key, { ar: e.target.value })}
              />
              <Input
                aria-label={`${t("categoryName")} EN`}
                dir="ltr"
                lang="en"
                value={row.en}
                placeholder={row.ar ? t("missingTranslation") : ""}
                onChange={(e) => update(row.key, { en: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("removeCategory")}
                onClick={() =>
                  form.setValue((current) =>
                    current.filter((r) => r.key !== row.key),
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {error ? <FieldError text={error} /> : null}
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={form.discard}
      />
    </Card>
  );
}
