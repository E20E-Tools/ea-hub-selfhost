import { Button } from "./ui/button";
import { useLanguage } from "@/lib/language";
import type { DraftStatus } from "@/lib/request-draft";

export function RequestDraftControls({
  status,
  includePersonal,
  onPersonalChange,
  onClear,
}: {
  status: DraftStatus;
  includePersonal: boolean;
  onPersonalChange: (value: boolean) => void;
  onClear: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="bx-draft">
      <p>{status === "unavailable" ? t("bxDraftUnavailable") : t("bxDraftSession")}</p>
      {status !== "unavailable" && (
        <label>
          <input
            type="checkbox"
            checked={includePersonal}
            disabled={status === "loading"}
            onChange={(event) => onPersonalChange(event.target.checked)}
          />
          <span>{t("bxDraftOptIn")}</span>
        </label>
      )}
      <div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {t("bxDraftClear")}
        </Button>
      </div>
    </div>
  );
}

export function RequestReview({ items }: { items: { label: string; value: string }[] }) {
  const { t } = useLanguage();
  return (
    <section className="bx-panel bx-review" aria-labelledby="request-review-title">
      <h2 id="request-review-title">{t("bxReviewTitle")}</h2>
      <p>{t("bxReviewBody")}</p>
      <dl>
        {items
          .filter((item) => item.value.trim())
          .map((item) => (
            <div key={item.label} className="contents">
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="request-error mt-1" role="alert">
      {message}
    </p>
  ) : null;
}
