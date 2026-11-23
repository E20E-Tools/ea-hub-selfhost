/** Shared building blocks of the admin console: copy hook, layout pieces, unsaved-changes handling. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Inbox, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { adminText, type AdminCopyKey } from "@/lib/admin-copy";
import { ASSET_BUCKET } from "@/lib/catalog";
import { formatDate } from "@/lib/format-date";
import { useLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";

/* ---------- Copy ---------- */

export function useAdminCopy() {
  const { language, dir, setLanguage } = useLanguage();
  return useMemo(
    () => ({
      language,
      dir,
      setLanguage,
      t: (key: AdminCopyKey | string, vars?: Record<string, string | number>) =>
        adminText(language, key, vars),
      date: (value: string | null | undefined, options?: Intl.DateTimeFormatOptions) =>
        formatDate(value, language, options),
      number: (value: number) =>
        new Intl.NumberFormat(language === "ar" ? "ar" : "en").format(value),
    }),
    [language, dir, setLanguage],
  );
}

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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
      className={cn("min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6", className)}
    >
      {title || description || actions ? (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-base font-semibold text-card-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
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
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
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
        onChange(lang === "ar" ? { ar: event.target.value, en } : { ar, en: event.target.value }),
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
          <p className="text-[11px] text-muted-foreground">{t("missingTranslation")}</p>
        ) : null}
      </div>
    );
  };
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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

export function ErrorBlock({ text, onRetry }: { text?: string; onRetry?: () => void }) {
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

/* ---------- Unsaved changes ---------- */

type DirtyApi = {
  setDirty: (id: string, dirty: boolean) => void;
  isDirty: () => boolean;
  /** Resolves true when it is safe to leave (nothing dirty, or the admin confirmed). */
  confirmLeave: () => Promise<boolean>;
};

const DirtyContext = createContext<DirtyApi>({
  setDirty: () => {},
  isDirty: () => false,
  confirmLeave: async () => true,
});

export function DirtyProvider({ children }: { children: ReactNode }) {
  const forms = useRef(new Set<string>());
  const [confirm, dialog] = useConfirm();
  const { t, dir } = useAdminCopy();

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (forms.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const api = useMemo<DirtyApi>(
    () => ({
      setDirty: (id, dirty) => {
        if (dirty) forms.current.add(id);
        else forms.current.delete(id);
      },
      isDirty: () => forms.current.size > 0,
      confirmLeave: async () => {
        if (forms.current.size === 0) return true;
        const ok = await confirm({
          title: t("leaveTitle"),
          body: t("leaveBody"),
          confirmLabel: t("leaveOk"),
          cancelLabel: t("stay"),
          dir,
        });
        return ok;
      },
    }),
    [confirm, t, dir],
  );

  return (
    <DirtyContext.Provider value={api}>
      {children}
      {dialog}
    </DirtyContext.Provider>
  );
}

export function useLeaveGuard() {
  return useContext(DirtyContext);
}

/**
 * Form state compared against its saved snapshot. Reports dirtiness to the console so
 * navigation can ask before leaving; `reset` adopts a new snapshot after save or reload.
 */
export function useDraft<T>(saved: T | undefined) {
  const id = useId();
  const { setDirty } = useContext(DirtyContext);
  const [state, setState] = useState<{
    base: T | undefined;
    value: T | undefined;
  }>({
    base: saved,
    value: saved,
  });
  const savedKey = JSON.stringify(saved ?? null);

  useEffect(() => {
    // Adopt fresh server data unless the admin is mid-edit.
    setState((current) =>
      JSON.stringify(current.value ?? null) === JSON.stringify(current.base ?? null)
        ? { base: saved, value: saved }
        : { base: saved, value: current.value },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const { base, value } = state;
  const dirty = value !== undefined && JSON.stringify(value) !== JSON.stringify(base ?? null);
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [dirty, id, setDirty]);

  return {
    value,
    setValue: (next: T | ((current: T) => T)) =>
      setState((current) => ({
        ...current,
        value: typeof next === "function" ? (next as (c: T) => T)(current.value as T) : next,
      })),
    dirty,
    discard: () => setState((current) => ({ ...current, value: current.base })),
    reset: (next: T) => setState({ base: next, value: next }),
  };
}

/** Sticky bar shown only while a form is dirty; Ctrl/Cmd+S saves. */
export function SaveBar({
  dirty,
  busy,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { t } = useAdminCopy();
  const latest = useRef({ dirty, busy, onSave });
  latest.current = { dirty, busy, onSave };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (latest.current.dirty && !latest.current.busy) latest.current.onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!dirty) return null;
  return (
    <div
      role="region"
      aria-label={t("unsavedChanges")}
      className="sticky bottom-4 z-30 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
    >
      <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium text-foreground">{t("unsavedChanges")}</span>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
        {t("discard")}
      </Button>
      <Button type="button" size="sm" disabled={busy} onClick={onSave}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        {busy ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

/* ---------- Images ---------- */

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function imageProblem(file: File): AdminCopyKey | null {
  if (!IMAGE_TYPES.includes(file.type)) return "imageInvalid";
  if (file.size > MAX_IMAGE_BYTES) return "imageTooLarge";
  return null;
}

/** Signed preview URL for a stored asset path (or the URL itself when already absolute). */
export function useAssetUrl(raw: string): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    const value = (raw ?? "").trim();
    if (!value) {
      setUrl("");
      return;
    }
    if (/^https?:\/\//i.test(value)) {
      setUrl(value);
      return;
    }
    const path = value.startsWith(`${ASSET_BUCKET}/`)
      ? value.slice(ASSET_BUCKET.length + 1)
      : value.replace(/^\/+/, "");
    void supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [raw]);
  return url;
}

/** Shared select styling for native <select> where a long option list reads better. */
export const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args) => ref.current(...args)) as T, []);
}
