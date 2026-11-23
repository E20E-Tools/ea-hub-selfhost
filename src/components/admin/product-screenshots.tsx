import { useRef } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_SCREENSHOTS,
  isScreenshotUrl,
  type Screenshot,
} from "@/lib/beneficiary-metadata";
import { useImageUpload } from "./media";
import { BilingualField, Card, useAdminCopy, useAssetUrl } from "./ui";

function Preview({ url, alt }: { url: string; alt: string }) {
  const src = useAssetUrl(isScreenshotUrl(url) ? url : "");
  return src ? (
    <img
      src={src}
      alt={alt}
      className="h-20 w-32 rounded-md border object-cover"
    />
  ) : (
    <div className="grid h-20 w-32 place-items-center rounded-md border bg-muted text-muted-foreground">
      <ImagePlus className="size-5" aria-hidden />
    </div>
  );
}

/** Edits the screenshots shown on the product page (stored in beneficiary_details). */
export function ProductScreenshotsField({
  value,
  onChange,
}: {
  value: Screenshot[];
  onChange: (value: Screenshot[]) => void;
}) {
  const { t } = useAdminCopy();
  const upload = useImageUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const update = (index: number, patch: Partial<Screenshot>) =>
    onChange(
      value.map((shot, i) => (i === index ? { ...shot, ...patch } : shot)),
    );
  const move = (index: number, step: -1 | 1) => {
    const next = [...value];
    const target = index + step;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  const full = value.length >= MAX_SCREENSHOTS;
  return (
    <Card
      title={t("productShots")}
      description={t("productShotsHint", { max: MAX_SCREENSHOTS })}
    >
      <div className="grid gap-4">
        {value.map((shot, index) => (
          <div key={index} className="grid gap-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-start gap-3">
              <Preview
                url={shot.url}
                alt={shot.caption.en || shot.caption.ar}
              />
              <label className="grid min-w-0 flex-1 gap-1 text-sm">
                <span className="font-medium">{t("productShotUrl")}</span>
                <Input
                  dir="ltr"
                  value={shot.url}
                  onChange={(event) =>
                    update(index, { url: event.target.value.trim() })
                  }
                  aria-invalid={shot.url !== "" && !isScreenshotUrl(shot.url)}
                />
                {shot.url !== "" && !isScreenshotUrl(shot.url) && (
                  <span className="text-xs text-destructive">
                    {t("productShotUrlInvalid")}
                  </span>
                )}
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("productShotUp")}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("productShotDown")}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("productShotRemove")}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <BilingualField
              label={t("productShotCaption")}
              ar={shot.caption.ar}
              en={shot.caption.en}
              maxLength={160}
              onChange={(caption) => update(index, { caption })}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const path = await upload(file, "products");
              if (path)
                onChange([
                  ...value,
                  { url: path, caption: { ar: "", en: "" } },
                ]);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={full}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {t("productShotUpload")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={full}
            onClick={() =>
              onChange([...value, { url: "", caption: { ar: "", en: "" } }])
            }
          >
            {t("productShotAddLink")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
