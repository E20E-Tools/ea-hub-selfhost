import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import type { Product } from "@/lib/catalog";
import { fill } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import { formatLaunchDate } from "../launch";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import {
  doorSwing,
  generateFloorPlan,
  polyPath,
  rectPath,
  revisionCloud,
  type PlanRoom,
} from "./plan";

/** Drawing schedule (seconds). Pen-followed strokes use linear timing so the pen tip matches the line. */
const T = {
  sheet: 0,
  walls: 0.5,
  wallsDur: 1.3,
  rooms: 1.75,
  roomsSpan: 1.25,
  roomDur: 0.5,
  corridors: 2.7,
  labels: 3.05,
  dims: 3.25,
  clouds: 3.7,
  title: 3.95,
  end: 4.8,
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

const draw = (delay: number, dur: number): CSSProperties =>
  ({ "--d": `${delay}s`, "--t": `${dur}s` }) as CSSProperties;
const pad4 = (v: number) => String(Math.max(0, Math.round(v))).padStart(4, "0");

function TitleBlock({
  available,
  className,
}: {
  available: number;
  className: string;
}) {
  const { t, language } = useLanguage();
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      new Intl.DateTimeFormat(language === "ar" ? "ar-u-nu-latn" : "en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date()),
    );
  }, [language]);
  const rows: [string, string][] = [
    [t("lbProject"), "E20E Tools"],
    [t("lbDrawing"), t("lbDrawingValue")],
    [t("lbScale"), "1:1"],
    [t("lbDate"), today],
    [t("lbSheet"), "01 / 01"],
    [t("lbRev"), String(available)],
  ];
  return (
    <dl className={className}>
      {rows.map(([k, v]) => (
        <div key={k} className="lb-tb-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SpecSheet({ product, index }: { product: Product; index: number }) {
  const { t, language } = useLanguage();
  const facts = useInspectorFacts(product);
  const date = product.publicationDate
    ? formatLaunchDate(product.publicationDate, language)
    : "";
  return (
    <div className="lb-spec">
      <dl className="lb-spec-tb">
        <div>
          <dt>{t("lbRoomField")}</dt>
          <dd dir="ltr">{product.name}</dd>
        </div>
        <div>
          <dt>{t("lbTypeField")}</dt>
          <dd>{product.label}</dd>
        </div>
        <div>
          <dt>{t("lbSheet")}</dt>
          <dd dir="ltr">A-{String(index + 1).padStart(2, "0")}</dd>
        </div>
      </dl>
      <figure className="lb-elev">
        <img src={product.image} alt={product.imageAlt} />
        <span className="lb-elev-dim lb-elev-w" aria-hidden="true" />
        <span className="lb-elev-dim lb-elev-h" aria-hidden="true" />
      </figure>
      <p className="lb-note-h">{t("lbGeneralNote")}</p>
      <p className="lb-note">{product.description}</p>
      {facts.features.length ? (
        <>
          <p className="lb-note-h">{t("lbNotes")}</p>
          <ol className="lb-notes">
            {facts.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </>
      ) : null}
      {facts.launch || facts.countdown ? (
        <p className="lb-spec-status">
          {[facts.launch, facts.countdown].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <div
        className="lb-stamp"
        data-soon={facts.available ? undefined : ""}
        aria-label={facts.status}
      >
        <span>
          {facts.available ? t("lbApproved") : t("lbUnderConstruction")}
        </span>
        {!facts.available && date ? <small dir="ltr">{date}</small> : null}
      </div>
      <InspectorActions
        product={product}
        className="lb-spec-actions"
        details={t("lbEnter")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

export default function LivingBlueprintStage({
  products,
  settings,
}: StageProps) {
  const { t, dir, language } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const motion = useStageMotion(root);
  const vertical = useMobile();
  const list = useMemo(() => products.slice(0, 12), [products]);
  const featureKey = list.map((p) => p.features.length).join(",");
  const plan = useMemo(
    () =>
      generateFloorPlan(featureKey ? featureKey.split(",").map(Number) : [], {
        vertical,
        rtl,
      }),
    [featureKey, vertical, rtl],
  );
  const inspector = useProductInspector();
  const [active, setActive] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const pen = useRef<SVGGElement>(null);
  const penPaths = useRef<(SVGPathElement | null)[]>([]);
  const available = list.filter((p) => !p.comingSoon).length;
  const { width: W, height: H, outer, atrium } = plan;
  const n = Math.max(list.length, 1);
  const roomDelay = (i: number) => T.rooms + (i * T.roomsSpan) / n;

  // Self-drawing sequence with a pen tip that rides the stroke being drawn.
  useEffect(() => {
    if (!motion.animate) return setDrawing(false);
    setDrawing(true);
    const start = performance.now();
    let raf = 0;
    const schedule: [number, number][] = [
      [T.walls, T.wallsDur],
      ...list.map((_, i): [number, number] => [roomDelay(i), T.roomDur]),
    ];
    const tick = (now: number) => {
      const s = (now - start) / 1000;
      const g = pen.current;
      if (g) {
        let shown = false;
        for (let k = schedule.length - 1; k >= 0; k--) {
          const [d, dur] = schedule[k]!;
          const el = penPaths.current[k];
          if (el && s >= d && s <= d + dur) {
            const len = el.getTotalLength();
            const p = el.getPointAtLength(len * ((s - d) / dur));
            g.setAttribute("transform", `translate(${p.x} ${p.y})`);
            shown = true;
            break;
          }
        }
        g.style.opacity = shown ? "1" : "0";
      }
      if (s < T.end) raf = requestAnimationFrame(tick);
      else setDrawing(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Replay when the plan geometry changes (language / layout switch).
  }, [motion.animate, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: RPointerEvent) => {
    if (vertical || e.pointerType !== "mouse" || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    setCursor({
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    });
  };

  const openProduct = list.find((p) => p.id === inspector.openId) ?? null;
  const openIndex = openProduct ? list.indexOf(openProduct) : 0;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = (r: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): CSSProperties => ({
    left: pct(r.x, W),
    top: pct(r.y, H),
    width: pct(r.w, W),
    height: pct(r.h, H),
  });
  const tbRect = rtl
    ? { x: 70, y: 606, w: 380, h: 138 }
    : { x: W - 70 - 380, y: 606, w: 380, h: 138 };
  const startX = rtl ? W - 100 : 100;

  const roomFor = (room: PlanRoom) => list[room.index]!;

  return (
    <div
      ref={root}
      className="lb-stage"
      data-vertical={vertical ? "" : undefined}
      data-drawing={drawing ? "" : undefined}
      data-active={active ? "" : undefined}
    >
      <div
        className="lb-sheet"
        style={{ aspectRatio: `${W} / ${H}` }}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="lb-svg"
          role="img"
          aria-label={t("lbPlan")}
        >
          <defs>
            <pattern
              id="lb-grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path d="M20 0H0V20" className="lb-grid-minor" />
            </pattern>
            <pattern
              id="lb-grid-major"
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <rect width="100" height="100" fill="url(#lb-grid)" />
              <path d="M100 0H0V100" className="lb-grid-major" />
            </pattern>
            <pattern
              id="lb-hatch"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <path d="M0 0V8" className="lb-hatch-red" />
            </pattern>
            <pattern
              id="lb-hatch-lite"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <path d="M0 0V6" className="lb-hatch-lite" />
            </pattern>
            <marker
              id="lb-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 1.5L10 5L0 8.5" className="lb-arrowhead" />
            </marker>
          </defs>

          {/* 1. Sheet: grid, border, registration marks */}
          <rect
            width={W}
            height={H}
            fill="url(#lb-grid-major)"
            className="lb-fade"
            style={draw(T.sheet, 0.7)}
          />
          <path
            d={rectPath({ x: 12, y: 12, w: W - 24, h: H - 24 })}
            pathLength={1}
            className="lb-draw lb-border"
            style={draw(T.sheet, 0.6)}
          />
          <path
            d={rectPath({ x: 20, y: 20, w: W - 40, h: H - 40 })}
            pathLength={1}
            className="lb-draw lb-hair"
            style={draw(T.sheet + 0.1, 0.6)}
          />
          {[
            [12, 12],
            [W - 12, 12],
            [12, H - 12],
            [W - 12, H - 12],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} className="lb-fade" style={draw(0.35, 0.3)}>
              <circle cx={x} cy={y} r="6" className="lb-hair" />
              <path
                d={`M${x! - 10} ${y}H${x! + 10}M${x} ${y! - 10}V${y! + 10}`}
                className="lb-hair"
              />
            </g>
          ))}

          {/* 2. Outer walls + façade windows */}
          <path
            ref={(el) => {
              penPaths.current[0] = el;
            }}
            d={rectPath(outer)}
            pathLength={1}
            className="lb-draw lb-wall-outer lb-linear"
            style={draw(T.walls, T.wallsDur)}
          />

          {/* Atrium with the logo as a floor inlay */}
          <g className="lb-atrium">
            <path
              d={rectPath(atrium)}
              pathLength={1}
              className="lb-draw lb-wall"
              style={draw(T.corridors - 0.3, 0.6)}
            />
            <path
              d={rectPath({
                x: atrium.x + 8,
                y: atrium.y + 8,
                w: atrium.w - 16,
                h: atrium.h - 16,
              })}
              pathLength={1}
              className="lb-draw lb-hair"
              style={draw(T.corridors - 0.15, 0.6)}
            />
            <circle
              cx={atrium.x + atrium.w / 2}
              cy={atrium.y + atrium.h / 2}
              r={Math.min(atrium.w, atrium.h) / 2 - 18}
              pathLength={1}
              className="lb-draw lb-hair"
              style={draw(T.corridors, 0.6)}
            />
            {settings.logoUrl ? (
              <image
                href={settings.logoUrl}
                x={atrium.x + atrium.w / 2 - 32}
                y={atrium.y + atrium.h / 2 - 30}
                width="64"
                height="40"
                className="lb-fade lb-inlay"
                style={draw(T.labels - 0.2, 0.6)}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : null}
            <text
              x={atrium.x + atrium.w / 2}
              y={atrium.y + atrium.h / 2 + 28}
              className="lb-fade lb-atrium-label"
              style={draw(T.labels - 0.1, 0.5)}
              textAnchor="middle"
            >
              {`E20E · ${t("lbAtrium")}`}
            </text>
          </g>

          {/* 3. Rooms, doors, windows, corridors */}
          {plan.rooms.map((room, k) => {
            const product = roomFor(room);
            const d = roomDelay(k);
            const on = active === product.id;
            const swing = doorSwing(room.door, vertical ? 24 : 30);
            const win = room.window;
            const winPath = !win
              ? ""
              : win.wall === "top" || win.wall === "bottom"
                ? `M${win.from} ${win.wall === "top" ? outer.y : outer.y + outer.h}H${win.to}`
                : `M${win.wall === "left" ? outer.x : outer.x + outer.w} ${win.from}V${win.to}`;
            const horizWin =
              win && (win.wall === "top" || win.wall === "bottom");
            const off = (o: number) =>
              horizWin ? `translate(0 ${o})` : `translate(${o} 0)`;
            const fx = rtl ? room.x + 14 : room.x + room.w - 14 - room.w * 0.26;
            const fy =
              room.door.wall === "bottom"
                ? room.y + 14
                : room.y + room.h - 14 - room.h * 0.2;
            return (
              <g
                key={product.id}
                className="lb-room"
                data-on={on ? "" : undefined}
                data-soon={product.comingSoon ? "" : undefined}
              >
                {product.comingSoon ? (
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    fill="url(#lb-hatch)"
                    className="lb-fade"
                    style={draw(T.clouds, 0.5)}
                  />
                ) : null}
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill="url(#lb-hatch-lite)"
                  className="lb-room-hover"
                />
                <path
                  ref={(el) => {
                    penPaths.current[k + 1] = el;
                  }}
                  d={rectPath(room)}
                  pathLength={1}
                  className="lb-draw lb-wall lb-linear"
                  style={draw(d, T.roomDur)}
                />
                {/* furniture */}
                {!vertical ? (
                  <g className="lb-fade" style={draw(d + 0.35, 0.4)}>
                    <rect
                      x={fx}
                      y={fy}
                      width={room.w * 0.26}
                      height={room.h * 0.2}
                      className="lb-furn"
                    />
                    <circle
                      cx={rtl ? fx + room.w * 0.26 + 10 : fx - 10}
                      cy={fy + room.h * 0.06}
                      r="5"
                      className="lb-furn"
                    />
                    <circle
                      cx={rtl ? fx + room.w * 0.26 + 10 : fx - 10}
                      cy={fy + room.h * 0.15}
                      r="5"
                      className="lb-furn"
                    />
                  </g>
                ) : null}
                {win ? (
                  <g className="lb-fade" style={draw(d + 0.3, 0.3)}>
                    <path d={winPath} className="lb-cut lb-cut-outer" />
                    {[-3, 0, 3].map((o) => (
                      <path
                        key={o}
                        d={winPath}
                        transform={off(o)}
                        className="lb-window"
                      />
                    ))}
                  </g>
                ) : null}
                <g className="lb-fade" style={draw(d + 0.4, 0.3)}>
                  <path d={swing.gap} className="lb-cut" />
                  <path d={swing.leaf} className="lb-door" />
                </g>
                <path
                  d={swing.arc}
                  pathLength={1}
                  className="lb-draw lb-door-arc"
                  style={draw(d + 0.45, 0.35)}
                />
                <path
                  d={polyPath(room.corridor)}
                  pathLength={1}
                  className="lb-draw lb-corridor"
                  data-lit={on ? "" : undefined}
                  style={draw(T.corridors + k * 0.05, 0.5)}
                />
                {/* live dimensions on hover */}
                {on ? (
                  <g className="lb-measure">
                    <path
                      d={`M${room.x + 8} ${room.y + 12}H${room.x + room.w - 8}`}
                      markerStart="url(#lb-arrow)"
                      markerEnd="url(#lb-arrow)"
                      pathLength={1}
                      className="lb-dim-live"
                    />
                    <text
                      x={room.x + room.w / 2}
                      y={room.y + 26}
                      textAnchor="middle"
                      className="lb-dim-text"
                    >{`${Math.round(room.w * 10)}`}</text>
                    <path
                      d={`M${rtl ? room.x + room.w - 12 : room.x + 12} ${room.y + 20}V${room.y + room.h - 8}`}
                      markerStart="url(#lb-arrow)"
                      markerEnd="url(#lb-arrow)"
                      pathLength={1}
                      className="lb-dim-live"
                    />
                  </g>
                ) : null}
                {product.comingSoon ? (
                  <path
                    d={revisionCloud(
                      room,
                      vertical ? 4 : 7,
                      vertical ? 12 : 18,
                    )}
                    pathLength={1}
                    className="lb-draw lb-cloud"
                    style={draw(T.clouds, 0.7)}
                  />
                ) : null}
              </g>
            );
          })}

          {/* 4. Overall dimension lines (drawing-style values) */}
          {!vertical ? (
            <g className="lb-dims">
              <g className="lb-fade" style={draw(T.dims, 0.15)}>
                <path
                  d={`M${outer.x} ${outer.y - 26}H${outer.x + outer.w}`}
                  markerStart="url(#lb-arrow)"
                  markerEnd="url(#lb-arrow)"
                  pathLength={1}
                  className="lb-draw lb-dim"
                  style={draw(T.dims, 0.7)}
                />
              </g>
              <path
                d={`M${outer.x} ${outer.y - 34}V${outer.y - 6}M${outer.x + outer.w} ${outer.y - 34}V${outer.y - 6}`}
                className="lb-fade lb-hair"
                style={draw(T.dims, 0.4)}
              />
              <text
                x={outer.x + outer.w / 2}
                y={outer.y - 32}
                textAnchor="middle"
                className="lb-fade lb-dim-text"
                style={draw(T.dims + 0.4, 0.4)}
              >{`${outer.w * 10} mm`}</text>
              <g className="lb-fade" style={draw(T.dims + 0.15, 0.15)}>
                <path
                  d={`M${rtl ? outer.x + outer.w + 26 : outer.x - 26} ${outer.y}V${outer.y + outer.h}`}
                  markerStart="url(#lb-arrow)"
                  markerEnd="url(#lb-arrow)"
                  pathLength={1}
                  className="lb-draw lb-dim"
                  style={draw(T.dims + 0.15, 0.7)}
                />
              </g>
              <text
                x={rtl ? outer.x + outer.w + 40 : outer.x - 40}
                y={outer.y + outer.h / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${rtl ? outer.x + outer.w + 40 : outer.x - 40} ${outer.y + outer.h / 2})`}
                className="lb-fade lb-dim-text"
                style={draw(T.dims + 0.5, 0.4)}
              >
                {`${outer.h * 10} mm`}
              </text>
              {/* north arrow + scale bar on the reading-start side */}
              <g
                className="lb-fade"
                style={draw(T.title, 0.6)}
                transform={`translate(${startX} 676)`}
              >
                <circle r="26" className="lb-hair" />
                <path d="M0 -24L9 14L0 6L-9 14Z" className="lb-north" />
                <text y="-32" textAnchor="middle" className="lb-dim-text">
                  {t("lbNorth")}
                </text>
              </g>
              <g
                className="lb-fade"
                style={draw(T.title + 0.1, 0.6)}
                transform={`translate(${rtl ? startX - 260 : startX + 60} 690)`}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <rect
                    key={i}
                    x={i * 40}
                    y="0"
                    width="40"
                    height="8"
                    className={i % 2 ? "lb-scale-a" : "lb-scale-b"}
                  />
                ))}
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <text
                    key={i}
                    x={i * 40}
                    y="24"
                    textAnchor="middle"
                    className="lb-dim-text"
                  >
                    {i}
                  </text>
                ))}
                <text x="200" y="-8" textAnchor="end" className="lb-dim-text">
                  m
                </text>
              </g>
            </g>
          ) : null}

          {/* CAD crosshair */}
          {cursor ? (
            <g className="lb-cross" pointerEvents="none">
              <path d={`M${cursor.x} 20V${H - 20}M20 ${cursor.y}H${W - 20}`} />
              <rect x={cursor.x - 6} y={cursor.y - 6} width="12" height="12" />
              <text
                x={cursor.x + 12}
                y={cursor.y - 10}
                className="lb-cross-text"
              >{`X ${pad4(cursor.x)}  Y ${pad4(cursor.y)}`}</text>
            </g>
          ) : null}

          {/* Pen tip + set square + T-square riding the active stroke */}
          {drawing ? (
            <g className="lb-tools" aria-hidden="true">
              <g ref={pen} style={{ opacity: 0 }}>
                <path
                  d="M0 0L90 -90L90 0Z"
                  className="lb-setsquare"
                  transform="translate(6 6)"
                />
                <path d={`M${-W} 8H${W}`} className="lb-tsquare" />
                <circle r="10" className="lb-pen-glow" />
                <circle r="3" className="lb-pen" />
              </g>
            </g>
          ) : null}
        </svg>

        {/* Interactive rooms with handwritten labels */}
        {plan.rooms.map((room) => {
          const product = roomFor(room);
          const date = product.publicationDate
            ? formatLaunchDate(product.publicationDate, language)
            : "";
          return (
            <button
              key={product.id}
              type="button"
              className="lb-room-btn"
              style={{
                ...box(room),
                ...draw(T.labels + room.index * 0.06, 0.5),
              }}
              data-soon={product.comingSoon ? "" : undefined}
              aria-label={fill(t("lbRoom"), product.name)}
              aria-expanded={inspector.openId === product.id}
              onMouseEnter={() => setActive(product.id)}
              onMouseLeave={() =>
                setActive((a) => (a === product.id ? null : a))
              }
              onFocus={() => setActive(product.id)}
              onBlur={() => setActive((a) => (a === product.id ? null : a))}
              onClick={(e) =>
                inspector.openId === product.id
                  ? inspector.close()
                  : inspector.open(product.id, e.currentTarget)
              }
            >
              <span className="lb-room-name" dir="ltr">
                {product.name}
              </span>
              <span className="lb-room-cat">{product.label}</span>
              {product.comingSoon ? (
                <span className="lb-rev-tag">
                  {vertical ? "REV B" : t("lbRevTag")}
                  {product.publicationDate ? (
                    <>
                      {" "}
                      · <bdi>{date}</bdi>
                    </>
                  ) : vertical ? (
                    ` · ${t("lbUnderConstruction")}`
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}

        {!vertical ? (
          <div
            className="lb-tb-wrap lb-fade"
            style={{ ...box(tbRect), ...draw(T.title, 0.6) }}
          >
            <TitleBlock available={available} className="lb-tb" />
          </div>
        ) : null}
      </div>

      {vertical ? (
        <TitleBlock available={available} className="lb-tb lb-tb-mobile" />
      ) : null}

      {openProduct ? (
        <InspectorPanel
          product={openProduct}
          className="lb-sheet-panel"
          onClose={inspector.close}
          title={
            <span dir="ltr">A-{String(openIndex + 1).padStart(2, "0")}</span>
          }
        >
          <SpecSheet product={openProduct} index={openIndex} />
        </InspectorPanel>
      ) : null}
    </div>
  );
}
