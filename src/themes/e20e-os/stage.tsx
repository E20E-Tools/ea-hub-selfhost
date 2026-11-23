import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AppWindow,
  Map as MapIcon,
  Banknote,
  Boxes,
  Lightbulb,
  Network,
  Radar,
  Terminal as TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import type { Product } from "@/lib/catalog";
import { fill, fill2 } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import { InspectorActions, useInspectorFacts } from "../product-inspector";
import { countdownParts, launchInstant } from "../launch";
import { appGradient, markBooted, shouldBoot } from "./boot";
import { completeCommand, runCommand } from "./terminal";

const TERMINAL = "__terminal";
const GLYPHS: Record<string, LucideIcon> = {
  architecture: Network,
  technology: Radar,
  platform: Boxes,
  innovation: Lightbulb,
  finance: Banknote,
  cost: Banknote,
};
/** Known suite tools keep a recognisable glyph; anything new falls back to its category. */
const TOOL_GLYPHS: Record<string, LucideIcon> = {
  landscape: MapIcon,
  apm: MapIcon,
  radar: Radar,
  archone: Network,
  platform: Boxes,
  innovation: Lightbulb,
  itfm: Banknote,
};
function glyphFor(p: Product): LucideIcon {
  return TOOL_GLYPHS[p.id] ?? GLYPHS[p.category] ?? AppWindow;
}

function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

function useRiyadhClock(language: string): string {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function shortLaunch(date: string, language: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return date;
  return new Intl.DateTimeFormat(language === "ar" ? "ar-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(at);
}

type Win = {
  id: string;
  x: number;
  y: number;
  z: number;
  minimized: boolean;
  closing: boolean;
  origin: string;
  anim: number;
};

/* ---------------- App icon ---------------- */
function AppIcon({
  product,
  selected,
  tabIndex,
  onSelect,
  onOpen,
  onKey,
  refCb,
}: {
  product: Product;
  selected: boolean;
  tabIndex: number;
  onSelect: () => void;
  onOpen: (el: HTMLElement) => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  refCb: (el: HTMLButtonElement | null) => void;
}) {
  const { t, language } = useLanguage();
  const Glyph = glyphFor(product);
  const touch = useRef(false);
  return (
    <button
      ref={refCb}
      type="button"
      className="os-icon"
      data-selected={selected ? "" : undefined}
      data-soon={product.comingSoon ? "" : undefined}
      tabIndex={tabIndex}
      aria-label={`${product.name} — ${product.label} — ${product.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}`}
      onPointerDown={(e) => {
        touch.current = e.pointerType === "touch";
      }}
      onClick={(e) => (touch.current ? onOpen(e.currentTarget) : onSelect())}
      onDoubleClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(e.currentTarget);
        } else onKey(e);
      }}
      onFocus={onSelect}
    >
      <span className="os-icon-tile" style={{ backgroundImage: appGradient(product.id) }}>
        <Glyph aria-hidden="true" strokeWidth={1.8} />
        {product.comingSoon ? (
          <svg className="os-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="16" />
            <circle cx="20" cy="20" r="16" className="os-ring-arc" pathLength={100} />
          </svg>
        ) : null}
      </span>
      <span className="os-icon-name">{product.name}</span>
      {product.comingSoon ? (
        <span className="os-icon-note">
          {product.publicationDate
            ? fill(t("osLaunchesShort"), shortLaunch(product.publicationDate, language))
            : t("comingSoonBadge")}
        </span>
      ) : null}
    </button>
  );
}

/* ---------------- Window body ---------------- */
function ProductWindowBody({ product }: { product: Product }) {
  const facts = useInspectorFacts(product);
  return (
    <div className="os-win-body">
      {product.image ? (
        <div className="os-win-banner">
          <img src={product.image} alt={product.imageAlt ?? ""} draggable={false} />
        </div>
      ) : null}
      <div className="os-win-content">
        <span className="os-win-cat">{product.label}</span>
        <p className="os-win-desc">{product.description}</p>
        <p className="os-win-status" data-soon={product.comingSoon ? "" : undefined}>
          <i aria-hidden="true" />
          {facts.status}
          {facts.launch ? ` · ${facts.launch}` : ""}
          {facts.countdown ? ` · ${facts.countdown}` : ""}
        </p>
        {facts.features.length ? (
          <ul className="os-win-features">
            {facts.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : null}
        <InspectorActions product={product} className="os-win-actions" />
      </div>
    </div>
  );
}

/* ---------------- Terminal ---------------- */
function TerminalBody({
  products,
  queued,
}: {
  products: Product[];
  queued: { n: number; cmd: string };
}) {
  const { t, language, setLanguage } = useLanguage();
  const [log, setLog] = useState<Array<{ k: number; text: string; cmd?: boolean }>>(() => [
    { k: 0, text: t("osTermWelcome") },
  ]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const seq = useRef(1);
  const input = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const termProducts = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.name,
        label: p.label,
        comingSoon: p.comingSoon,
        publicationDate: p.publicationDate,
      })),
    [products],
  );
  const openRef = useRef<(id: string) => void>(() => {});
  openRef.current = (id) => window.dispatchEvent(new CustomEvent("e20e-os-open", { detail: id }));

  const exec = useCallback(
    (raw: string) => {
      const result = runCommand(raw, { products: termProducts, t, language, now: new Date() });
      if (raw.trim()) {
        history.current = [...history.current.filter((h) => h !== raw.trim()), raw.trim()].slice(
          -40,
        );
      }
      cursor.current = -1;
      if (result.action?.type === "clear") return setLog([]);
      setLog((prev) =>
        [
          ...prev,
          { k: seq.current++, text: raw, cmd: true },
          ...result.lines.map((text) => ({ k: seq.current++, text })),
        ].slice(-200),
      );
      if (result.action?.type === "open") openRef.current(result.action.id);
      if (result.action?.type === "lang") setLanguage(result.action.language);
    },
    [termProducts, t, language, setLanguage],
  );

  useEffect(() => {
    if (queued.n > 0) exec(queued.cmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued.n]);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <div
      className="os-term"
      dir="ltr"
      onClick={() => input.current?.focus({ preventScroll: true })}
    >
      <div
        ref={logRef}
        className="os-term-log"
        role="log"
        aria-live="polite"
        aria-label={t("osTermLog")}
      >
        {log.map((line) =>
          line.cmd ? (
            <div key={line.k}>
              <span className="os-prompt">guest@e20e:~$</span> {line.text}
            </div>
          ) : (
            <div key={line.k} dir="auto">
              {line.text}
            </div>
          ),
        )}
      </div>
      <form
        className="os-term-line"
        onSubmit={(e) => {
          e.preventDefault();
          exec(value);
          setValue("");
        }}
      >
        <label className="os-prompt" htmlFor="os-term-input">
          guest@e20e:~$
        </label>
        <input
          id="os-term-input"
          ref={input}
          value={value}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          aria-label={t("osTermInput")}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && value.trim()) {
              const next = completeCommand(value, termProducts);
              if (next !== value) {
                e.preventDefault();
                setValue(next);
              }
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              const h = history.current;
              if (!h.length) return;
              e.preventDefault();
              let c = cursor.current === -1 ? h.length : cursor.current;
              c = e.key === "ArrowUp" ? Math.max(0, c - 1) : c + 1;
              if (c >= h.length) {
                cursor.current = -1;
                setValue("");
              } else {
                cursor.current = c;
                setValue(h[c] ?? "");
              }
            }
          }}
        />
      </form>
    </div>
  );
}

/* ---------------- Stage ---------------- */
export default function E20eOsStage({ products, settings }: StageProps) {
  const { t, language, setLanguage, dir, arabicAvailable } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const clock = useRiyadhClock(language);
  const list = products.slice(0, 12);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);

  const [selected, setSelected] = useState(0);
  const iconRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dockRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [wins, setWins] = useState<Win[]>([]);
  const zTop = useRef(10);
  const animSeq = useRef(0);
  const [bouncing, setBouncing] = useState<string | null>(null);
  const [queued, setQueued] = useState({ n: 0, cmd: "" });

  /* Boot once per session. */
  const [boot, setBoot] = useState<"pending" | "on" | "done">("pending");
  const bootDecision = useRef<boolean | null>(null);
  useEffect(() => {
    const el = document.documentElement;
    const animate =
      el.dataset["motion"] !== "off" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      store = null;
    }
    // Decide once per mount (StrictMode re-runs effects; the decision must survive that).
    if (bootDecision.current === null) {
      bootDecision.current = shouldBoot({ animate, store });
      if (bootDecision.current) markBooted(store);
    }
    if (!bootDecision.current) return setBoot("done");
    setBoot("on");
    const end = () => setBoot("done");
    const id = window.setTimeout(end, 1800);
    window.addEventListener("keydown", end, { once: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", end);
    };
  }, []);

  /* Notification toast from real data. */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (boot !== "done") return;
    const now = new Date();
    const next = list
      .filter((p) => p.comingSoon)
      .map((p) => ({ p, at: launchInstant(p) }))
      .filter((x): x is { p: Product; at: Date } => Boolean(x.at && x.at > now))
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    const parts = next ? countdownParts(next.at, now) : null;
    const text =
      next && parts
        ? fill2(t("osToastLaunch"), next.p.name, String(parts.days + (parts.hours > 0 ? 1 : 0)))
        : fill(t("osToastTools"), String(list.filter((p) => !p.comingSoon).length));
    const id = window.setTimeout(() => setToast(text), 2600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot, language]);

  /* Window manager. */
  const originFrom = useCallback((el: HTMLElement | null, x: number, y: number) => {
    const base = desk.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!base || !r) return "50% 0%";
    return `${r.left + r.width / 2 - base.left - x}px ${r.top + r.height / 2 - base.top - y}px`;
  }, []);

  const pendingFocus = useRef<string | null>(null);
  const openWin = useCallback(
    (id: string, from: HTMLElement | null) => {
      if (id !== TERMINAL) pendingFocus.current = id;
      setBouncing(id);
      window.setTimeout(() => setBouncing((b) => (b === id ? null : b)), 650);
      setWins((prev) => {
        const z = ++zTop.current;
        const found = prev.find((w) => w.id === id);
        if (found)
          return prev.map((w) =>
            w.id === id
              ? { ...w, z, minimized: false, closing: false, anim: ++animSeq.current }
              : w,
          );
        const base = desk.current?.getBoundingClientRect();
        const width = id === TERMINAL ? 540 : 460;
        const k = prev.filter((w) => !w.closing).length;
        const maxX = Math.max(0, (base?.width ?? 1000) - width - 12);
        const x = Math.min(maxX, (base ? base.width * 0.32 : 260) + k * 30);
        const y = Math.min(Math.max(0, (base?.height ?? 600) - 360), 18 + k * 30);
        return [
          ...prev,
          {
            id,
            x,
            y,
            z,
            minimized: false,
            closing: false,
            origin: originFrom(from, x, y),
            anim: ++animSeq.current,
          },
        ];
      });
    },
    [originFrom],
  );

  // Move focus into a newly opened app window so Esc and Tab work like any dialog.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document
      .querySelector<HTMLElement>(`[data-win-id="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
  }, [wins]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      openWin(id, dockRefs.current[id] ?? null);
    };
    window.addEventListener("e20e-os-open", onOpen);
    return () => window.removeEventListener("e20e-os-open", onOpen);
  }, [openWin]);

  const focusWin = (id: string) =>
    setWins((prev) => {
      const top = prev.reduce((m, w) => Math.max(m, w.z), 0);
      const me = prev.find((w) => w.id === id);
      if (me && me.z === top) return prev;
      const z = ++zTop.current;
      return prev.map((w) => (w.id === id ? { ...w, z } : w));
    });

  const returnFocus = (id: string) => {
    const idx = list.findIndex((p) => p.id === id);
    (idx >= 0 ? iconRefs.current[idx] : dockRefs.current[id])?.focus({ preventScroll: true });
  };

  const closeWin = (id: string, minimize = false) => {
    setWins((prev) =>
      prev.map((w) =>
        w.id === id
          ? { ...w, closing: true, origin: originFrom(dockRefs.current[id] ?? null, w.x, w.y) }
          : w,
      ),
    );
    window.setTimeout(
      () =>
        setWins((prev) =>
          minimize
            ? prev.map((w) => (w.id === id ? { ...w, closing: false, minimized: true } : w))
            : prev.filter((w) => w.id !== id),
        ),
      motion.animate ? 260 : 0,
    );
    returnFocus(id);
  };

  /* Dragging (direct transform writes; React state committed on release). */
  const drag = useRef<{
    id: string;
    el: HTMLElement;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    x: number;
    y: number;
  } | null>(null);
  const onTitleDown = (e: ReactPointerEvent<HTMLElement>, w: Win) => {
    if (mobile || (e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget.closest<HTMLElement>(".os-window");
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: w.id, el, sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y, x: w.x, y: w.y };
    el.dataset["dragging"] = "";
    focusWin(w.id);
  };
  const onTitleMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const base = desk.current;
    if (!d || !base) return;
    const maxX = base.clientWidth - d.el.offsetWidth;
    const maxY = base.clientHeight - 44;
    d.x = Math.max(0, Math.min(maxX, d.ox + e.clientX - d.sx));
    d.y = Math.max(0, Math.min(maxY, d.oy + e.clientY - d.sy));
    d.el.style.transform = `translate3d(${d.x}px, ${d.y}px, 0)`;
  };
  const onTitleUp = () => {
    const d = drag.current;
    if (!d) return;
    delete d.el.dataset["dragging"];
    drag.current = null;
    setWins((prev) => prev.map((w) => (w.id === d.id ? { ...w, x: d.x, y: d.y } : w)));
  };

  /* Swipe-down to close on mobile sheets. */
  const swipe = useRef<{ id: string; el: HTMLElement; sy: number; dy: number } | null>(null);

  /* Dock magnification: rects read once on enter, transforms only. */
  const dockCenters = useRef<Array<{ el: HTMLElement; c: number }>>([]);
  const onDockEnter = () => {
    if (mobile || !motion.animate) return;
    dockCenters.current = Object.values(dockRefs.current)
      .filter((el): el is HTMLButtonElement => Boolean(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, c: r.left + r.width / 2 };
      });
  };
  const onDockMove = (e: ReactPointerEvent) => {
    for (const { el, c } of dockCenters.current) {
      const d = Math.abs(e.clientX - c);
      el.style.setProperty("--m", (1 + 0.42 * Math.max(0, 1 - d / 110)).toFixed(3));
    }
  };
  const onDockLeave = () => {
    for (const { el } of dockCenters.current) el.style.removeProperty("--m");
    dockCenters.current = [];
  };

  /* Parallax wallpaper. */
  const raf = useRef(0);
  const onStageMove = (e: ReactPointerEvent) => {
    if (mobile || !motion.running) return;
    const el = root.current;
    if (!el) return;
    const x = e.clientX;
    const y = e.clientY;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--px", (((x - r.left) / r.width) * 2 - 1).toFixed(3));
      el.style.setProperty("--py", (((y - r.top) / r.height) * 2 - 1).toFixed(3));
    });
  };

  /* Arrow-key navigation between icons. */
  const onIconKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const rows = 4;
    const rtl = dir === "rtl";
    const map: Record<string, number> = mobile
      ? { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 4, ArrowUp: -4 }
      : {
          ArrowDown: 1,
          ArrowUp: -1,
          ArrowRight: rtl ? -rows : rows,
          ArrowLeft: rtl ? rows : -rows,
        };
    const step = map[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(list.length - 1, i + step));
    setSelected(next);
    iconRefs.current[next]?.focus();
  };

  const openHelp = () => {
    openWin(TERMINAL, dockRefs.current[TERMINAL] ?? null);
    setQueued((q) => ({ n: q.n + 1, cmd: "help" }));
  };

  const visible = wins.filter((w) => !w.minimized);
  const running = new Set(wins.filter((w) => !w.closing).map((w) => w.id));
  const dockApps = mobile ? list.slice(0, 3) : list;

  return (
    <div
      ref={root}
      className="os-stage"
      dir={dir}
      data-mobile={mobile ? "" : undefined}
      data-boot={boot}
      onPointerMove={onStageMove}
    >
      <div className="os-wallpaper" aria-hidden="true">
        <i className="os-blob os-blob-a" />
        <i className="os-blob os-blob-b" />
        <i className="os-blob os-blob-c" />
        <i className="os-grain" />
      </div>

      <div className="os-screen">
        {mobile ? (
          <div className="os-statusbar">
            <span className="os-clock" aria-label={t("osClock")}>
              {clock}
            </span>
            <span className="os-status-title">E20E OS</span>
            <button
              type="button"
              className="os-menu-lang"
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            >
              {language === "ar" ? "EN" : "ع"}
            </button>
          </div>
        ) : (
          <div className="os-menubar">
            <span className="os-menu-brand">
              {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : null}
              <strong dir="ltr">{settings.displayTitle}</strong>
            </span>
            <button
              type="button"
              className="os-menu-item"
              onClick={() => iconRefs.current[0]?.focus()}
            >
              {t("osTools")}
            </button>
            <button type="button" className="os-menu-item" onClick={openHelp}>
              {t("osHelp")}
            </button>
            <span className="os-menu-spacer" />
            {arabicAvailable ? (
              <button
                type="button"
                className="os-menu-item"
                onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              >
                {language === "ar" ? "English" : "العربية"}
              </button>
            ) : null}
            <span className="os-clock" aria-label={t("osClock")}>
              {clock}
            </span>
          </div>
        )}

        <div ref={desk} className="os-desktop">
          <div className="os-icons" role="group" aria-label={t("osDesktopLabel")}>
            {list.map((p, i) => (
              <AppIcon
                key={p.id}
                product={p}
                selected={selected === i}
                tabIndex={selected === i ? 0 : -1}
                onSelect={() => setSelected(i)}
                onOpen={(el) => openWin(p.id, el)}
                onKey={(e) => onIconKey(e, i)}
                refCb={(el) => {
                  iconRefs.current[i] = el;
                }}
              />
            ))}
          </div>

          {visible.map((w) => {
            const product = byId.get(w.id);
            const isTerm = w.id === TERMINAL;
            if (!isTerm && !product) return null;
            const title = isTerm ? t("osTerminal") : (product?.name ?? "");
            return (
              <section
                key={w.id}
                className="os-window"
                data-win-id={w.id}
                tabIndex={-1}
                data-term={isTerm ? "" : undefined}
                data-closing={w.closing ? "" : undefined}
                role="dialog"
                aria-label={title}
                style={{ transform: `translate3d(${w.x}px, ${w.y}px, 0)`, zIndex: w.z }}
                onPointerDown={() => focusWin(w.id)}
                onFocusCapture={() => focusWin(w.id)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    closeWin(w.id);
                  }
                }}
              >
                <div key={w.anim} className="os-window-frame" style={{ transformOrigin: w.origin }}>
                  <header
                    className="os-titlebar"
                    onPointerDown={(e) => {
                      if (mobile) {
                        if ((e.target as HTMLElement).closest("button")) return;
                        const el = e.currentTarget.closest<HTMLElement>(".os-window-frame");
                        if (el) {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          swipe.current = { id: w.id, el, sy: e.clientY, dy: 0 };
                        }
                        return;
                      }
                      onTitleDown(e, w);
                    }}
                    onPointerMove={(e) => {
                      if (swipe.current) {
                        swipe.current.dy = Math.max(0, e.clientY - swipe.current.sy);
                        swipe.current.el.style.transform = `translateY(${swipe.current.dy}px)`;
                        return;
                      }
                      onTitleMove(e);
                    }}
                    onPointerUp={() => {
                      const s = swipe.current;
                      if (s) {
                        swipe.current = null;
                        s.el.style.transform = "";
                        if (s.dy > 110) closeWin(s.id);
                        return;
                      }
                      onTitleUp();
                    }}
                    onPointerCancel={onTitleUp}
                  >
                    <span className="os-lights">
                      <button
                        type="button"
                        className="os-light os-light-close"
                        aria-label={`${t("osClose")} ${title}`}
                        onClick={() => closeWin(w.id)}
                      />
                      <button
                        type="button"
                        className="os-light os-light-min"
                        aria-label={`${t("osMinimize")} ${title}`}
                        onClick={() => closeWin(w.id, true)}
                      />
                      <span className="os-light os-light-zoom" aria-hidden="true" />
                    </span>
                    <span className="os-win-title" dir="auto">
                      {title}
                    </span>
                    <span className="os-grabber" aria-hidden="true" />
                  </header>
                  {isTerm ? (
                    <TerminalBody products={list} queued={queued} />
                  ) : product ? (
                    <ProductWindowBody product={product} />
                  ) : null}
                </div>
              </section>
            );
          })}

          {toast ? (
            <div className="os-toast" role="status">
              <span className="os-toast-icon" aria-hidden="true">
                {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : "E"}
              </span>
              <span className="os-toast-text">
                <strong>E20E OS</strong>
                <span>{toast}</span>
              </span>
              <button
                type="button"
                className="os-toast-close"
                aria-label={t("osDismiss")}
                onClick={() => setToast(null)}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>

        <nav
          className="os-dock"
          aria-label={t("osDock")}
          onPointerEnter={onDockEnter}
          onPointerMove={onDockMove}
          onPointerLeave={onDockLeave}
        >
          {dockApps.map((p) => {
            const Glyph = glyphFor(p);
            return (
              <button
                key={p.id}
                ref={(el) => {
                  dockRefs.current[p.id] = el;
                }}
                type="button"
                className="os-dock-item"
                data-bounce={bouncing === p.id ? "" : undefined}
                data-soon={p.comingSoon ? "" : undefined}
                aria-label={p.name}
                title={p.name}
                onClick={(e) => openWin(p.id, e.currentTarget)}
              >
                <span className="os-dock-tile" style={{ backgroundImage: appGradient(p.id) }}>
                  <Glyph aria-hidden="true" strokeWidth={1.8} />
                </span>
                {running.has(p.id) ? <i className="os-run-dot" aria-hidden="true" /> : null}
              </button>
            );
          })}
          <span className="os-dock-sep" aria-hidden="true" />
          <button
            ref={(el) => {
              dockRefs.current[TERMINAL] = el;
            }}
            type="button"
            className="os-dock-item"
            data-bounce={bouncing === TERMINAL ? "" : undefined}
            aria-label={t("osTerminal")}
            title={t("osTerminal")}
            onClick={(e) => openWin(TERMINAL, e.currentTarget)}
          >
            <span className="os-dock-tile os-dock-term">
              <TerminalIcon aria-hidden="true" strokeWidth={1.8} />
            </span>
            {running.has(TERMINAL) ? <i className="os-run-dot" aria-hidden="true" /> : null}
          </button>
        </nav>
      </div>

      {boot === "on" ? (
        <div className="os-boot" role="status" onPointerDown={() => setBoot("done")}>
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="os-boot-logo" />
          ) : (
            <strong className="os-boot-logo">E20E</strong>
          )}
          <span className="os-boot-bar" aria-hidden="true">
            <i />
          </span>
          <span className="os-boot-text">{t("osBooting")}</span>
          <span className="os-boot-skip">{t("osSkipBoot")}</span>
        </div>
      ) : null}
    </div>
  );
}
