/** Unsaved-changes handling for the admin console: dirty tracking, leave guard, drafts and the save bar. */
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
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { useAdminCopy } from "./ui-copy";
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
      JSON.stringify(current.value ?? null) ===
      JSON.stringify(current.base ?? null)
        ? { base: saved, value: saved }
        : { base: saved, value: current.value },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const { base, value } = state;
  const dirty =
    value !== undefined &&
    JSON.stringify(value) !== JSON.stringify(base ?? null);
  useEffect(() => {
    setDirty(id, dirty);
    return () => setDirty(id, false);
  }, [dirty, id, setDirty]);

  return {
    value,
    setValue: (next: T | ((current: T) => T)) =>
      setState((current) => ({
        ...current,
        value:
          typeof next === "function"
            ? (next as (c: T) => T)(current.value as T)
            : next,
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
        if (latest.current.dirty && !latest.current.busy)
          latest.current.onSave();
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
      <span className="flex-1 text-sm font-medium text-foreground">
        {t("unsavedChanges")}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={onDiscard}
      >
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

export function useStableCallback<T extends (...args: never[]) => unknown>(
  fn: T,
): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args) => ref.current(...args)) as T, []);
}
