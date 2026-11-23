/** Shared building blocks of the admin console: copy hook, layout pieces and loading/empty/error states. */
import { useId, type ReactNode } from "react";
import { AlertTriangle, Inbox, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useAdminCopy } from "./ui-copy";

/* ---------- Layout ---------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      {title || description || actions ? (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-semibold text-card-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Label + helper text on one side, the control on the other; stacks on narrow screens. */
export function SettingRow({
  label,
  hint,
  htmlFor,
  error,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-foreground"
        >
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="min-w-0">
        {children}
        {error ? <FieldError text={error} /> : null}
      </div>
    </div>
  );
}

export function FieldError({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-1.5 text-xs text-destructive">
      {text}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <FieldError text={error} /> : null}
    </div>
  );
}

export function LangTag({ lang }: { lang: "ar" | "en" }) {
  return (
    <span
      className="rounded border border-border px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted-foreground"
      aria-hidden="true"
    >
      {lang === "ar" ? "AR" : "EN"}
    </span>
  );
}

/**
 * Arabic and English inputs for one content field: side by side on desktop, stacked on
 * mobile, each tagged with its language and direction, with a hint when one side is empty.
 */
export function BilingualField({
  idPrefix,
  label,
  hint,
  ar,
  en,
  onChange,
  multiline = false,
  rows = 3,
  maxLength,
  error,
  requiredAr = false,
}: {
  idPrefix?: string;
  label: string;
  hint?: string;
  ar: string;
  en: string;
  onChange: (next: { ar: string; en: string }) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  error?: string | undefined;
  requiredAr?: boolean;
}) {
  const { t } = useAdminCopy();
  const generatedId = useId();
  const id = idPrefix ?? generatedId;
  const input = (lang: "ar" | "en") => {
    const value = lang === "ar" ? ar : en;
    const props = {
      id: `${id}-${lang}`,
      dir: lang === "ar" ? "rtl" : "ltr",
      lang,
      value,
      maxLength,
      required: lang === "ar" && requiredAr,
      "aria-invalid": lang === "ar" && !!error,
      "aria-describedby": error && lang === "ar" ? id + "-error" : undefined,
      "aria-label": `${label} (${lang === "ar" ? "العربية" : "English"})`,
      className:
        "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
      onChange: (event: { target: { value: string } }) =>
        onChange(
          lang === "ar"
            ? { ar: event.target.value, en }
            : { ar, en: event.target.value },
        ),
    } as const;
    const other = lang === "ar" ? en : ar;
    return (
      <div className="grid min-w-0 gap-1">
        <div className="flex items-center gap-2">
          <LangTag lang={lang} />
        </div>
        {multiline ? (
          <textarea rows={rows} {...props} />
        ) : (
          <input {...props} className={cn(props.className, "h-9")} />
        )}
        {!value.trim() && other.trim() ? (
          <p className="text-[11px] text-muted-foreground">
            {t("missingTranslation")}
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? (
        <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {input("ar")}
        {input("en")}
      </div>
      {error ? (
        <div id={id + "-error"}>
          <FieldError text={error} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------- States ---------- */

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  const { t } = useAdminCopy();
  return (
    <div role="status" aria-label={t("loading")} className="grid gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-5" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBlock({
  text,
  onRetry,
}: {
  text?: string;
  onRetry?: () => void;
}) {
  const { t } = useAdminCopy();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground"
    >
      <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
      <span className="flex-1">{text ?? t("loadFailed")}</span>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}

/** Loading → error (retry) → empty → content, in one place for every list. */
export function QueryState({
  query,
  empty,
  isEmpty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) return <ErrorBlock onRetry={() => void query.refetch()} />;
  if (isEmpty) return <EmptyBlock text={empty} />;
  return <>{children}</>;
}

/** Shared select styling for native <select> where a long option list reads better. */
export const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Split modules, re-exported so existing imports from "./ui" keep working.
export * from "./ui-copy";
export * from "./ui-draft";
export * from "./ui-media";
