import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Expand, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { listAdminImages, uploadAdminImage } from "@/lib/admin.functions";
import { imageFileSize, type AdminImage } from "@/lib/admin-gallery.shared";
import { Card, QueryState, imageProblem, selectClass, useAdminCopy } from "./ui";

export const imagesQueryKey = ["admin-images"];

export function useAdminImages() {
  const read = useServerFn(listAdminImages);
  return useQuery({
    queryKey: imagesQueryKey,
    queryFn: () => read(),
    staleTime: 60_000,
    gcTime: 0,
  });
}

/** Uploads one validated image to a folder; resolves the stored path or null (toast shown). */
export function useImageUpload() {
  const upload = useServerFn(uploadAdminImage);
  const { t } = useAdminCopy();
  return async (
    file: File,
    folder: "products" | "branding" | "affiliates",
  ): Promise<string | null> => {
    const problem = imageProblem(file);
    if (problem) {
      toast.error(t(problem));
      return null;
    }
    try {
      const data = new FormData();
      data.set("file", file);
      data.set("folder", folder);
      const result = await upload({ data });
      if (!result.ok) {
        toast.error(t(result.message));
        return null;
      }
      return result.path;
    } catch {
      toast.error(t("errImageUpload"));
      return null;
    }
  };
}

const folderKey = (folder: string) =>
  folder.startsWith("branding")
    ? "folder_branding"
    : folder.startsWith("products")
      ? "folder_products"
      : folder.startsWith("affiliates")
        ? "folder_affiliates"
        : "folder_other";

/** Pick a saved image; nothing is copied or deleted. */
export function ImagePicker({
  folder,
  onPick,
  onClose,
}: {
  folder?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}) {
  const { t, dir } = useAdminCopy();
  const images = useAdminImages();
  const list = (images.data ?? []).filter((image) => !folder || image.folder.startsWith(folder));
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent dir={dir} className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{t("pickImageTitle")}</DialogTitle>
        <DialogDescription>{t("pickImageDesc")}</DialogDescription>
        <QueryState query={images} empty={t("noImages")} isEmpty={list.length === 0}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {list.map((image) => (
              <button
                key={image.path}
                type="button"
                onClick={() => onPick(image.path)}
                aria-label={t("pickImage", { name: image.name })}
                className="overflow-hidden rounded-lg border border-border bg-muted transition hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <img
                  src={image.url}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full object-contain"
                />
              </button>
            ))}
          </div>
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

export function MediaLibrary() {
  const { t, dir } = useAdminCopy();
  const images = useAdminImages();
  const upload = useImageUpload();
  const input = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<"products" | "branding" | "affiliates">("products");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AdminImage | null>(null);
  const [dimensions, setDimensions] = useState<Record<string, string>>({});

  const submit = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    const path = await upload(file, folder);
    setBusy(false);
    if (input.current) input.current.value = "";
    if (path) {
      toast.success(t("mediaUploaded"));
      await images.refetch();
    }
  };

  return (
    <Card
      title={t("mediaTitle")}
      description={t("mediaDesc")}
      actions={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("refresh")}
          disabled={images.isFetching}
          onClick={() => void images.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          {t("uploadTarget")}
          <select
            className={selectClass}
            value={folder}
            onChange={(e) => setFolder(e.target.value as typeof folder)}
          >
            <option value="products">{t("folder_products")}</option>
            <option value="branding">{t("folder_branding")}</option>
            <option value="affiliates">{t("folder_affiliates")}</option>
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label={t("uploadToGallery")}
          onChange={(event) => void submit(event.target.files?.[0])}
        />
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="size-4" aria-hidden="true" />
          )}
          {busy ? t("uploading") : t("uploadImage")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("imageFormats")}</span>
      </div>
      <QueryState query={images} empty={t("noImages")} isEmpty={(images.data ?? []).length === 0}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.data?.map((image) => (
            <figure
              key={image.path}
              className="min-w-0 overflow-hidden rounded-lg border border-border"
            >
              <div className="relative bg-muted">
                {image.url ? (
                  <img
                    src={image.url}
                    alt={image.name}
                    loading="lazy"
                    className="aspect-square w-full object-contain"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      setDimensions((current) => ({
                        ...current,
                        [image.path]: `${img.naturalWidth} × ${img.naturalHeight}`,
                      }));
                    }}
                  />
                ) : (
                  <span className="flex aspect-square items-center justify-center text-xs text-muted-foreground">
                    {t("previewUnavailable")}
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute end-2 top-2 size-8"
                  aria-label={t("enlarge", { name: image.name })}
                  disabled={!image.url}
                  onClick={() => setSelected(image)}
                >
                  <Expand className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <figcaption className="grid gap-1 p-2 text-xs">
                <strong className="truncate font-medium" dir="ltr">
                  {image.name}
                </strong>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{t(folderKey(image.folder))}</Badge>
                  <span dir="ltr">{imageFileSize(image.bytes)}</span>
                  <span dir="ltr">
                    {dimensions[image.path] ??
                      (image.width && image.height ? `${image.width} × ${image.height}` : "")}
                  </span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </QueryState>
      <Dialog open={selected !== null} onOpenChange={(open) => (open ? null : setSelected(null))}>
        <DialogContent dir={dir} className="sm:max-w-3xl">
          <DialogTitle dir="ltr">{selected?.name}</DialogTitle>
          <DialogDescription dir="ltr">
            {selected
              ? `${imageFileSize(selected.bytes)} · ${dimensions[selected.path] ?? ""}`
              : ""}
          </DialogDescription>
          {selected ? (
            <img
              src={selected.url}
              alt={selected.name}
              className="max-h-[70dvh] w-full object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
