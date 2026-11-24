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
import {
  Boxes,
  ChartNoAxesCombined,
  CircuitBoard,
  Layers3,
  Lightbulb,
  Network,
  Radar,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { fill } from "@/lib/copy";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import {
  cubicPath,
  hubLink,
  hubU,
  l2dLayout,
  LEGACY_DESKTOP_FILES,
  legacyFileName,
  legacyKind,
  lerpPoints,
  morphAt,
  sliderKey,
  tangle,
  type Pt,
} from "./model";

const DEMO_KEY = "e20e-l2d-demo";
const REST = 0.4; // handle at 40% from the start = 60% digital

const moduleIcons: Record<string, LucideIcon> = {
  archone: Boxes,
  landscape: Network,
  radar: Radar,
  platform: Layers3,
  innovation: Lightbulb,
  itfm: ChartNoAxesCombined,
};

function x0Edge(x: number, bus: number, edge: number): number {
  return x + (x < bus ? edge : -edge);
}

function useMobile(): boolean {
  // The stage mounts client-side only, so read the query up front instead of flipping layouts after mount.
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches,
  );
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
    <svg viewBox="0 0 24 28" className="ld-file-icon" aria-hidden="true">
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
    <div className="ld-card-body">
      <img src={product.image} alt={product.imageAlt} className="ld-card-img" />
      <strong className="ld-card-name" dir="ltr">
        {product.name}
      </strong>
      <p
        className="ld-card-status"
        data-soon={facts.available ? undefined : ""}
      >
        <i aria-hidden="true" />
        {facts.status}
        {facts.launch ? ` · ${facts.launch}` : ""}
        {facts.countdown ? ` · ${facts.countdown}` : ""}
      </p>
      <p className="ld-card-desc">{product.description}</p>
      {facts.features.length ? (
        <ul className="ld-card-features">
          {facts.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <p className="ld-card-before">
        {fill(t("ldBefore"), "")}
        <s dir="ltr">{legacyFileName(product)}</s>
      </p>
      <InspectorActions
        product={product}
        className="ld-card-actions"
        details={t("details")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

export default function LegacyDigitalStage({ products, settings }: StageProps) {
  const { t, dir } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const vertical = mobile;
  const list = products.slice(0, 12);
  const items = useMemo(
    () => l2dLayout(list.length, vertical),
    [list.length, vertical],
  );
  const inspector = useProductInspector();
  const [size, setSize] = useState({ w: 1200, h: 760 });
  const [p, setP] = useState(REST);
  const [out, setOut] = useState(0);
  const [converting, setConverting] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const demo = useRef<number | null>(null);
  const gripTrack = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; offset: number } | null>(null);
  // Once the visitor moves the handle, scrolling never drifts it again.
  const userMoved = useRef(false);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // Measure before the first paint so items are never drawn at the 1200px default.
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(
      ([e]) =>
        e && setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measured hub box so digital links end exactly on its border (offsetWidth ignores the centring transform).
  const hubRef = useRef<HTMLElement>(null);
  const [hubSize, setHubSize] = useState({ w: 200, h: 140 });
  useEffect(() => {
    const el = hubRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setHubSize({ w: el.offsetWidth, h: el.offsetHeight }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-demo once per session.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(DEMO_KEY) === "1";
    } catch {
      /* storage blocked */
    }
    if (seen || !motion.animate) return setP(REST);
    // Mark the demo as seen only once it has played, so a remount mid-demo replays it.
    const markSeen = () => {
      try {
        window.sessionStorage.setItem(DEMO_KEY, "1");
      } catch {
        /* storage blocked */
      }
    };
    setP(1);
    const t0 = performance.now() + 500;
    const ease = (x: number) =>
      x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
    const step = (now: number) => {
      const e = now - t0;
      if (e < 0) setP(1);
      else if (e < 1600) setP(1 - ease(e / 1600) * 0.96);
      else if (e < 2400) setP(0.04 + ease((e - 1600) / 800) * (REST - 0.04));
      else {
        markSeen();
        return setP(REST);
      }
      demo.current = requestAnimationFrame(step);
    };
    demo.current = requestAnimationFrame(step);
    return () => {
      if (demo.current) cancelAnimationFrame(demo.current);
    };
  }, [motion.animate]);
  const stopDemo = () => {
    if (demo.current) {
      try {
        window.sessionStorage.setItem(DEMO_KEY, "1");
      } catch {
        /* storage blocked */
      }
    }
    if (demo.current) cancelAnimationFrame(demo.current);
    demo.current = null;
  };

  // Scroll bonus: drift toward fully digital as the stage leaves the viewport.
  useEffect(() => {
    if (!motion.animate) return setOut(0);
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (userMoved.current) return;
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
  }, [motion.animate]);

  const h = p * (1 - out); // effective handle position from reading start
  const value = Math.round((1 - h) * 100);
  const W = size.w;
  const H = size.h;
  const toXY = (u: number, c: number): Pt =>
    vertical ? [c * W, u * H] : [(rtl ? 1 - u : u) * W, c * H];
  const hub = toXY(hubU(vertical), vertical ? 0.5 : 0.53);
  const busPos = vertical ? W / 2 : H * 0.53;

  const cables = items.map((it, i) => {
    const [x, y0] = toXY(it.u, it.c);
    const r = tangle(i + 1);
    // Start at the card edge facing the bus so links never cross the card face.
    const edge = vertical ? (mobile ? 76 : 90) : 34;
    const y = vertical ? y0 : y0 + (y0 < busPos ? edge : -edge);
    const xs = vertical ? x0Edge(x, busPos, edge) : x;
    const span = vertical ? W : H;
    let straight: Pt[];
    let messy: Pt[];
    const hubBox = {
      x: hub[0],
      y: hub[1],
      halfW: hubSize.w / 2,
      halfH: hubSize.h / 2,
    };
    if (vertical) {
      const bx = busPos;
      straight = hubLink([x, y0], hubBox, true);
      messy = [
        [xs, y],
        [xs + r[0]! * span * 0.6, y + r[1]! * 140],
        [xs + r[2]! * span * 0.7, y + r[3]! * 160],
        [bx + r[4]! * 70, y + 40 + r[5]! * 60],
      ];
    } else {
      const by = busPos;
      straight = hubLink([x, y0], hubBox, false);
      messy = [
        [x, y],
        [x + r[0]! * 260, y + r[1]! * span * 0.5],
        [x + r[2]! * 300, y + r[3]! * span * 0.6],
        [x + r[4]! * 140, by + 30 + r[5]! * 50],
      ];
    }
    const m = morphAt(it.u, h);
    return {
      d: cubicPath(lerpPoints(messy, straight, m)),
      m,
      end: straight[3]!,
    };
  });

  const startDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    stopDemo();
    const grip = e.currentTarget.getBoundingClientRect();
    const offset = vertical
      ? e.clientY - (grip.top + grip.height / 2)
      : e.clientX - (grip.left + grip.width / 2);
    drag.current = { pointerId: e.pointerId, offset };
    e.currentTarget.setPointerCapture(e.pointerId);
    userMoved.current = true;
    setP(h);
    setOut(0);
  };
  const moveDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    const track = gripTrack.current?.getBoundingClientRect();
    if (!active || e.pointerId !== active.pointerId || !track) return;
    const length = vertical ? track.height : track.width;
    if (!length) return;
    const distance = vertical ? e.clientY - track.top : e.clientX - track.left;
    const physical = Math.max(
      0,
      Math.min(1, (distance - active.offset) / length),
    );
    setP(vertical || !rtl ? physical : 1 - physical);
  };
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };
  const moveHandle = (next: number) => {
    stopDemo();
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

  const openFrom = (product: Product, el: HTMLElement, legacy: boolean) => {
    if (inspector.openId === product.id) return inspector.close();
    if (!legacy || !motion.animate) return inspector.open(product.id, el);
    setConverting({ from: legacyFileName(product), to: product.name });
    window.setTimeout(() => {
      setConverting(null);
      inspector.open(product.id, el);
    }, 800);
  };

  const clipLegacy = vertical
    ? `inset(0 0 ${(1 - h) * 100}% 0)`
    : rtl
      ? `inset(0 0 0 ${(1 - h) * 100}%)`
      : `inset(0 ${(1 - h) * 100}% 0 0)`;
  const clipDigital = vertical
    ? `inset(${h * 100}% 0 0 0)`
    : rtl
      ? `inset(0 ${h * 100}% 0 0)`
      : `inset(0 0 0 ${h * 100}%)`;
  const handlePosition = `${(vertical || !rtl ? h : 1 - h) * 100}%`;
  const openProduct = list.find((x) => x.id === inspector.openId) ?? null;
  // Legacy office anchors: desktop icons hug the reading-start edge, the CRT sits just after them.
  const crtW = Math.min(236, Math.max(170, 0.165 * W));
  const deskU = Math.max(0.046, 60 / W);
  const crtU = Math.max(0.18, (120 + crtW / 2 + 8) / W);
  const pos = (u: number, c: number): CSSProperties => {
    const [x, y] = toXY(u, c);
    return { left: x, top: y };
  };

  return (
    <div
      ref={root}
      className="ld-stage"
      data-vertical={vertical ? "" : undefined}
      data-static={motion.animate ? undefined : ""}
    >
      {/* Legacy world */}
      <div
        className="ld-layer ld-legacy"
        style={{ clipPath: clipLegacy }}
        aria-hidden={false}
      >
        <div className="ld-legacy-bg" />
        <svg className="ld-cables" width={W} height={H} aria-hidden="true">
          {cables.map((c, i) => (
            <path
              key={i}
              d={c.d}
              className="ld-cable-old"
              style={{ opacity: 1 - c.m }}
            />
          ))}
        </svg>
        <p className="ld-world-label ld-world-legacy" dir={dir}>
          {t("ldLegacy")}
        </p>
        {/* The 90s office is grouped near the reading start so it fills the legacy side at the default handle position. */}
        <div
          className="ld-crt"
          style={vertical ? pos(0.5, 0.5) : pos(crtU, 0.53)}
          aria-hidden="true"
        >
          <div className="ld-crt-bar">
            <span>E20E.EXE</span>
            <b>({t("ldNotResponding")})</b>
          </div>
          <div className="ld-crt-screen">
            <pre>
              {`C:\\EA> dir\n${list.length} FILE(S)\nC:\\EA> run e20e\n...`}
              <span className="ld-blink">█</span>
            </pre>
          </div>
          <div className="ld-crt-stand" />
          {!vertical ? (
            <span className="ld-sticky" dir={dir}>
              {t("ldSticky")}
            </span>
          ) : null}
        </div>
        {!vertical ? (
          <>
            <div
              className="ld-dialog"
              style={pos(crtU, 0.1)}
              aria-hidden="true"
            >
              <div className="ld-dialog-bar">
                <span dir="ltr">E20E.EXE</span>
                <i>×</i>
              </div>
              <p dir={dir}>
                <b>⚠</b> {t("ldNotResponding")}
              </p>
              <div className="ld-dialog-btns" dir={dir}>
                <span>{t("ldWait")}</span>
                <span>{t("ldEndTask")}</span>
              </div>
            </div>
            <div
              className="ld-desk"
              style={pos(deskU, 0.42)}
              aria-hidden="true"
            >
              {LEGACY_DESKTOP_FILES.map((name) => (
                <span key={name} className="ld-desk-icon">
                  <FileIcon kind={legacyKind(name)} />
                  <span dir="ltr">
                    <Breakable text={name} />
                  </span>
                </span>
              ))}
            </div>
            <svg
              className="ld-decor ld-silos"
              style={pos(0.34, 0.2)}
              viewBox="0 0 120 120"
              aria-hidden="true"
            >
              {[
                ["HR", 8],
                ["FIN", 46],
                ["OPS", 84],
              ].map(([label, x]) => (
                <g key={label as string}>
                  <path
                    d={`M${x} 14v62a14 5 0 0 0 28 0v-62`}
                    fill="#b8b2a3"
                    stroke="#4a4536"
                    strokeWidth="2"
                  />
                  <ellipse
                    cx={(x as number) + 14}
                    cy="14"
                    rx="14"
                    ry="5"
                    fill="#d6d0c2"
                    stroke="#4a4536"
                    strokeWidth="2"
                  />
                  <path
                    d={`M${x} 34a14 5 0 0 0 28 0M${x} 54a14 5 0 0 0 28 0`}
                    fill="none"
                    stroke="#6e695e"
                    strokeWidth="1.5"
                  />
                  <text
                    x={(x as number) + 14}
                    y="70"
                    textAnchor="middle"
                    className="ld-silo-text"
                  >
                    {label}
                  </text>
                </g>
              ))}
              <path
                className="ld-spaghetti"
                d="M22 80c-10 18 40 4 30 22s-30-6-18 14M60 82c18 20-34 10-20 26s38-2 28-14M98 80c-6 22-44 0-36 22s30 8 40-6M36 40c10-14 20 22 30 2s16 18 24 0"
              />
            </svg>
            <svg
              className="ld-decor ld-papers"
              style={pos(0.34, 0.895)}
              viewBox="0 0 80 64"
              aria-hidden="true"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                <rect
                  key={k}
                  x={6 + ((k * 3) % 7)}
                  y={54 - k * 7}
                  width="64"
                  height="8"
                  fill={k % 3 === 2 ? "#ffe9a8" : "#f2efe6"}
                  stroke="#4a4536"
                  strokeWidth="1.5"
                  transform={`rotate(${k % 2 ? 2.5 : -2} 40 ${54 - k * 7})`}
                />
              ))}
              <ellipse
                cx="62"
                cy="6"
                rx="9"
                ry="3"
                fill="none"
                stroke="#8a5a2b"
                strokeWidth="1.5"
                opacity="0.7"
              />
            </svg>
          </>
        ) : null}
        <svg
          className="ld-decor ld-cabinet"
          style={pos(vertical ? 0.14 : 0.035, vertical ? 0.1 : 0.86)}
          viewBox="0 0 60 90"
          aria-hidden="true"
        >
          <rect
            x="2"
            y="2"
            width="56"
            height="86"
            fill="#a39d8f"
            stroke="#4a4536"
            strokeWidth="3"
          />
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect
                x="8"
                y={8 + k * 27}
                width="44"
                height="22"
                fill="#b8b2a3"
                stroke="#4a4536"
                strokeWidth="2"
              />
              <rect
                x="22"
                y={16 + k * 27}
                width="16"
                height="5"
                fill="#4a4536"
              />
            </g>
          ))}
          <path
            d="M44 8l10-6v6"
            fill="#f2efe6"
            stroke="#4a4536"
            strokeWidth="1.5"
          />
        </svg>
        <svg
          className="ld-decor ld-fax"
          style={pos(vertical ? 0.14 : 0.965, vertical ? 0.88 : 0.86)}
          viewBox="0 0 80 60"
          aria-hidden="true"
        >
          <path
            d="M20 4h40v20H20z"
            fill="#f2efe6"
            stroke="#4a4536"
            strokeWidth="2"
          />
          <path d="M26 10h28M26 16h20" stroke="#8e897d" strokeWidth="2" />
          <rect
            x="4"
            y="22"
            width="72"
            height="34"
            rx="4"
            fill="#b8b2a3"
            stroke="#4a4536"
            strokeWidth="3"
          />
          <rect
            x="12"
            y="30"
            width="24"
            height="10"
            fill="#39ff6a"
            opacity="0.6"
          />
          {[0, 1, 2].map((k) => (
            <rect
              key={k}
              x={46 + k * 9}
              y="32"
              width="6"
              height="6"
              fill="#4a4536"
            />
          ))}
        </svg>
        {!vertical ? (
          <svg
            className="ld-decor ld-floppies"
            style={pos(0.72, 0.9)}
            viewBox="0 0 90 40"
            aria-hidden="true"
          >
            {[0, 1, 2].map((k) => (
              <g
                key={k}
                transform={`translate(${k * 22} ${k % 2 ? 4 : 0}) rotate(${(k - 1) * 6} 20 20)`}
              >
                <rect
                  x="2"
                  y="4"
                  width="32"
                  height="32"
                  fill={["#3a5aa0", "#2f2f2f", "#a03a3a"][k]}
                  stroke="#1d1b16"
                  strokeWidth="1.5"
                />
                <rect x="9" y="4" width="18" height="10" fill="#c9c3b5" />
                <rect x="7" y="20" width="22" height="14" fill="#f2efe6" />
              </g>
            ))}
          </svg>
        ) : null}
        {list.map((product, i) => {
          const it = items[i];
          if (!it) return null;
          const name = legacyFileName(product);
          const m = morphAt(it.u, h);
          return (
            <button
              key={product.id}
              type="button"
              className="ld-item ld-file"
              style={{ ...pos(it.u, it.c), "--m": m } as CSSProperties}
              tabIndex={m > 0.5 ? -1 : 0}
              aria-label={`${name} → ${product.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => openFrom(product, e.currentTarget, true)}
            >
              <FileIcon kind={legacyKind(name)} />
              <span dir="ltr">
                <Breakable text={name} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Digital world */}
      <div className="ld-layer ld-digital" style={{ clipPath: clipDigital }}>
        <div className="ld-digital-bg" />
        <p className="ld-world-label ld-world-digital" dir={dir}>
          {t("ldDigital")}
        </p>
        <svg className="ld-bus" width={W} height={H} aria-hidden="true">
          <defs>
            <linearGradient
              id="ld-bus-grad"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={vertical ? 0 : W}
              y2={vertical ? H : 0}
            >
              <stop offset="0" stopColor="var(--ld-etched)" />
              <stop offset="0.5" stopColor="var(--ld-trace)" />
              <stop offset="1" stopColor="var(--ld-etched)" />
            </linearGradient>
            <linearGradient id="ld-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--ld-etched)" />
              <stop offset="1" stopColor="var(--ld-trace)" />
            </linearGradient>
          </defs>
          {vertical ? (
            <path
              d={`M${busPos} ${H * 0.08}V${H * 0.97}`}
              className="ld-bus-line"
            />
          ) : (
            <path
              d={`M${W * 0.03} ${busPos}H${W * 0.97}`}
              className="ld-bus-line"
            />
          )}
          {vertical ? (
            <path
              d={`M${busPos} ${H * 0.08}V${H * 0.97}`}
              className="ld-packets"
            />
          ) : (
            <path
              d={`M${W * 0.03} ${busPos}H${W * 0.97}`}
              className="ld-packets"
              style={rtl ? { animationDirection: "reverse" } : undefined}
            />
          )}
        </svg>
        <svg className="ld-cables" width={W} height={H} aria-hidden="true">
          {cables.map((c, i) => (
            <g key={i} style={{ opacity: c.m }}>
              <path d={c.d} className="ld-cable-track" />
              <path d={c.d} className="ld-cable-new" />
              <circle
                cx={c.end[0]}
                cy={c.end[1]}
                r={4}
                className="ld-cable-port"
              />
            </g>
          ))}
        </svg>
        <svg
          className="ld-decor ld-db"
          style={pos(vertical ? 0.06 : 0.035, vertical ? 0.12 : 0.86)}
          viewBox="0 0 60 90"
          aria-hidden="true"
        >
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <ellipse
                cx="30"
                cy={14 + k * 26}
                rx="24"
                ry="8"
                fill="url(#ld-grad)"
                opacity={0.25 + k * 0.2}
              />
              <path
                d={`M6 ${14 + k * 26}v14a24 8 0 0 0 48 0v-14`}
                fill="var(--ld-substrate)"
                stroke="var(--ld-etched)"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </svg>
        <svg
          className="ld-decor ld-api"
          style={pos(vertical ? 0.06 : 0.965, vertical ? 0.88 : 0.86)}
          viewBox="0 0 80 60"
          aria-hidden="true"
        >
          <rect
            x="4"
            y="8"
            width="72"
            height="44"
            rx="6"
            fill="var(--ld-substrate)"
            stroke="var(--ld-etched)"
            strokeWidth="2"
          />
          <text x="40" y="36" textAnchor="middle" className="ld-api-text">
            API
          </text>
        </svg>
        {list.map((product, i) => {
          const it = items[i];
          if (!it) return null;
          const m = morphAt(it.u, h);
          const Icon = moduleIcons[product.id] ?? CircuitBoard;
          const status = t(
            product.comingSoon ? "comingSoonBadge" : "inspectorAvailable",
          );
          const port = vertical
            ? it.c < 0.5
              ? "right"
              : "left"
            : it.c < 0.5
              ? "bottom"
              : "top";
          return (
            <button
              key={product.id}
              type="button"
              className="ld-item ld-module"
              data-soon={product.comingSoon ? "" : undefined}
              data-port={port}
              data-dense={list.length > 8 ? "" : undefined}
              dir={dir}
              style={
                {
                  ...pos(it.u, it.c),
                  "--m": m,
                  "--ld-module-column": `${84 / Math.ceil(list.length / 2)}cqw`,
                } as CSSProperties
              }
              tabIndex={m > 0.5 ? 0 : -1}
              aria-label={[product.name, product.label, status]
                .filter(Boolean)
                .join(" — ")}
              aria-haspopup="dialog"
              aria-expanded={inspector.openId === product.id}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => openFrom(product, e.currentTarget, false)}
            >
              <span className="ld-module-head" aria-hidden="true">
                <Icon
                  className="ld-module-glyph"
                  size={16}
                  strokeWidth={1.65}
                />
                <span className="ld-module-status">{status}</span>
              </span>
              <strong dir="auto">{product.name}</strong>
              {product.label && <small dir="auto">{product.label}</small>}
            </button>
          );
        })}
      </div>

      <header
        ref={hubRef}
        className="ld-hub"
        dir={dir}
        style={pos(hubU(vertical), vertical ? 0.5 : 0.53)}
        data-legacy={morphAt(hubU(vertical), h) < 0.5 || undefined}
      >
        <div className="ld-hub-face">
          {settings.logoUrl && (
            <span className="ld-hub-emblem">
              <img
                src={settings.logoUrl}
                alt=""
                width={62}
                height={46}
                decoding="async"
              />
            </span>
          )}
          <div className="ld-hub-copy">
            <h1 dir="auto">{settings.displayTitle}</h1>
            {settings.tagline && <p dir="auto">{settings.tagline}</p>}
          </div>
        </div>
      </header>

      <div
        className="ld-handle"
        style={{ "--ld-position": handlePosition } as CSSProperties}
      >
        <div className="ld-grip-track" ref={gripTrack}>
          <div
            className="ld-grip"
            role="slider"
            tabIndex={0}
            aria-label={t("ldSlider")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={`${value}%`}
            aria-orientation={vertical ? "vertical" : "horizontal"}
            onKeyDown={onKey}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            <span aria-hidden="true">{vertical ? "⇕" : "⟷"}</span>
          </div>
          <span className="ld-drag-label" dir={dir}>
            {t("ldDrag")}
          </span>
        </div>
      </div>
      <div className="ld-readout" dir={dir} aria-hidden="true">
        <span>{t("ldProgress")}</span>
        <b dir="ltr">{value}%</b>
        <i style={{ "--v": value / 100 } as CSSProperties} />
      </div>

      {converting ? (
        <div className="ld-converting" role="status">
          <span>{t("ldConverting")}</span>
          <code dir="ltr">
            <s>{converting.from}</s> → <b>{converting.to}</b>
          </code>
        </div>
      ) : null}

      {openProduct ? (
        <InspectorPanel
          product={openProduct}
          className="ld-card"
          onClose={inspector.close}
          title={<span>{openProduct.label}</span>}
        >
          <CardBody product={openProduct} />
        </InspectorPanel>
      ) : null}
    </div>
  );
}
