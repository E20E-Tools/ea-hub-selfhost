import { adminDictionaries } from "@/lib/admin-copy";
import { ProductQuality,type QualityField } from "./product-quality";
import { useEffect,useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isPublicationDate } from "@/lib/publication-date";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Images, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/confirm-dialog";
import { deleteProduct, saveProduct } from "@/lib/admin.functions";
import { pick } from "@/lib/language-core";
import type { Catalog, Product, SiteSettings } from "@/lib/catalog";
import {
  EMPTY_BENEFICIARY_DETAILS,
  normalizeBeneficiaryDetails,
  type BeneficiaryDetails,
} from "@/lib/beneficiary-metadata";
import { ProductFitFields } from "./product-fit-fields";
import { ProductScreenshotsField } from "./product-screenshots";
import { ImagePicker, useImageUpload } from "./media";
import {
  BilingualField,
  Card,
  EmptyBlock,
  Field,
  SaveBar,
  selectClass,
  useAdminCopy,
  useAssetUrl,
  useDraft,
  useLeaveGuard,
} from "./ui";

type ProductDraft = {
  id: string;
  name: string;
  category: string;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
  overview: string;
  overviewEn: string;
  features: string;
  featuresEn: string;
  version: string;
  whatsNew: string;
  whatsNewEn: string;
  url: string;
  githubUrl: string;
  keywords: string;
  servicesEnabled: boolean;
  comingSoon: boolean;
  publicationDate: string;
  imageUrl: string;
  imageAlt: string;
  imageAltEn: string;
  sortOrder: number;
  beneficiaryDetails: BeneficiaryDetails;
};

function emptyDraft(settings: SiteSettings): ProductDraft {
  return {
    id: "",
    name: "",
    category: Object.keys(settings.categories)[0] ?? "",
    label: "",
    labelEn: "",
    description: "",
    descriptionEn: "",
    overview: "",
    overviewEn: "",
    features: "",
    featuresEn: "",
    version: "",
    whatsNew: "",
    whatsNewEn: "",
    url: "",
    githubUrl: "https://github.com/e20etools/",
    keywords: "",
    servicesEnabled: true,
    comingSoon: false,
    publicationDate: "",
    imageUrl: "",
    imageAlt: "",
    imageAltEn: "",
    sortOrder: 100,
    beneficiaryDetails: normalizeBeneficiaryDetails(EMPTY_BENEFICIARY_DETAILS),
  };
}

function draftFrom(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    label: product.label,
    labelEn: product.labelEn ?? "",
    description: product.description,
    descriptionEn: product.descriptionEn ?? "",
    overview: product.overview,
    overviewEn: product.overviewEn ?? "",
    features: product.features.join("\n"),
    featuresEn: (product.featuresEn ?? []).join("\n"),
    version: product.version ?? "",
    whatsNew: product.whatsNew ?? "",
    whatsNewEn: product.whatsNewEn ?? "",
    url: product.url,
    githubUrl: product.githubUrl ?? "",
    keywords: product.keywords,
    servicesEnabled: product.servicesEnabled !== false,
    comingSoon: Boolean(product.comingSoonSetting ?? product.comingSoon),
    publicationDate: product.publicationDate ?? "",
    imageUrl: product.imagePath ?? "",
    imageAlt: product.imageAlt ?? "",
    imageAltEn: product.imageAltEn ?? "",
    sortOrder: product.sortOrder ?? 100,
    beneficiaryDetails: normalizeBeneficiaryDetails(product.beneficiaryDetails),
  };
}

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

type Errors = Partial<Record<keyof ProductDraft, string>>;

function validate(d: ProductDraft, t: (k: string) => string): Errors {
  const errors: Errors = {};
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(d.id.trim().toLowerCase())) errors.id = t("productIdHint");
  if (d.name.trim().length < 2) errors.name = t("required");
  if (!d.category) errors.category = t("required");
  if (d.publicationDate && !isPublicationDate(d.publicationDate))
    errors.publicationDate = t("productInvalidPublicationDate");
  if (d.label.trim().length < 2) errors.label = t("required");
  if (d.description.trim().length < 10) errors.description = t("tooShort");
  if (d.overview.trim().length < 10) errors.overview = t("tooShort");
  if (d.url.trim() && !/^https?:\/\/\S+$/i.test(d.url.trim())) errors.url = t("invalidUrl");
  if (d.githubUrl.trim() && !/^https:\/\/\S+$/i.test(d.githubUrl.trim()))
    errors.githubUrl = t("invalidUrl");
  return errors;
}

function Editor({
  catalog,
  initial,
  isNew,
  onDone, focusField,
}: {
  catalog: Catalog;
  initial: ProductDraft;
  isNew: boolean;
  onDone: () => void;
  focusField?:QualityField|undefined;
}) {
  const { t, language, dir } = useAdminCopy();
  const queryClient = useQueryClient();
  const form = useDraft<ProductDraft>(initial);
  const guard = useLeaveGuard();
  const draft = form.value ?? initial;
  const set = (patch: Partial<ProductDraft>) =>
    form.setValue((current) => ({ ...current, ...patch }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [picking, setPicking] = useState(false);
  const [editorTab, setEditorTab] = useState(focusField==="p-url"?"links":focusField?"texts":"basics");
  useEffect(()=>{if(focusField)document.getElementById(focusField)?.focus()},[focusField]);
  const [dateOpen, setDateOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useAssetUrl(draft.imageUrl);
  const upload = useImageUpload();
  const settings = catalog.settings;

  const save = async () => {
    const found = validate(draft, t);
    setErrors(found);
    if (Object.keys(found).length) {
      setEditorTab(
        found.publicationDate
          ? "basics"
          : found.url || found.githubUrl
            ? "links"
            : found.label || found.description || found.overview
              ? "texts"
              : "basics",
      );
      toast.error(t("saveFailed"));
      return;
    }
    setBusy(true);
    try {
      const result = await saveProduct({
        data: {
          id: draft.id.trim().toLowerCase(),
          name: draft.name.trim(),
          category: draft.category,
          categoryLabel: settings.categories[draft.category] ?? draft.category,
          label: draft.label.trim(),
          description: draft.description.trim(),
          overview: draft.overview.trim(),
          features: lines(draft.features),
          version: draft.version.trim(),
          whatsNew: draft.whatsNew.trim(),
          url: draft.url.trim(),
          githubUrl: draft.githubUrl.trim(),
          keywords: draft.keywords.trim(),
          servicesEnabled: draft.servicesEnabled,
          comingSoon: draft.comingSoon,
          publicationDate: draft.publicationDate,
          imageUrl: draft.imageUrl.trim(),
          imageAlt: draft.imageAlt.trim(),
          labelEn: draft.labelEn.trim(),
          descriptionEn: draft.descriptionEn.trim(),
          overviewEn: draft.overviewEn.trim(),
          featuresEn: lines(draft.featuresEn),
          whatsNewEn: draft.whatsNewEn.trim(),
          imageAltEn: draft.imageAltEn.trim(),
          sortOrder: Number(draft.sortOrder) || 0,
          beneficiaryDetails: draft.beneficiaryDetails,
        },
      });
      if (!result.ok) {
        toast.error(t(result.message));
        return;
      }
      toast.success(t("productSaved"));
      form.reset(draft);
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      onDone();
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const path = await upload(file, "products");
    setBusy(false);
    if (path) {
      set({ imageUrl: path });
      toast.success(t("imageUploaded"));
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void guard.confirmLeave().then((ok) => {
              if (ok) onDone();
            })
          }
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("tabProducts")}
        </Button>
        <h2 className="text-lg font-semibold" dir="auto">
          {isNew ? t("newProduct") : t("productManage", { name: draft.name })}
        </h2>
        {!isNew ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/product/$productId"
              params={{ productId: draft.id }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("productViewPage")}
            </Link>
          </Button>
        ) : null}
      </div>

      <Tabs value={editorTab} onValueChange={setEditorTab} dir={dir}>
        <TabsList className="h-auto flex-wrap">
          {[
            ["basics", "sectionBasics"],
            ["texts", "sectionTexts"],
            ["fit", "productBeneficiaryFit"],
            ["image", "productImage"],
            ["links", "sectionLinks"],
            ["release", "productRelease"],
            ["status", "productCatalogStatus"],
          ].map(([id, label]) => (
            <TabsTrigger key={id} value={id ?? "basics"}>
              {t(label ?? "sectionBasics")}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="basics">
          <Card title={t("sectionBasics")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={t("productId")}
                hint={t("productIdHint")}
                error={errors.id}
                htmlFor="p-id"
              >
                <Input
                  id="p-id"
                  dir="ltr"
                  value={draft.id}
                  disabled={!isNew}
                  onChange={(e) => set({ id: e.target.value })}
                />
              </Field>
              <Field label={t("productName")} error={errors.name} htmlFor="p-name">
                <Input
                  id="p-name"
                  dir="ltr"
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              <Field label={t("productCategory")} error={errors.category} htmlFor="p-cat">
                <select
                  id="p-cat"
                  className={selectClass}
                  value={draft.category}
                  onChange={(e) => set({ category: e.target.value })}
                >
                  {Object.keys(settings.categories).map((id) => (
                    <option key={id} value={id}>
                      {pick(
                        language,
                        settings.categories[id] ?? id,
                        settings.categoriesEn[id] ?? "",
                      )}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("productSortOrder")} hint={t("productSortHint")} htmlFor="p-order">
                <Input
                  id="p-order"
                  type="number"
                  dir="ltr"
                  min={0}
                  max={9999}
                  value={draft.sortOrder}
                  onChange={(e) => set({ sortOrder: Number(e.target.value) })}
                />
              </Field>
              {draft.comingSoon ? (
                <Field
                  label={t("productPublicationDate")}
                  error={errors.publicationDate}
                  htmlFor="p-publication-date"
                >
                  <div className="flex items-center gap-2">
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          id="p-publication-date"
                          variant="outline"
                          className="min-w-0 flex-1 justify-start font-normal"
                        >
                          <CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
                          {draft.publicationDate && isPublicationDate(draft.publicationDate)
                            ? format(parseISO(draft.publicationDate), "PPP", {
                                locale: language === "ar" ? arSA : enUS,
                              })
                            : t("productChoosePublicationDate")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0 pointer-events-auto">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          startMonth={new Date(2020, 0)}
                          endMonth={new Date(2100, 11)}
                          locale={language === "ar" ? arSA : enUS}
                          dir={dir}
                          selected={
                            draft.publicationDate && isPublicationDate(draft.publicationDate)
                              ? parseISO(draft.publicationDate)
                              : undefined
                          }
                          {...(draft.publicationDate && isPublicationDate(draft.publicationDate)
                            ? { defaultMonth: parseISO(draft.publicationDate) }
                            : {})}
                          onSelect={(date) => {
                            set({ publicationDate: date ? format(date, "yyyy-MM-dd") : "" });
                            setDateOpen(false);
                          }}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    {draft.publicationDate ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("delete")}
                        onClick={() => set({ publicationDate: "" })}
                      >
                        <X className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </Field>
              ) : null}
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="texts">
          <Card title={t("sectionTexts")}>
            <div className="grid gap-6">
              <BilingualField
                label={t("productLabel")}
                hint={t("productLabelHint")}
                ar={draft.label}
                en={draft.labelEn}
                maxLength={60}
                error={errors.label}
                onChange={(v) => set({ label: v.ar, labelEn: v.en })}
              />
              <BilingualField
                idPrefix="p-description" label={t("productDescription")}
                ar={draft.description}
                en={draft.descriptionEn}
                multiline
                rows={2}
                maxLength={300}
                error={errors.description}
                onChange={(v) => set({ description: v.ar, descriptionEn: v.en })}
              />
              <BilingualField
                label={t("productOverview")}
                ar={draft.overview}
                en={draft.overviewEn}
                multiline
                rows={5}
                maxLength={1200}
                error={errors.overview}
                onChange={(v) => set({ overview: v.ar, overviewEn: v.en })}
              />
              <BilingualField
                label={t("productFeatures")}
                hint={t("productFeaturesHint")}
                ar={draft.features}
                en={draft.featuresEn}
                multiline
                rows={4}
                onChange={(v) => set({ features: v.ar, featuresEn: v.en })}
              />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="fit">
          <ProductFitFields
            value={draft.beneficiaryDetails}
            onChange={(beneficiaryDetails) => set({ beneficiaryDetails })}
          />
        </TabsContent>
        <TabsContent value="release">
          <Card title={t("productRelease")}>
            <div className="grid gap-6">
              <Field label={t("productVersion")} hint={t("productVersionHint")} htmlFor="p-version">
                <Input
                  id="p-version"
                  dir="ltr"
                  className="max-w-48"
                  placeholder="1.0.0"
                  value={draft.version}
                  onChange={(e) => set({ version: e.target.value })}
                />
              </Field>
              <BilingualField
                label={t("productWhatsNew")}
                hint={t("productWhatsNewHint")}
                ar={draft.whatsNew}
                en={draft.whatsNewEn}
                multiline
                rows={3}
                maxLength={1500}
                onChange={(v) => set({ whatsNew: v.ar, whatsNewEn: v.en })}
              />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="image">
          <Card title={t("productImage")}>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted sm:w-56">
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t("noImage")}</span>
                )}
              </div>
              <div className="grid min-w-0 flex-1 content-start gap-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={t("uploadImage")}
                    onChange={(e) => {
                      void onFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    <ImagePlus className="size-4" aria-hidden="true" />
                    {t("uploadImage")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPicking(true)}
                  >
                    <Images className="size-4" aria-hidden="true" />
                    {t("pickFromGallery")}
                  </Button>
                  {draft.imageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => set({ imageUrl: "" })}
                    >
                      <X className="size-4" aria-hidden="true" />
                      {t("removeImage")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{t("imageFormats")}</p>
                <BilingualField
                  label={t("productImageAlt")}
                  ar={draft.imageAlt}
                  en={draft.imageAltEn}
                  maxLength={200}
                  onChange={(v) => set({ imageAlt: v.ar, imageAltEn: v.en })}
                />
              </div>
            </div>
          </Card>
          <ProductScreenshotsField
            value={draft.beneficiaryDetails.screenshots}
            onChange={(screenshots) =>
              set({ beneficiaryDetails: { ...draft.beneficiaryDetails, screenshots } })
            }
          />
        </TabsContent>
        <TabsContent value="links">
          <Card title={t("sectionLinks")}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t("productUrl")} error={errors.url} htmlFor="p-url">
                <Input
                  id="p-url"
                  dir="ltr"
                  placeholder="https://"
                  value={draft.url}
                  onChange={(e) => set({ url: e.target.value })}
                />
              </Field>
              <Field label={t("productGithub")} error={errors.githubUrl} htmlFor="p-github">
                <Input
                  id="p-github"
                  dir="ltr"
                  placeholder="https://github.com/"
                  value={draft.githubUrl}
                  onChange={(e) => set({ githubUrl: e.target.value })}
                />
              </Field>
              <Field label={t("productKeywords")} htmlFor="p-keys">
                <Input
                  id="p-keys"
                  dir="auto"
                  value={draft.keywords}
                  onChange={(e) => set({ keywords: e.target.value })}
                />
              </Field>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="status">
          <Card title={t("productCatalogStatus")}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{t("productCatalogPublished")}</Badge>
              <Badge variant={draft.comingSoon ? "secondary" : "success"}>
                {draft.comingSoon ? t("statusComingSoon") : t("statusAvailable")}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("productCatalogStatusHint")}</p>
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <label htmlFor="p-soon" className="text-sm font-medium">
                  {t("productComingSoon")}
                </label>
                <p className="text-xs text-muted-foreground">{t("productComingSoonHint")}</p>
              </div>
              <Switch
                id="p-soon"
                checked={draft.comingSoon}
                onCheckedChange={(v) => set({ comingSoon: v })}
              />
            </div>
            <label className="mt-4 flex items-center justify-between gap-4" htmlFor="p-services">{adminDictionaries[language].consoleOfferProfessionalServicesForThisProductAfter}
              <Switch id="p-services" checked={draft.servicesEnabled} onCheckedChange={v=>set({servicesEnabled:v})}/></label>
          </Card>
        </TabsContent>
      </Tabs>
      <SaveBar
        dirty={form.dirty || isNew}
        busy={busy}
        onSave={() => void save()}
        onDiscard={isNew ? onDone : form.discard}
      />
      {picking ? (
        <ImagePicker
          folder="products"
          onClose={() => setPicking(false)}
          onPick={(path) => {
            set({ imageUrl: path });
            setPicking(false);
            toast.success(t("imagePicked"));
          }}
        />
      ) : null}
    </div>
  );
}

export function ProductsTab({ catalog }: { catalog: Catalog }) {
  const { t, language, dir } = useAdminCopy();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ draft: ProductDraft; isNew: boolean;focusField?:QualityField } | null>(null);
  const [busyId, setBusyId] = useState("");
  const [confirm, dialog] = useConfirm();
  const settings = catalog.settings;

  if (editing)
    return (
      <Editor
        key={editing.draft.id || "new"}
        catalog={catalog}
        initial={editing.draft} focusField={editing.focusField}
        isNew={editing.isNew}
        onDone={() => setEditing(null)}
      />
    );

  const remove = async (product: Product) => {
    const ok = await confirm({
      title: t("deleteProductTitle", { name: product.name }),
      body: t("cannotUndo"),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
      dir,
    });
    if (!ok) return;
    setBusyId(product.id);
    try {
      const result = await deleteProduct({ data: { id: product.id } });
      if (!result.ok) {
        toast.error(t(result.message));
        return;
      }
      toast.success(t("productDeleted"));
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    } catch {
      toast.error(t("errDeleteProduct"));
    } finally {
      setBusyId("");
    }
  };

  return (
    <Card
      title={t("tabProducts")}
      actions={
        <Button size="sm" onClick={() => setEditing({ draft: emptyDraft(settings), isNew: true })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newProduct")}
        </Button>
      }
    >
      {dialog}
      <ProductQuality products={catalog.products} ar={language==="ar"} edit={(p,f)=>setEditing({draft:draftFrom(p),isNew:false,focusField:f})}/>
      {catalog.products.length === 0 ? (
        <EmptyBlock text={t("noProducts")} />
      ) : (
        <div className="relative w-full max-w-full overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-start font-medium">{t("colName")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colCategory")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colStatus")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("colRelease")}</th>
                <th className="px-3 py-2 text-end font-medium">
                  <span className="sr-only">{t("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {catalog.products.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5 font-medium" dir="ltr">
                    <Button
                      variant="link"
                      className="h-auto whitespace-normal p-0 text-start"
                      onClick={() => setEditing({ draft: draftFrom(product), isNew: false })}
                      aria-label={t("productManage", { name: product.name })}
                    >
                      {product.name}
                    </Button>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {pick(
                      language,
                      settings.categories[product.category] ?? product.category,
                      settings.categoriesEn[product.category] ?? "",
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={product.comingSoon ? "secondary" : "success"}>
                      {product.comingSoon ? t("statusComingSoon") : t("statusAvailable")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground" dir="ltr">
                    <span className="block text-start">{product.version || "—"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t("editProduct", { name: product.name })}
                        onClick={() => setEditing({ draft: draftFrom(product), isNew: false })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={t("deleteProductTitle", { name: product.name })}
                        disabled={busyId === product.id}
                        onClick={() => void remove(product)}
                      >
                        {busyId === product.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
