import { adminDictionaries } from "@/lib/admin-copy";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-dialog";
import { NAV_STYLES, saveNavigationSettings } from "@/lib/admin.functions";
import type { Catalog, SiteSettings } from "@/lib/catalog";
import {
  moveNavigation,
  navigationSchema,
  placedNavigation,
  type NavigationItem,
} from "@/lib/navigation.shared";
import {
  BilingualField,
  Card,
  Field,
  FieldError,
  SaveBar,
  useAdminCopy,
  useDraft,
} from "./ui";

type Nav = {
  items: NavigationItem[];
  navStyle: (typeof NAV_STYLES)[number];
  mobileNavStyle: SiteSettings["mobileNavStyle"];
};

const MOBILE_STYLES = ["sheet", "dropdown", "compact"] as const;

function Choice({
  selected,
  onSelect,
  title,
  description,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`grid gap-2 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-muted-foreground"}`}
    >
      {children}
      <strong className="text-sm">{title}</strong>
      <small className="text-xs text-muted-foreground">{description}</small>
    </button>
  );
}

export function NavigationSettings({ catalog }: { catalog: Catalog }) {
  const { t, dir } = useAdminCopy();
  const s = catalog.settings;
  const form = useDraft<Nav>({
    items: placedNavigation(s.navigationItems),
    navStyle: (NAV_STYLES as readonly string[]).includes(s.navStyle)
      ? (s.navStyle as Nav["navStyle"])
      : "glass",
    mobileNavStyle: s.mobileNavStyle,
  });
  const draft = form.value!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, dialog] = useConfirm();
  const queryClient = useQueryClient();
  const setItems = (items: NavigationItem[]) =>
    form.setValue((current) => ({ ...current, items }));
  const update = (id: string, patch: Partial<NavigationItem>) =>
    setItems(
      draft.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );

  const save = async () => {
    const parsed = navigationSchema.safeParse(draft.items);
    if (!parsed.success) {
      setError(t("menuInvalid"));
      return void toast.error(t("menuInvalid"));
    }
    setError("");
    setBusy(true);
    try {
      const result = await saveNavigationSettings({
        data: {
          items: parsed.data,
          navStyle: draft.navStyle,
          mobileNavStyle: draft.mobileNavStyle,
        },
      });
      if (!result.ok) return void toast.error(t(result.message));
      form.reset({ ...draft, items: parsed.data });
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: NavigationItem) => {
    const ok = await confirm({
      title: t("deleteMenuItemTitle", {
        name: item.labelAr || item.labelEn || t("newMenuItem"),
      }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      dir,
    });
    if (ok) setItems(draft.items.filter((row) => row.id !== item.id));
  };

  return (
    <div className="grid gap-5">
      {dialog}
      <Card
        title={t("menuItems")}
        description={t("menuItemsDesc")}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={draft.items.length >= 40}
            onClick={() =>
              setItems([
                ...draft.items,
                {
                  id: crypto.randomUUID(),
                  labelAr: "",
                  labelEn: "",
                  url: "",
                  cta: false,
                  hidden: false,
                  topBar: false,
                  group: "platform",
                },
              ])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addMenuItem")}
          </Button>
        }
      >
        <ol className="grid gap-3">
          {draft.items.map((item, index) => (
            <li
              key={item.id}
              className={`grid gap-4 rounded-lg border border-border p-4 ${item.hidden ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs tabular-nums">
                  {index + 1}
                </span>
                <strong className="min-w-0 flex-1 truncate text-sm" dir="auto">
                  {(dir === "rtl" ? item.labelAr : item.labelEn) ||
                    item.labelAr ||
                    t("newMenuItem")}
                </strong>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("moveUp")}
                  disabled={index === 0}
                  onClick={() =>
                    setItems(moveNavigation(draft.items, index, -1))
                  }
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("moveDown")}
                  disabled={index === draft.items.length - 1}
                  onClick={() =>
                    setItems(moveNavigation(draft.items, index, 1))
                  }
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t("delete")}
                  onClick={() => void remove(item)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <BilingualField
                label={t("menuItemLabel")}
                ar={item.labelAr}
                en={item.labelEn}
                maxLength={60}
                requiredAr
                onChange={(v) =>
                  update(item.id, { labelAr: v.ar, labelEn: v.en })
                }
              />
              <Field label={t("menuItemUrl")} htmlFor={`nav-url-${item.id}`}>
                <Input
                  id={`nav-url-${item.id}`}
                  dir="ltr"
                  maxLength={1000}
                  value={item.url}
                  onChange={(e) => update(item.id, { url: e.target.value })}
                />
              </Field>
              <label className="grid gap-2 text-sm">
                {
                  adminDictionaries[dir === "rtl" ? "ar" : "en"]
                    .consoleMenuGroup
                }
                <select
                  className="rounded-md border bg-background p-2"
                  value={item.group ?? "platform"}
                  onChange={(e) =>
                    update(item.id, {
                      group: e.target.value as NavigationItem["group"],
                    })
                  }
                >
                  <option value="platform">
                    {
                      adminDictionaries[dir === "rtl" ? "ar" : "en"]
                        .consolePlatformServices
                    }
                  </option>
                  <option value="workspace">
                    {
                      adminDictionaries[dir === "rtl" ? "ar" : "en"]
                        .consoleWorkspace
                    }
                  </option>
                  <option value="company">
                    {
                      adminDictionaries[dir === "rtl" ? "ar" : "en"]
                        .consoleCompanyContact
                    }
                  </option>
                  <option value="appearance">
                    {
                      adminDictionaries[dir === "rtl" ? "ar" : "en"]
                        .consoleAppearance
                    }
                  </option>
                  <option value="none">
                    {
                      adminDictionaries[dir === "rtl" ? "ar" : "en"]
                        .consoleNoMenuGroup
                    }
                  </option>
                </select>
              </label>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!!item.topBar}
                    onCheckedChange={(v) => update(item.id, { topBar: v })}
                  />
                  {
                    adminDictionaries[dir === "rtl" ? "ar" : "en"]
                      .consoleShowInTopBar
                  }
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.hidden !== true}
                    onCheckedChange={(v) => update(item.id, { hidden: !v })}
                  />
                  {t("menuItemVisible")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.cta}
                    onCheckedChange={(v) => update(item.id, { cta: v })}
                  />
                  {t("menuItemHighlighted")}
                </label>
              </div>
            </li>
          ))}
        </ol>
        {error ? <FieldError text={error} /> : null}
      </Card>

      <Card title={t("desktopStyle")}>
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label={t("desktopStyle")}
        >
          {NAV_STYLES.map((id) => (
            <Choice
              key={id}
              selected={draft.navStyle === id}
              onSelect={() =>
                form.setValue((current) => ({ ...current, navStyle: id }))
              }
              title={t(`navStyle_${id}`)}
              description={t(`navStyle_${id}Desc`)}
            >
              <span
                className="site-nav nav-style-preview"
                data-style={id}
                aria-hidden="true"
                dir="ltr"
              >
                <span className="site-nav-link" aria-current="page">
                  Home
                </span>
                <span className="site-nav-link">Library</span>
              </span>
            </Choice>
          ))}
        </div>
      </Card>

      <Card title={t("mobileStyle")}>
        <div
          className="grid gap-3 sm:grid-cols-3"
          role="radiogroup"
          aria-label={t("mobileStyle")}
        >
          {MOBILE_STYLES.map((id) => (
            <Choice
              key={id}
              selected={draft.mobileNavStyle === id}
              onSelect={() =>
                form.setValue((current) => ({ ...current, mobileNavStyle: id }))
              }
              title={t(`mobileNav_${id}`)}
              description={t(`mobileNav_${id}Desc`)}
            />
          ))}
        </div>
      </Card>
      <SaveBar
        dirty={form.dirty}
        busy={busy}
        onSave={() => void save()}
        onDiscard={form.discard}
      />
    </div>
  );
}
