import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateAttachments } from "@/lib/suggestion.shared";
import { fill } from "@/lib/copy";
import { useLanguage } from "@/lib/language";

export function RequestImages({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const { t } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return (
    <div className="request-images">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        disabled={disabled}
        aria-label={t("requestAttachImages")}
        onChange={(event) => {
          const next = [...files, ...Array.from(event.target.files ?? [])];
          const issue = validateAttachments(next);
          setError(issue);
          if (!issue) onChange(next);
          event.target.value = "";
        }}
      />
      <div className="request-upload-row">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || files.length >= 3}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={18} />
          {t("requestAttachImages")}
        </Button>
        <span>{t("requestImageFormats")}</span>
      </div>
      {error && (
        <p role="alert" className="request-error">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="request-image-grid">
          {files.map((file, i) => (
            <figure key={`${file.name}-${i}`}>
              <img src={previews[i]} alt={file.name} />
              <figcaption>{file.name}</figcaption>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                title={t("requestDeleteImage")}
                aria-label={fill(t("requestDeleteNamed"), file.name)}
                disabled={disabled}
                onClick={() =>
                  onChange(files.filter((_, index) => index !== i))
                }
              >
                <X size={16} />
              </Button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
