import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import type { Product } from "@/lib/catalog";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  archyBoardTourEligible,
  useArchyBoardTour,
} from "./use-archy-board-tour";
import { themedLogo } from "../theme-art";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import {
  boardCentres,
  cableAt,
  cableJoints,
  chipCode,
  cubicPath,
  legacyFileName,
  legacyKind,
  morphAt,
  sliderKey,
  restPosition,
  TB_REST,
  tbBoard,
  transformPercent,
  type Box,
} from "./model";

const DEMO_KEY = "e20e-tb-demo";
/** The board builds itself once per session, then sweeps on its own if nothing is touched. */
const BOOT_KEY = "e20e-tb-boot";
const IDLE_MS = 6000;
const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
const useIsoLayout =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
/** Band heights (px) above and below the board plane: world labels on top, grip below. */
const BANDS = {
  desktop: { top: 44, bottom: 78 },
  mobile: { top: 40, bottom: 48 },
};

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

/** Lets long joke filenames wrap after "_", "." or "\\" instead of mid-word. */
function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[_.\\ ])/);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 ? <wbr /> : null}
        </span>
      ))}
    </>
  );
}

function FileIcon({ kind }: { kind: ReturnType<typeof legacyKind> }) {
  const color = {
    sheet: "#3c7a3c",
    doc: "#3a5aa0",
    diagram: "#6b4fa0",
    mail: "#a07a2a",
    folder: "#b39a4a",
  }[kind];
  return (
    <svg viewBox="0 0 24 28" className="tb-file-icon" aria-hidden="true">
      {kind === "folder" ? (
        <path
          d="M1 7h8l2 3h12v16H1z"
          fill="#d8c67a"
          stroke="#4a4536"
          strokeWidth="1.5"
        />
      ) : (
        <>
          <path
            d="M2 1h14l6 6v20H2z"
            fill="#f2efe6"
            stroke="#4a4536"
            strokeWidth="1.5"
          />
          <path d="M16 1v6h6" fill="none" stroke="#4a4536" strokeWidth="1.5" />
          <rect x="5" y="14" width="14" height="8" fill={color} />
        </>
      )}
    </svg>
  );
}

function CardBody({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  return (
    <div className="tb-card-body">
      <strong className="tb-card-name" dir="ltr">
        {product.name}
      </strong>
      <span className="tb-card-cat">{product.label}</span>
      <p
        className="tb-card-status"
        data-soon={facts.available ? undefined : ""}
      >
        <i aria-hidden="true" />
        <span>
          {facts.status}
          {facts.launch ? ` · ${facts.launch}` : ""}
          {facts.countdown ? ` · ${facts.countdown}` : ""}
        </span>
      </p>
      <p className="tb-card-desc">{product.description}</p>
      {facts.features.length ? (
        <ul className="tb-card-features">
          {facts.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <p className="tb-card-before">
        {fill(t("ldBefore"), "")}
        <s dir="ltr">{legacyFileName(product)}</s>
      </p>
      <InspectorActions
        product={product}
        className="tb-card-actions"
        details={t("details")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

export default function TransformationBoardStage({
  products,
  settings,
}: StageProps) {
  const { t, dir } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const vertical = mobile;
  const band = mobile ? BANDS.mobile : BANDS.desktop;
  const list = useMemo(() => products.slice(0, 12), [products]);
  const board = useMemo(
    () => tbBoard(list.length, mobile),
    [list.length, mobile],
  );
  const inspector = useProductInspector();
  const [size, setSize] = useState({ w: 1000, h: 740 });
  // null = resting position (computed from the layout so no product is caught mid-morph).
  const [p, setP] = useState<number | null>(null);
  const [out, setOut] = useState(0);
  const [hot, setHot] = useState<string | null>(null);
  const [converting, setConverting] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const demo = useRef<number | null>(null);
  const dragging = useRef(false);
  // Once the visitor moves the handle, scrolling never drifts it again.
  const userMoved = useRef(false);
  const restRef = useRef(TB_REST);
  const [draggingNow, setDraggingNow] = useState(false);
  const [booting, setBooting] = useState(false);
  const bootLine = useRef<HTMLSpanElement>(null);
  const idle = useRef<number | null>(null);
  const settle = useRef<number | null>(null);
  // Stop clicks and "Play" glide the handle; the whole journey is a chain of glides.
  const travel = useRef<number | null>(null);
  const [gliding, setGliding] = useState(false);
  const [powering, setPowering] = useState<string[]>([]);
  const prevOn = useRef<Set<string>>(new Set());
  const hRef = useRef(TB_REST);
  const [tourPending, setTourPending] = useState(false);

  // Prime Legacy before the first paint; the bootstrap hides the SSR middle state until this commits.
  useIsoLayout(() => {
    const html = document.documentElement;
    let reveal = 0;
    let revealFrame = 0;
    const clearFlags = () => {
      delete html.dataset["archyTourPending"];
      delete html.dataset["archyTourLegacy"];
      html.style.removeProperty("--archy-tour-board-opacity");
    };
    if (archyBoardTourEligible(settings, motion.animate)) {
      setTourPending(true);
      setP(1);
      setOut(0);
      html.dataset["archyTourLegacy"] = "";
      // A frame after the Legacy layout commit, reveal through the inline custom property.
      // Unlike an attribute, hydration cannot remove this bootstrap protection early.
      revealFrame = requestAnimationFrame(() => {
        html.style.setProperty("--archy-tour-board-opacity", "1");
        reveal = window.setTimeout(clearFlags, 220);
      });
    } else {
      clearFlags();
    }
    return () => {
      cancelAnimationFrame(revealFrame);
      window.clearTimeout(reveal);
      clearFlags();
    };
    // Mount-only: later settings or motion changes must not reset a visitor's handle.
  }, []);

  // First sight of the board this session: traces draw themselves, cards power on, the core assembles.
  useEffect(() => {
    if (!motion.animate) {
      setBooting(false);
      return;
    }
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(BOOT_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (seen) return;
    setBooting(true);
    const full = t("tbBootStatus");
    const t0 = performance.now();
    const dur = 2200 / motion.scale;
    let raf = 0;
    const step = (now: number) => {
      const e = Math.max(0, Math.min(1, (now - t0) / dur));
      if (bootLine.current)
        bootLine.current.textContent = full.slice(
          0,
          Math.round(full.length * e),
        );
      if (e >= 1) {
        setBooting(false);
        try {
          window.sessionStorage.setItem(BOOT_KEY, "1");
        } catch {
          /* storage blocked */
        }
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion.animate, motion.scale]);

  useEffect(
    () => () => {
      if (settle.current) cancelAnimationFrame(settle.current);
      if (travel.current) cancelAnimationFrame(travel.current);
    },
    [],
  );

  useEffect(() => {
    const el = boardEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.offsetWidth, h: el.offsetHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Idle sweep: if the visitor touches nothing for 6s, the board shows itself once per session.
  useEffect(() => {
    if (archyBoardTourEligible(settings, motion.animate)) {
      try {
        window.sessionStorage.setItem(DEMO_KEY, "1");
      } catch {
        /* storage blocked */
      }
      return;
    }
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(DEMO_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (seen || !motion.animate) return setP(null);
    const markSeen = () => {
      try {
        window.sessionStorage.setItem(DEMO_KEY, "1");
      } catch {
        /* storage blocked */
      }
    };
    const sweep = () => {
      idle.current = null;
      const t0 = performance.now() + 450;
      const ease = (x: number) =>
        x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
      const step = (now: number) => {
        const e = now - t0;
        if (e < 0) setP(0.94);
        else if (e < 1800) setP(0.94 - ease(e / 1800) * 0.88);
        else if (e < 2700)
          setP(0.06 + ease((e - 1800) / 900) * (restRef.current - 0.06));
        else {
          demo.current = null;
          markSeen();
          return setP(null);
        }
        demo.current = requestAnimationFrame(step);
      };
      demo.current = requestAnimationFrame(step);
    };
    idle.current = window.setTimeout(sweep, IDLE_MS);
    return () => {
      if (idle.current) window.clearTimeout(idle.current);
      idle.current = null;
      if (demo.current) cancelAnimationFrame(demo.current);
    };
  }, [motion.animate, settings]);
  const stopDemo = () => {
    if (idle.current) {
      window.clearTimeout(idle.current);
      idle.current = null;
      try {
        window.sessionStorage.setItem(DEMO_KEY, "1");
      } catch {
        /* storage blocked */
      }
    }
    if (!demo.current) return;
    cancelAnimationFrame(demo.current);
    demo.current = null;
    try {
      window.sessionStorage.setItem(DEMO_KEY, "1");
    } catch {
      /* storage blocked */
    }
  };

  // Scroll drift toward fully digital as the stage leaves the viewport, until the visitor drags.
  useEffect(() => {
    if (!motion.animate || tourPending) return setOut(0);
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (userMoved.current || tourPending) return;
        const r = root.current?.getBoundingClientRect();
        if (!r) return;
        setOut(
          Math.max(
            0,
            Math.min(1, (-r.top - r.height * 0.25) / (r.height * 0.55)),
          ),
        );
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(raf);
    };
  }, [motion.animate, tourPending]);

  // Position of each board box along the split axis (0 = reading start), in whole-board terms.
  const us = boardCentres(board, list.length, {
    vertical,
    rtl,
    width: size.w,
    height: size.h,
    top: band.top,
  });
  const uOf = (box: Box) =>
    box === board.core ? us[0]! : us[1 + board.chips.indexOf(box)]!;
  const BAND = 0.04; // morph band half-width around the handle
  const rest = restPosition(us, TB_REST, BAND + 0.012);
  restRef.current = rest;
  const h = (p ?? rest) * (1 - out); // handle position from the reading start
  hRef.current = h;
  const value = transformPercent(h);
  const coreM = morphAt(uOf(board.core), h, BAND);
  const items = list.map((product, i) => {
    const box = board.chips[i]!;
    const cable = board.cables[i]!;
    const m = morphAt(uOf(box), h, BAND);
    const pts = cableAt(cable, m);
    return {
      product,
      box,
      cable,
      m,
      pts,
      d: cubicPath(pts),
      name: legacyFileName(product),
    };
  });

  const stopTravel = () => {
    if (travel.current) cancelAnimationFrame(travel.current);
    travel.current = null;
    setGliding(false);
  };
  const takeOver = () => {
    stopDemo();
    if (settle.current) {
      cancelAnimationFrame(settle.current);
      settle.current = null;
    }
    userMoved.current = true;
    setOut(0);
  };
  /** Eased glide of the handle (requestAnimationFrame, like the elastic settle). Instant with motion off. */
  const glide = (to: number, ms: number, done?: () => void) => {
    if (travel.current) cancelAnimationFrame(travel.current);
    const from = Number.isFinite(hRef.current) ? hRef.current : restRef.current;
    if (!motion.animate || Math.abs(to - from) < 0.002) {
      travel.current = null;
      setP(to);
      done?.();
      return;
    }
    setGliding(true);
    const t0 = performance.now();
    const dur = ms / motion.scale;
    const step = (now: number) => {
      const e = Math.min(1, (now - t0) / dur);
      setP(from + (to - from) * easeInOut(e));
      if (e < 1) travel.current = requestAnimationFrame(step);
      else {
        travel.current = null;
        setGliding(false);
        done?.();
      }
    };
    travel.current = requestAnimationFrame(step);
  };
  useArchyBoardTour({
    root,
    board: boardEl,
    motion,
    mobile,
    settings,
    booting,
    glide,
    getHandle: () => hRef.current,
    takeOver,
    stopTravel,
    onPendingChange: setTourPending,
  });
  // Chips turning digital during a glide power on (rise, scale and un-blur); dragging stays immediate.
  const onKeyIds = items.filter((it) => it.m > 0.5).map((it) => it.product.id);
  const onSig = onKeyIds.join("|");
  useEffect(() => {
    const now = new Set(onKeyIds);
    const fresh = onKeyIds.filter((id) => !prevOn.current.has(id));
    prevOn.current = now;
    if (!gliding || !motion.animate || !fresh.length) return;
    setPowering((cur) => [...cur, ...fresh]);
    const timer = window.setTimeout(
      () => setPowering((cur) => cur.filter((id) => !fresh.includes(id))),
      700 / motion.scale,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSig]);

  const setFromPointer = (e: RPointerEvent) => {
    const r = boardEl.current?.getBoundingClientRect();
    if (!r) return;
    const raw = vertical
      ? (e.clientY - r.top) / r.height
      : (e.clientX - r.left) / r.width;
    userMoved.current = true;
    if (settle.current) {
      cancelAnimationFrame(settle.current);
      settle.current = null;
    }
    setP(Math.max(0, Math.min(1, vertical || !rtl ? raw : 1 - raw)));
    setOut(0);
  };

  // Letting go of the grip settles the board elastically onto the nearest spot where nothing is mid-morph.
  const release = () => {
    dragging.current = false;
    setDraggingNow(false);
    // The handle stays exactly where the visitor lets go.
  };

  const moveHandle = (next: number) => {
    stopDemo();
    stopTravel();
    userMoved.current = true;
    setOut(0);
    setP(1 - next / 100);
  };
  const onKey = (e: KeyboardEvent) => {
    const next = sliderKey(value, e.key, { rtl, vertical });
    if (next === null) return;
    e.preventDefault();
    moveHandle(next);
  };

  const [dock, setDock] = useState<"left" | "right">("right");
  const openFrom = (
    product: Product,
    el: HTMLElement,
    box: Box,
    legacy: boolean,
  ) => {
    if (inspector.openId === product.id) return inspector.close();
    // Dock the card on the half of the board away from the clicked chip.
    setDock(box.x + box.w / 2 < board.w / 2 ? "right" : "left");
    if (!legacy || !motion.animate) return inspector.open(product.id, el);
    setConverting({ from: legacyFileName(product), to: product.name });
    window.setTimeout(() => {
      setConverting(null);
      inspector.open(product.id, el);
    }, 800);
  };

  const pct = (v: number) => `${v * 100}%`;
  const glitch = (m: number) => (m > 0.04 && m < 0.96 ? "" : undefined);
  const clipLegacy = vertical
    ? `inset(0 0 ${pct(1 - h)} 0)`
    : rtl
      ? `inset(0 0 0 ${pct(1 - h)})`
      : `inset(0 ${pct(1 - h)} 0 0)`;
  const clipDigital = vertical
    ? `inset(${pct(h)} 0 0 0)`
    : rtl
      ? `inset(0 ${pct(h)} 0 0)`
      : `inset(0 0 0 ${pct(h)})`;
  const physX = rtl ? 1 - h : h; // handle position from the physical left
  const handlePos: CSSProperties = vertical
    ? { top: pct(h) }
    : { left: pct(physX) };
  // Soft colour seam on each side of the handle so the board shifts from beige to white gradually.
  const legacyBefore = vertical || !rtl; // legacy lies physically before the handle (left / top)
  const seam = (legacy: boolean): CSSProperties => {
    const before = legacy === legacyBefore;
    const at = vertical ? h : physX;
    const span = 0.08;
    const start = before ? at - span : at;
    return vertical
      ? {
          top: pct(start),
          height: pct(span),
          left: 0,
          right: 0,
          ["--seam-dir" as string]: before ? "180deg" : "0deg",
        }
      : {
          left: pct(start),
          width: pct(span),
          top: 0,
          bottom: 0,
          ["--seam-dir" as string]: before ? "90deg" : "270deg",
        };
  };
  const boxStyle = (b: Box): CSSProperties => ({
    left: pct(b.x / board.w),
    top: pct(b.y / board.h),
    width: pct(b.w / board.w),
    height: pct(b.h / board.h),
  });
  const legacySide = rtl ? "right" : "left";
  const digitalSide = rtl ? "left" : "right";
  const openItem = items.find((x) => x.product.id === inspector.openId) ?? null;
  const pulses =
    motion.intensity === "low" ? 1 : motion.intensity === "high" ? 3 : 2;
  // Keep the grip fully inside the board at the extremes (the divider line still reaches the edge).
  const edgeShift = (at: number, total: number, r: number) =>
    Math.max(r + 4 - at, 0) - Math.max(at - (total - r - 4), 0);
  const gripShift = vertical
    ? edgeShift(h * size.h, size.h, 22)
    : edgeShift(physX * size.w, size.w, 26);
  return (
    <div
      ref={root}
      className="tb-stage"
      data-mobile={mobile ? "" : undefined}
      data-static={motion.animate ? undefined : ""}
      data-focus={hot ?? undefined}
      data-boot={booting ? "" : undefined}
      style={{ ["--tb-speed" as string]: String(motion.scale) }}
    >
      <div
        ref={boardEl}
        className="tb-board"
        dir="ltr"
        role="group"
        aria-label={t("stageProductsLabel")}
        data-dragging={draggingNow ? "" : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest(".tb-grip"))
            return;
          stopDemo();
          stopTravel();
          dragging.current = true;
          setDraggingNow(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && setFromPointer(e)}
        onPointerUp={release}
        onPointerCancel={release}
        style={{
          ["--tb-top" as string]: `${band.top}px`,
          ["--tb-bottom" as string]: `${band.bottom}px`,
        }}
      >
        <div
          className="tb-spacer"
          style={{ aspectRatio: `${board.w} / ${board.h}` }}
        />

        {/* Legacy board */}
        <div className="tb-layer tb-legacy" style={{ clipPath: clipLegacy }}>
          <div className="tb-legacy-bg" />
          <div className="tb-seam tb-seam-legacy" style={seam(true)} />
          <p
            className="tb-world tb-world-legacy"
            data-side={vertical ? "start" : legacySide}
            dir={dir}
          >
            {t("ldLegacy")}
          </p>
          <div className="tb-plane">
            <svg
              viewBox={`0 0 ${board.w} ${board.h}`}
              className="tb-svg"
              aria-hidden="true"
            >
              {items.map((it) => {
                const end = it.pts[it.pts.length - 1]!;
                return (
                  <g key={it.product.id} className="tb-mess">
                    <path d={it.d} className="tb-cable-old" />
                    {cableJoints(it.pts).map(([x, y], k) => (
                      <circle
                        key={k}
                        cx={x}
                        cy={y}
                        r={4.5}
                        className="tb-burnt"
                        style={{ opacity: 1 - it.m }}
                      />
                    ))}
                    <rect
                      x={end[0] - 5}
                      y={end[1] - 4}
                      width={10}
                      height={8}
                      rx={1.5}
                      className="tb-plug"
                      style={{ opacity: 1 - it.m }}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Digital board */}
        <div className="tb-layer tb-digital" style={{ clipPath: clipDigital }}>
          <div className="tb-digital-bg" />
          <div className="tb-seam tb-seam-digital" style={seam(false)} />
          <p
            className="tb-world tb-world-digital"
            data-side={vertical ? "end" : digitalSide}
            dir={dir}
          >
            {t("tbDigital")}
          </p>
          <div className="tb-plane">
            <svg
              viewBox={`0 0 ${board.w} ${board.h}`}
              className="tb-svg"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id="tb-grad"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2={board.w}
                  y2={board.h}
                >
                  <stop offset="0" stopColor="#2F6BFF" />
                  <stop offset="0.5" stopColor="#00D4FF" />
                  <stop offset="1" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
              {board.bus ? <path d={board.bus} className="tb-bus" /> : null}
              {items.map((it, i) => {
                const state = hot
                  ? hot === it.product.id
                    ? "hot"
                    : "dim"
                  : "on";
                const viaOpacity = Math.max(0, (it.m - 0.8) / 0.2);
                return (
                  <g
                    key={it.product.id}
                    className="tb-trace"
                    data-state={state}
                    data-soon={it.product.comingSoon ? "" : undefined}
                    style={{ opacity: it.m, ["--i" as string]: i }}
                  >
                    <path d={it.d} className="tb-trace-line" pathLength={100} />
                    {it.cable.vias.map(([x, y], k) => (
                      <circle
                        key={k}
                        cx={x}
                        cy={y}
                        r={4}
                        className="tb-via"
                        style={{ opacity: viaOpacity }}
                      />
                    ))}
                    {it.m > 0.6
                      ? Array.from({ length: pulses }, (_, k) => (
                          <path
                            key={k}
                            d={it.d}
                            pathLength={100}
                            className="tb-pulse"
                            style={{
                              animationDelay: `${(k * 1.3 + i * 0.41) / motion.scale}s`,
                              animationDuration: `${(2.4 + i * 0.33) / motion.scale}s`,
                            }}
                          />
                        ))
                      : null}
                    {it.m > 0.6 ? (
                      <>
                        <path
                          d={it.d}
                          pathLength={100}
                          className="tb-trail"
                          style={{
                            animationDelay: `${(i * 0.55) / motion.scale}s`,
                          }}
                        />
                        <path
                          d={it.d}
                          pathLength={100}
                          className="tb-packet"
                          style={{
                            animationDelay: `${(0.6 + i * 0.47) / motion.scale}s`,
                          }}
                        />
                      </>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Products and the core are not clipped: each one morphs as the handle passes its centre. */}
        <div className="tb-plane tb-items">
          <div
            className="tb-crt"
            data-glitch={glitch(coreM)}
            style={{ ...boxStyle(board.core), ["--m" as string]: coreM }}
            aria-hidden="true"
          >
            <div className="tb-crt-bar">
              <span>E20E.EXE</span> <b>({t("ldNotResponding")})</b>
            </div>
            <div className="tb-crt-screen">
              <pre>
                {`C:\\EA> dir\n${list.length} FILE(S)\nC:\\EA> run e20e ...`}
                <span className="tb-caret">█</span>
              </pre>
            </div>
          </div>
          {items.map((it) => (
            <button
              key={it.product.id}
              type="button"
              className="tb-file"
              data-glitch={glitch(it.m)}
              data-off={it.m > 0.5 ? "" : undefined}
              style={{ ...boxStyle(it.box), ["--m" as string]: it.m }}
              tabIndex={it.m > 0.5 ? -1 : 0}
              aria-label={`${it.name} → ${it.product.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) =>
                openFrom(it.product, e.currentTarget, it.box, true)
              }
            >
              <FileIcon kind={legacyKind(it.name)} />
              <span dir="ltr">
                <Breakable text={it.name} />
              </span>
            </button>
          ))}
          <div
            className="tb-core"
            style={{ ...boxStyle(board.core), ["--m" as string]: coreM }}
            aria-hidden="true"
          >
            <span className="tb-core-ring" />
            {settings.logoUrl ? (
              <img
                src={themedLogo("transformation-board", settings.logoUrl)}
                alt=""
                className="tb-core-logo"
              />
            ) : null}
            <strong>{settings.displayTitle.toUpperCase()}</strong>
            {settings.tagline ? (
              <small dir={dir}>{settings.tagline}</small>
            ) : null}
          </div>
          {items.map((it, i) => {
            const id = it.product.id;
            return (
              <button
                key={id}
                type="button"
                className="tb-chip"
                data-soon={it.product.comingSoon ? "" : undefined}
                data-selected={inspector.openId === id ? "" : undefined}
                data-off={it.m > 0.5 ? undefined : ""}
                data-power={powering.includes(id) ? "" : undefined}
                style={{
                  ...boxStyle(it.box),
                  ["--m" as string]: it.m,
                  ["--i" as string]: i,
                }}
                tabIndex={it.m > 0.5 ? 0 : -1}
                aria-label={`${it.product.name} — ${it.product.label} — ${it.product.comingSoon ? t("comingSoonBadge") : t("inspectorAvailable")}`}
                aria-expanded={inspector.openId === id}
                onPointerEnter={() => setHot(id)}
                onPointerLeave={(e) => {
                  setHot(null);
                  const s = e.currentTarget.style;
                  s.removeProperty("--rx");
                  s.removeProperty("--ry");
                }}
                onFocus={() => setHot(id)}
                onBlur={() => setHot(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) =>
                  openFrom(it.product, e.currentTarget, it.box, false)
                }
              >
                <span className="tb-sheen" aria-hidden="true" />
                <span className="tb-led" aria-hidden="true" />
                <span className="tb-code">{chipCode(it.product)}</span>
                <span className="tb-sub" dir={dir}>
                  {it.product.label}
                </span>
                {it.product.comingSoon ? (
                  <span className="tb-stamp" aria-hidden="true" dir={dir}>
                    {t("lbUnderConstruction")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="tb-handle" style={handlePos}>
          <div
            className="tb-grip"
            style={{
              transform: vertical
                ? `translateY(${gripShift}px)`
                : `translateX(${gripShift}px)`,
            }}
            role="slider"
            tabIndex={0}
            aria-label={t("ldSlider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={`${value}%`}
            aria-orientation={vertical ? "vertical" : "horizontal"}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              stopDemo();
              stopTravel();
              dragging.current = true;
              setDraggingNow(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              setFromPointer(e);
            }}
            onPointerMove={(e) => dragging.current && setFromPointer(e)}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <span aria-hidden="true">{vertical ? "⇕" : "⟷"}</span>
          </div>
          {draggingNow && !vertical ? (
            <span className="tb-drag-pct" dir="ltr" aria-hidden="true">
              {value}%
            </span>
          ) : null}
        </div>
        {!vertical ? (
          <span
            className="tb-drag-label"
            style={{ left: `clamp(84px, ${pct(physX)}, calc(100% - 84px))` }}
            dir={dir}
            aria-hidden="true"
          >
            {t("ldDrag")}
          </span>
        ) : null}
        {booting && !vertical ? (
          <p className="tb-bootline tb-status" dir={dir} aria-hidden="true">
            <span ref={bootLine} />
          </p>
        ) : null}

        {converting ? (
          <div className="tb-converting" role="status">
            <span>{t("ldConverting")}</span>
            <code dir="ltr">
              <s>{converting.from}</s> → <b>{converting.to}</b>
            </code>
          </div>
        ) : null}
      </div>

      <div className="tb-readout" dir={dir} aria-hidden="true">
        <span>{t("ldProgress")}</span>
        <b dir="ltr">{value}%</b>
        <i style={{ ["--v" as string]: value / 100 } as CSSProperties} />
        {vertical ? <small>{t("ldDrag")}</small> : null}
      </div>

      {openItem ? (
        <div className="tb-inspect-wrap" data-dock={dock}>
          <InspectorPanel
            product={openItem.product}
            className="tb-card"
            onClose={inspector.close}
            title={
              <span dir="ltr">{`chip.inspect("${openItem.product.id}")`}</span>
            }
          >
            <CardBody product={openItem.product} />
          </InspectorPanel>
        </div>
      ) : null}
    </div>
  );
}
