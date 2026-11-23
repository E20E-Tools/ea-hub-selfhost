import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Product } from "@/lib/catalog";
import { fill } from "@/lib/copy";
import { useLanguage } from "@/lib/language";
import type { StageProps } from "../registry";
import { useStageMotion } from "../use-stage-motion";
import {
  InspectorActions,
  InspectorPanel,
  useInspectorFacts,
  useProductInspector,
} from "../product-inspector";
import {
  boxFaces,
  buildingFor,
  cityBounds,
  hash,
  iso,
  layoutCity,
  nightAt,
  parkLots,
  rng,
  skyAt,
  type BuildingSpec,
  type Footprint,
  type GPt,
} from "./city";

const DATA_Z = -54;
const TECH_Z = -112;
const BIZ_Z = 236;
const STATIC_PHASE = 0.06; // golden hour
const STATIC_NIGHT = 0.4;

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

const pt = (gx: number, gy: number, z = 0) =>
  iso(gx, gy, z)
    .map((v) => Math.round(v * 10) / 10)
    .join(",");
const shrink = (f: Footprint, k: number): Footprint => ({
  x: f.x + (f.w * k) / 2,
  y: f.y + (f.d * k) / 2,
  w: f.w * (1 - k),
  d: f.d * (1 - k),
});

/** One extruded block with shaded faces, window rows and a neon roof edge. */
function Box({
  f,
  z0,
  h,
  seed,
  windows = true,
  gap = 10,
}: {
  f: Footprint;
  z0: number;
  h: number;
  seed: string;
  windows?: boolean;
  gap?: number;
}) {
  const faces = boxFaces(f, z0, h);
  const r = rng(seed);
  const rows: ReactNode[] = [];
  if (windows) {
    const x1 = f.x + f.w,
      y1 = f.y + f.d;
    for (let z = z0 + 8; z < z0 + h - 6; z += gap) {
      const a = r(),
        b = r();
      rows.push(
        <path
          key={`l${z}`}
          d={`M${pt(f.x + 0.12, y1, z)}L${pt(x1 - 0.12, y1, z)}`}
          className={`mc-win${a > 0.86 ? " mc-flick" : ""}`}
          style={{ "--s": a, animationDelay: `${(a * 9).toFixed(2)}s` } as CSSProperties}
        />,
        <path
          key={`r${z}`}
          d={`M${pt(x1, f.y + 0.12, z)}L${pt(x1, y1 - 0.12, z)}`}
          className={`mc-win mc-win-r${b > 0.88 ? " mc-flick" : ""}`}
          style={{ "--s": b, animationDelay: `${(b * 11).toFixed(2)}s` } as CSSProperties}
        />,
      );
    }
  }
  return (
    <g>
      <polygon points={faces.left} className="mc-face mc-l" />
      <polygon points={faces.right} className="mc-face mc-r" />
      <polygon points={faces.top} className="mc-face mc-t" />
      {rows}
      <polygon points={faces.top} className="mc-neon" />
    </g>
  );
}

function blocks(spec: BuildingSpec): { f: Footprint; z0: number; h: number }[] {
  const { footprint: f, height: h } = spec;
  switch (spec.kind) {
    case "stepped":
      return [
        { f, z0: 0, h: h * 0.5 },
        { f: shrink(f, 0.2), z0: h * 0.5, h: h * 0.3 },
        { f: shrink(f, 0.42), z0: h * 0.8, h: h * 0.2 },
      ];
    case "twisted":
      return Array.from({ length: 6 }, (_, i) => {
        const s = shrink(f, 0.18 + i * 0.04);
        const o = 0.13 * Math.sin(i * 1.2);
        const p = 0.13 * Math.cos(i * 1.2);
        return { f: { ...s, x: s.x + o, y: s.y + p }, z0: (h / 6) * i, h: h / 6 };
      });
    case "dome":
      return [{ f, z0: 0, h: h * 0.72 }];
    default:
      return [{ f, z0: 0, h }];
  }
}

/** Sign on the plane of the left façade (iso x-axis), so text reads like it's painted on the city. */
function Sign({
  at,
  text,
  width,
  className = "mc-sign",
}: {
  at: [number, number];
  text: string;
  width: number;
  className?: string;
}) {
  const w = Math.max(28, width);
  return (
    <g transform={`matrix(0.894 0.447 0 1 ${at[0]} ${at[1]})`} className={className}>
      <path d={`M4 0V10M${w - 4} 0V10`} className="mc-sign-pole" />
      <rect x="0" y="-12" width={w} height="13" rx="1.5" />
      <text
        x={w / 2}
        y="-2.6"
        textAnchor="middle"
        textLength={text.length * 5.6 > w - 6 ? w - 6 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {text}
      </text>
    </g>
  );
}

function Hologram({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  return (
    <div className="mc-holo-body">
      <strong className="mc-holo-name" dir="ltr">
        {product.name}
      </strong>
      <p className="mc-holo-status" data-soon={facts.available ? undefined : ""}>
        <i aria-hidden="true" />
        {facts.status}
        {facts.launch ? ` · ${facts.launch}` : ""}
        {facts.countdown ? ` · ${facts.countdown}` : ""}
      </p>
      <p className="mc-holo-desc">{product.description}</p>
      {facts.features.length ? (
        <ul className="mc-holo-features">
          {facts.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <InspectorActions
        product={product}
        className="mc-holo-actions"
        details={t("details")}
        openTool={`${t("inspectorOpenTool")} ↗`}
      />
    </div>
  );
}

type Placed = {
  product: Product;
  spec: BuildingSpec;
  cx: number;
  cy: number;
  route: GPt[];
  top: number;
};

export default function MetropolisStage({ products, settings }: StageProps) {
  const { t, dir, language } = useLanguage();
  const rtl = dir === "rtl";
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const list = useMemo(() => products.slice(0, 12), [products]);
  const inspector = useProductInspector();
  const [active, setActive] = useState<string | null>(null);
  const [cyclePaused, setCyclePaused] = useState(false);
  const phaseRef = useRef(0.18);
  const sceneRefs = useRef<Record<string, SVGElement | null>>({});
  const ref = (key: string) => (el: SVGElement | null) => {
    sceneRefs.current[key] = el;
  };

  const placed: Placed[] = useMemo(() => {
    const lots = layoutCity(list.length);
    return list.map((product, i) => {
      const lot = lots[i]!;
      // RTL mirrors the city across the screen's vertical axis (swap grid axes).
      const cx = rtl ? lot.cy : lot.cx;
      const cy = rtl ? lot.cx : lot.cy;
      const spec = buildingFor(product.id, product.features.length, [cx, cy]);
      const route = lot.route.map(([x, y]): GPt => (rtl ? [y, x] : [x, y]));
      const top = spec.kind === "dome" ? spec.height * 0.72 + spec.footprint.w * 12 : spec.height;
      return { product, spec, cx, cy, route, top };
    });
  }, [list, rtl]);

  const bounds = cityBounds(layoutCity(list.length));
  const { min, max } = bounds;
  const hqH = Math.max(230, ...placed.map((p) => p.top + 50));
  const slab: Footprint = { x: min, y: min, w: max - min, d: max - min };
  // Viewbox with origin at 0,0 so CSS camera transforms are unambiguous.
  const left = (min - max) * 32 - 40;
  const right = (max - min) * 32 + 190;
  const top = min * 32 - hqH - 120;
  const bottom = max * 32 - TECH_Z + 70;
  const VW = right - left;
  const VH = bottom - top;
  const ox = -left;
  const oy = -top;

  const roads = useMemo(() => {
    const lines: number[] = [];
    for (let g = 1.5; g <= max - 1.4; g += 3) lines.push(g, -g);
    return lines;
  }, [max]);

  const openId = inspector.openId;
  const openPlaced = placed.find((p) => p.product.id === openId) ?? null;
  const zoom = (() => {
    if (!openPlaced || mobile) return "translate(0px, 0px) scale(1)";
    const s = 1.75;
    const [px, py] = iso(openPlaced.cx, openPlaced.cy, openPlaced.top);
    const tx = VW / 2 - s * (px + ox);
    const ty = VH * 0.8 - s * (py + oy);
    return `translate(${tx}px, ${ty}px) scale(${s})`;
  })();

  // Single rAF loop: sky + night, cars, drones, cranes, construction growth.
  const cars = useMemo(() => {
    const n = mobile ? 4 : 9;
    const r = rng(`cars${roads.length}`);
    return Array.from({ length: n }, (_, i) => ({
      road: roads[i % roads.length] ?? 1.5,
      vertical: i % 2 === 0,
      speed: 0.35 + r() * 0.5,
      offset: r() * 10,
      packet: i % 3 === 2,
      lane: i % 4 < 2 ? 0.22 : -0.22,
    }));
  }, [roads, mobile]);
  const drones = useMemo(
    () => placed.filter((p) => !p.product.comingSoon).slice(0, mobile ? 3 : 6),
    [placed, mobile],
  );
  const sites = useMemo(
    () => placed.filter((p) => p.product.comingSoon).slice(0, mobile ? 3 : 8),
    [placed, mobile],
  );

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const apply = (phase: number, night: number) => {
      const sky = skyAt(phase);
      node.style.setProperty("--sky-top", sky.top);
      node.style.setProperty("--sky-hz", sky.horizon);
      node.style.setProperty("--night", night.toFixed(3));
      const sun = phase < 0.62 ? phase / 0.62 : (phase - 0.62) / 0.38;
      node.style.setProperty("--orb-x", `${(rtl ? 92 - sun * 84 : 8 + sun * 84).toFixed(2)}%`);
      node.style.setProperty("--orb-y", `${(58 - Math.sin(sun * Math.PI) * 46).toFixed(2)}%`);
      node.dataset["orb"] = phase < 0.62 ? "sun" : "moon";
    };
    const place = (s: number) => {
      const R = sceneRefs.current;
      cars.forEach((c, i) => {
        const span = max - min;
        const u = min + ((c.offset + s * c.speed) % span);
        const [gx, gy] = c.vertical ? [c.road + c.lane, u] : [u, c.road + c.lane];
        const [x, y] = iso(gx, gy, 1);
        R[`car${i}`]?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      });
      const [hx, hy] = [0, 0];
      drones.forEach((d, i) => {
        const raw = (((s * 0.12 + i * 0.37) % 2) + 2) % 2;
        const k = raw < 1 ? raw : 2 - raw; // ping-pong
        const e = k * k * (3 - 2 * k);
        const gx = hx + (d.cx - hx) * e;
        const gy = hy + (d.cy - hy) * e;
        const z = hqH + 10 + (d.top + 14 - hqH - 10) * e + Math.sin(e * Math.PI) * 70;
        const [x, y] = iso(gx, gy, z);
        const el = R[`drone${i}`];
        el?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        el?.setAttribute("data-carry", raw < 1 ? "1" : "0");
      });
      sites.forEach((p, i) => {
        const f = p.spec.footprint;
        const grow = 0.32 + 0.3 * (0.5 - 0.5 * Math.cos(s * 0.16 + i));
        const h = p.spec.height * grow;
        const faces = boxFaces(f, 0, h);
        R[`bt${i}`]?.setAttribute("points", faces.top);
        R[`bl${i}`]?.setAttribute("points", faces.left);
        R[`br${i}`]?.setAttribute("points", faces.right);
        // crane: mast at the back corner, jib swings slowly, hook lifts a block
        const mx = f.x - 0.25,
          my = f.y - 0.25,
          H = p.spec.height + 46;
        const th = 0.6 + i * 1.3 + Math.sin(s * 0.14 + i) * 1.1;
        const L = 2.1;
        const end = iso(mx + Math.cos(th) * L, my + Math.sin(th) * L, H);
        const back = iso(mx - Math.cos(th) * 0.8, my - Math.sin(th) * 0.8, H);
        const mast = iso(mx, my, H);
        const tr = 0.55 + 0.25 * Math.sin(s * 0.3 + i);
        const hookG: [number, number] = [mx + Math.cos(th) * L * tr, my + Math.sin(th) * L * tr];
        const lift = 0.5 - 0.5 * Math.cos(s * 0.35 + i * 2);
        const blockZ = h + 6 + lift * (H - h - 24);
        const hookTop = iso(hookG[0], hookG[1], H);
        const hookBot = iso(hookG[0], hookG[1], blockZ + 10);
        R[`jib${i}`]?.setAttribute("d", `M${back.join(",")}L${mast.join(",")}L${end.join(",")}`);
        R[`tie${i}`]?.setAttribute(
          "d",
          `M${back.join(",")}L${iso(mx, my, H + 22).join(",")}L${end.join(",")}`,
        );
        R[`cable${i}`]?.setAttribute("d", `M${hookTop.join(",")}L${hookBot.join(",")}`);
        const bf = boxFaces(
          { x: hookG[0] - 0.22, y: hookG[1] - 0.22, w: 0.44, d: 0.44 },
          blockZ,
          10,
        );
        R[`kt${i}`]?.setAttribute("points", bf.top);
        R[`kl${i}`]?.setAttribute("points", bf.left);
        R[`kr${i}`]?.setAttribute("points", bf.right);
      });
    };
    if (!motion.animate) {
      apply(STATIC_PHASE, STATIC_NIGHT);
      place(4);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let skyAcc = 1;
    let s = 0;
    const cycle = 45 / (motion.scale || 1);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (motion.running) {
        s += dt;
        if (!cyclePaused) phaseRef.current = (phaseRef.current + dt / cycle) % 1;
        skyAcc += dt;
        if (skyAcc > 1 / 15) {
          skyAcc = 0;
          apply(phaseRef.current, nightAt(phaseRef.current));
        }
        place(s);
      }
      raf = requestAnimationFrame(tick);
    };
    apply(phaseRef.current, nightAt(phaseRef.current));
    place(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    motion.animate,
    motion.running,
    motion.scale,
    cyclePaused,
    cars,
    drones,
    sites,
    max,
    min,
    hqH,
    rtl,
  ]);

  const jump = (phase: number) => {
    phaseRef.current = phase;
    const node = root.current;
    if (!node) return;
    const sky = skyAt(phase);
    node.style.setProperty("--sky-top", sky.top);
    node.style.setProperty("--sky-hz", sky.horizon);
    node.style.setProperty("--night", nightAt(phase).toFixed(3));
  };

  // Mobile: start the pan centred on HQ.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !mobile) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [mobile, VW]);

  const openBuilding = (p: Placed, el: Element) => {
    if (inspector.openId === p.product.id) return inspector.close();
    if (mobile && scroller.current) {
      const r = scroller.current;
      const [x] = iso(p.cx, p.cy);
      const frac = (x + ox) / VW;
      r.scrollTo({
        left: frac * r.scrollWidth - r.clientWidth / 2,
        behavior: motion.animate ? "smooth" : "auto",
      });
    }
    inspector.open(p.product.id, el as HTMLElement);
  };
  const onKey = (p: Placed) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBuilding(p, e.currentTarget);
    }
  };

  const openingLabel = (product: Product) => {
    if (!product.publicationDate) return t("mcSoon");
    const at = new Date(`${product.publicationDate}T12:00:00Z`);
    if (Number.isNaN(at.getTime())) return t("mcSoon");
    const day = new Intl.DateTimeFormat(language === "ar" ? "ar-u-nu-arab" : "en-GB", {
      day: "numeric",
      month: language === "ar" ? "long" : "short",
      timeZone: "Asia/Riyadh",
    }).format(at);
    return fill(t("mcOpening"), day);
  };

  const activePlaced = placed.find((p) => p.product.id === active) ?? null;
  // Back-to-front draw order (HQ sits at depth 0).
  const drawOrder = [...placed].sort((a, b) => a.cx + a.cy - (b.cx + b.cy) || a.cx - b.cx);
  const hqIndex = drawOrder.findIndex((p) => p.cx + p.cy > 0);
  const layers = [
    { z: TECH_Z, th: 16, cls: "mc-slab-tech", label: t("mcLayerTech"), code: "L1" },
    { z: DATA_Z, th: 8, cls: "mc-slab-data", label: t("mcLayerData"), code: "L2" },
    { z: 0, th: 12, cls: "mc-slab-app", label: t("mcLayerApps"), code: "L3" },
  ];
  const labelAt = (z: number): [number, number] => {
    const [x, y] = iso(max, min, z);
    return [x + 16, y + 6];
  };

  const renderBuilding = (p: Placed, idx: number) => {
    const on = active === p.product.id;
    const soon = p.product.comingSoon;
    const siteIndex = sites.indexOf(p);
    const f = p.spec.footprint;
    const signAt = iso(f.x + 0.1, f.y + f.d - 0.15, p.top + 2);
    const blockList = blocks(p.spec);
    return (
      <g
        key={p.product.id}
        className="mc-building"
        data-on={on ? "" : undefined}
        data-soon={soon ? "" : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${p.product.name} — ${p.product.label} — ${soon ? openingLabel(p.product) : t("inspectorAvailable")}`}
        aria-expanded={openId === p.product.id}
        style={{ "--h": p.spec.hue } as CSSProperties}
        onMouseEnter={() => setActive(p.product.id)}
        onMouseLeave={() => setActive((a) => (a === p.product.id ? null : a))}
        onFocus={() => setActive(p.product.id)}
        onBlur={() => setActive((a) => (a === p.product.id ? null : a))}
        onClick={(e) => openBuilding(p, e.currentTarget)}
        onKeyDown={onKey(p)}
      >
        {/* hit area: the whole lot volume */}
        <polygon points={boxFaces(f, 0, p.spec.height).left} className="mc-hit" />
        <polygon points={boxFaces(f, 0, p.spec.height).right} className="mc-hit" />
        <polygon points={boxFaces(f, 0, p.spec.height).top} className="mc-hit" />
        <g className="mc-lift">
          {soon && siteIndex >= 0 ? (
            <>
              {/* partially built floors */}
              <polygon
                ref={ref(`bl${siteIndex}`)}
                points={boxFaces(f, 0, p.spec.height * 0.5).left}
                className="mc-face mc-l mc-concrete"
              />
              <polygon
                ref={ref(`br${siteIndex}`)}
                points={boxFaces(f, 0, p.spec.height * 0.5).right}
                className="mc-face mc-r mc-concrete"
              />
              <polygon
                ref={ref(`bt${siteIndex}`)}
                points={boxFaces(f, 0, p.spec.height * 0.5).top}
                className="mc-face mc-t mc-concrete"
              />
              <polygon points={boxFaces(f, 0, 9).left} fill="url(#mc-hazard)" />
              <polygon points={boxFaces(f, 0, 9).right} fill="url(#mc-hazard)" />
              {/* scaffold wireframe to full height */}
              <Scaffold f={f} h={p.spec.height} />
              {/* crane */}
              <g className="mc-crane">
                <path
                  d={`M${pt(f.x - 0.25, f.y - 0.25, 0)}L${pt(f.x - 0.25, f.y - 0.25, p.spec.height + 46)}`}
                  className="mc-mast"
                />
                <path
                  d={`M${pt(f.x - 0.25, f.y - 0.25, p.spec.height + 46)}L${pt(f.x - 0.25, f.y - 0.25, p.spec.height + 68)}`}
                  className="mc-mast-top"
                />
                <path ref={ref(`tie${siteIndex}`)} className="mc-tie" />
                <path ref={ref(`jib${siteIndex}`)} className="mc-jib" />
                <path ref={ref(`cable${siteIndex}`)} className="mc-cable" />
                <polygon ref={ref(`kl${siteIndex}`)} className="mc-block mc-l" />
                <polygon ref={ref(`kr${siteIndex}`)} className="mc-block mc-r" />
                <polygon ref={ref(`kt${siteIndex}`)} className="mc-block mc-t" />
              </g>
            </>
          ) : (
            <>
              {blockList.map((b, k) => (
                <Box
                  key={k}
                  f={b.f}
                  z0={b.z0}
                  h={b.h}
                  seed={`${p.product.id}${k}`}
                  gap={p.spec.windowGap}
                  windows={!mobile || k === 0}
                />
              ))}
              {p.spec.kind === "dome" ? <Dome f={f} z={p.spec.height * 0.72} /> : null}
            </>
          )}
          {!soon ? (
            <Sign
              at={signAt}
              text={p.product.name}
              width={Math.min(96, Math.max(f.w * 36, p.product.name.length * 5.6 + 8))}
            />
          ) : (
            <Sign
              at={iso(f.x + 0.05, f.y + f.d + 0.55, 0)}
              text={openingLabel(p.product)}
              width={Math.max(64, openingLabel(p.product).length * 5.4 + 10)}
              className="mc-sign mc-sign-site"
            />
          )}
        </g>
        {idx < 0 ? null : null}
      </g>
    );
  };

  const hq = (
    <g key="hq" className="mc-hq" aria-hidden="true" style={{ "--h": 220 } as CSSProperties}>
      <Box f={{ x: -0.95, y: -0.95, w: 1.9, d: 1.9 }} z0={0} h={hqH * 0.55} seed="hq0" />
      <Box f={{ x: -0.7, y: -0.7, w: 1.4, d: 1.4 }} z0={hqH * 0.55} h={hqH * 0.3} seed="hq1" />
      <Box f={{ x: -0.42, y: -0.42, w: 0.84, d: 0.84 }} z0={hqH * 0.85} h={hqH * 0.15} seed="hq2" />
      <path d={`M${pt(0, 0, hqH)}L${pt(0, 0, hqH + 46)}`} className="mc-antenna" />
      {/* rooftop billboard with the logo */}
      <g
        transform={`matrix(0.894 0.447 0 1 ${iso(-0.66, 0.62, hqH * 0.85)[0]} ${iso(-0.66, 0.62, hqH * 0.85)[1]})`}
        className="mc-billboard"
      >
        <path d="M6 0V12M44 0V12" className="mc-sign-pole" />
        <rect x="0" y="-30" width="50" height="30" rx="2" />
        {settings.logoUrl ? (
          <image
            href={settings.logoUrl}
            x="4"
            y="-27"
            width="42"
            height="17"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
        <text x="25" y="-4" textAnchor="middle">
          E20E HQ
        </text>
      </g>
      <g transform={`translate(${iso(0, 0, hqH + 46).join(" ")})`}>
        <ellipse className="mc-beam" rx="120" ry="7" />
        <circle r="9" className="mc-beacon-glow" />
        <circle r="3.4" className="mc-beacon" />
      </g>
    </g>
  );

  const svgScene = (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="mc-svg"
      role="img"
      aria-label={t("mcCity")}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="mc-hazard"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#1d1d1d" />
          <rect width="4" height="8" fill="#F4B860" />
        </pattern>
        <radialGradient id="mc-dome" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#DDF7FF" />
          <stop offset="0.5" stopColor="#5FC9D8" />
          <stop offset="1" stopColor="#1B4E6B" />
        </radialGradient>
        <linearGradient id="mc-beam-g" x1="0" x2="1">
          <stop offset="0" stopColor="#FFF3C4" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFF3C4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFF3C4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="mc-camera" style={{ transform: zoom, transformOrigin: "0 0" }}>
        <g transform={`translate(${ox} ${oy})`}>
          {/* exploded-view connectors between layers */}
          {[
            [min, max],
            [max, max],
            [max, min],
          ].map(([gx, gy]) => (
            <path
              key={`${gx}${gy}`}
              d={`M${pt(gx!, gy!, TECH_Z)}L${pt(gx!, gy!, BIZ_Z)}`}
              className="mc-connector"
            />
          ))}

          {layers.map((L) => {
            const faces = boxFaces(slab, L.z - L.th, L.th);
            const [lx, ly] = labelAt(L.z - L.th / 2);
            return (
              <g key={L.code} className={`mc-slab ${L.cls}`}>
                <polygon points={faces.left} className="mc-slab-l" />
                <polygon points={faces.right} className="mc-slab-r" />
                <polygon points={faces.top} className="mc-slab-t" />
                {L.cls === "mc-slab-tech"
                  ? roads.map((g) => (
                      <g key={g}>
                        <path
                          d={`M${pt(g, min + 0.3, L.z)}L${pt(g, max - 0.3, L.z)}`}
                          className="mc-tray"
                        />
                        <path
                          d={`M${pt(min + 0.3, g + 0.4, L.z)}L${pt(max - 0.3, g + 0.4, L.z)}`}
                          className="mc-pipe"
                        />
                      </g>
                    ))
                  : null}
                {L.cls === "mc-slab-data"
                  ? roads.map((g, i) => (
                      <g key={g}>
                        <path
                          d={`M${pt(g, min + 0.2, L.z)}L${pt(g, max - 0.2, L.z)}`}
                          className="mc-stream"
                          style={{ animationDelay: `${-i * 0.7}s` }}
                        />
                        <path
                          d={`M${pt(min + 0.2, g, L.z)}L${pt(max - 0.2, g, L.z)}`}
                          className="mc-stream mc-stream-b"
                          style={{ animationDelay: `${-i * 0.5}s` }}
                        />
                      </g>
                    ))
                  : null}
                <text x={lx} y={ly} className="mc-layer-label">
                  <tspan className="mc-layer-code">{L.code}</tspan> {L.label}
                </text>
              </g>
            );
          })}

          {/* street level: roads, plazas, trees */}
          {roads.map((g) => (
            <g key={`road${g}`}>
              <polygon
                points={boxFaces({ x: g - 0.5, y: min, w: 1, d: max - min }, 0, 0.5).top}
                className="mc-road"
              />
              <polygon
                points={boxFaces({ x: min, y: g - 0.5, w: max - min, d: 1 }, 0, 0.5).top}
                className="mc-road"
              />
            </g>
          ))}
          {roads.map((g) => (
            <g key={`lane${g}`}>
              <path d={`M${pt(g, min, 1)}L${pt(g, max, 1)}`} className="mc-lane" />
              <path d={`M${pt(min, g, 1)}L${pt(max, g, 1)}`} className="mc-lane" />
            </g>
          ))}
          {activePlaced ? (
            <path
              d={activePlaced.route.map(([x, y], i) => `${i ? "L" : "M"}${pt(x, y, 2)}`).join("")}
              className="mc-route"
            />
          ) : null}
          {placed.map((p) => (
            <polygon
              key={`plaza${p.product.id}`}
              points={boxFaces({ x: p.cx - 1, y: p.cy - 1, w: 2, d: 2 }, 0, 2).top}
              className="mc-plaza"
            />
          ))}
          <polygon
            points={boxFaces({ x: -1, y: -1, w: 2, d: 2 }, 0, 2).top}
            className="mc-plaza mc-plaza-hq"
          />
          {parkLots(list.length).map(([a, b]) => {
            const [gx, gy] = rtl ? [b, a] : [a, b];
            const r = rng(`park${gx}${gy}`);
            return (
              <g key={`park${gx}${gy}`}>
                <polygon
                  points={boxFaces({ x: gx - 0.95, y: gy - 0.95, w: 1.9, d: 1.9 }, 0, 2).top}
                  className="mc-park"
                />
                <path
                  d={`M${pt(gx - 0.9, gy, 2.5)}L${pt(gx + 0.9, gy, 2.5)}M${pt(gx, gy - 0.9, 2.5)}L${pt(gx, gy + 0.9, 2.5)}`}
                  className="mc-path"
                />
                {[
                  [-0.5, -0.5],
                  [0.5, -0.5],
                  [-0.5, 0.5],
                  [0.5, 0.5],
                  [0, -0.1],
                ].map(([dx, dy], k) => {
                  const [x, y] = iso(gx + dx!, gy + dy!, 2);
                  return (
                    <g key={k} transform={`translate(${x} ${y})`} className="mc-tree">
                      <path d="M0 0V-7" />
                      <circle cy="-11" r={k === 4 ? 3 : 4.5 + r() * 2.5} />
                    </g>
                  );
                })}
              </g>
            );
          })}
          {placed.map((p) => {
            const r = rng(`tree${p.product.id}`);
            return [0, 1].map((k) => {
              const gx = p.cx + (k ? 0.8 : -0.8) * (r() > 0.5 ? 1 : 1);
              const gy = p.cy + 0.82;
              const [x, y] = iso(gx, gy, 2);
              return (
                <g
                  key={`t${p.product.id}${k}`}
                  transform={`translate(${x} ${y})`}
                  className="mc-tree"
                >
                  <path d="M0 0V-7" />
                  <circle cy="-11" r={4.5 + r() * 2} />
                </g>
              );
            });
          })}

          {/* cars and light packets */}
          {cars.map((c, i) => (
            <g key={`car${i}`} ref={ref(`car${i}`)} className={c.packet ? "mc-packet" : "mc-car"}>
              {c.packet ? (
                <circle r="3" />
              ) : (
                <>
                  <polygon
                    points={
                      boxFaces(
                        {
                          x: -0.16,
                          y: -0.1,
                          w: c.vertical ? 0.2 : 0.32,
                          d: c.vertical ? 0.32 : 0.2,
                        },
                        0,
                        4,
                      ).left
                    }
                    className="mc-car-l"
                    style={{ "--hue": hash(String(i)) % 360 } as CSSProperties}
                  />
                  <polygon
                    points={
                      boxFaces(
                        {
                          x: -0.16,
                          y: -0.1,
                          w: c.vertical ? 0.2 : 0.32,
                          d: c.vertical ? 0.32 : 0.2,
                        },
                        0,
                        4,
                      ).right
                    }
                    className="mc-car-r"
                    style={{ "--hue": hash(String(i)) % 360 } as CSSProperties}
                  />
                  <polygon
                    points={
                      boxFaces(
                        {
                          x: -0.16,
                          y: -0.1,
                          w: c.vertical ? 0.2 : 0.32,
                          d: c.vertical ? 0.32 : 0.2,
                        },
                        0,
                        4,
                      ).top
                    }
                    className="mc-car-t"
                    style={{ "--hue": hash(String(i)) % 360 } as CSSProperties}
                  />
                  <circle r="1.6" cx="3" cy="-1" className="mc-headlight" />
                </>
              )}
            </g>
          ))}

          {/* buildings, back to front, HQ in its depth slot */}
          {drawOrder
            .slice(0, hqIndex < 0 ? drawOrder.length : hqIndex)
            .map((p, i) => renderBuilding(p, i))}
          {hq}
          {hqIndex < 0 ? null : drawOrder.slice(hqIndex).map((p, i) => renderBuilding(p, i))}

          {/* drones */}
          {drones.map((d, i) => (
            <g
              key={`drone${d.product.id}`}
              ref={ref(`drone${i}`)}
              className="mc-drone"
              data-carry="1"
            >
              <path d="M-6 -2L6 2M-6 2L6 -2" />
              <circle cy="5" r="2.6" className="mc-drone-packet" />
            </g>
          ))}

          {/* business layer: glass ceiling the skyline rises into */}
          <g className="mc-biz">
            <polygon points={boxFaces(slab, BIZ_Z, 0).top} />
            <text x={labelAt(BIZ_Z)[0]} y={labelAt(BIZ_Z)[1]} className="mc-layer-label">
              <tspan className="mc-layer-code">L4</tspan> {t("mcLayerBusiness")}
            </text>
          </g>

          {/* hover label */}
          {activePlaced && !openPlaced ? (
            <g
              className="mc-float"
              transform={`translate(${iso(activePlaced.cx, activePlaced.cy, activePlaced.top + 46).join(" ")})`}
              pointerEvents="none"
            >
              <rect x="-80" y="-30" width="160" height="38" rx="8" />
              <text y="-13" textAnchor="middle" className="mc-float-name">
                {activePlaced.product.name}
              </text>
              <text y="1" textAnchor="middle" className="mc-float-cat">
                {activePlaced.product.label}
              </text>
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );

  return (
    <div
      ref={root}
      className="mc-stage"
      data-mobile={mobile ? "" : undefined}
      data-zoomed={openPlaced && !mobile ? "" : undefined}
      data-static={motion.animate ? undefined : ""}
      style={{ "--night": STATIC_NIGHT } as CSSProperties}
    >
      <div className="mc-sky" aria-hidden="true">
        <span className="mc-stars" />
        <span className="mc-orb" />
        <span className="mc-cloud mc-cloud-back mc-c1" />
        <span className="mc-cloud mc-cloud-back mc-c2" />
        <span className="mc-cloud mc-cloud-back mc-c3" />
      </div>
      <div ref={scroller} className="mc-scroll">
        <div
          className="mc-canvas"
          style={mobile ? { inlineSize: `${Math.round(VW * 0.9)}px` } : undefined}
        >
          {svgScene}
          {mobile
            ? placed.map((p) => (
                <span
                  key={`snap${p.product.id}`}
                  className="mc-snap"
                  style={{ insetInlineStart: `${((iso(p.cx, p.cy)[0] + ox) / VW) * 100}%` }}
                  aria-hidden="true"
                />
              ))
            : null}
        </div>
      </div>
      <div className="mc-clouds-front" aria-hidden="true">
        <span className="mc-cloud mc-c4" />
        <span className="mc-cloud mc-c5" />
      </div>
      <div className="mc-intro" dir={dir}>
        <p className="mc-title" aria-hidden="true">
          {settings.displayTitle}
        </p>
        {settings.tagline ? <p className="mc-tagline">{settings.tagline}</p> : null}
        {mobile ? <p className="mc-swipe">{t("mcSwipe")} ⟷</p> : null}
      </div>
      {!mobile && motion.animate ? (
        <div className="mc-controls" role="group" aria-label={t("mcControls")} dir={dir}>
          <button
            type="button"
            onClick={() => setCyclePaused((v) => !v)}
            aria-pressed={cyclePaused}
            aria-label={cyclePaused ? t("mcPlay") : t("mcPause")}
          >
            {cyclePaused ? "▶" : "❚❚"}
          </button>
          <button type="button" onClick={() => jump(0.27)}>
            ☀ {t("mcDay")}
          </button>
          <button type="button" onClick={() => jump(0.8)}>
            ☾ {t("mcNight")}
          </button>
        </div>
      ) : null}
      {openPlaced ? (
        <>
          {!mobile ? <span className="mc-projector" aria-hidden="true" /> : null}
          <InspectorPanel
            product={openPlaced.product}
            className="mc-holo"
            onClose={inspector.close}
            title={<span>{openPlaced.product.label}</span>}
          >
            <Hologram product={openPlaced.product} />
          </InspectorPanel>
        </>
      ) : null}
    </div>
  );
}

function Scaffold({ f, h }: { f: Footprint; h: number }) {
  const x1 = f.x + f.w,
    y1 = f.y + f.d;
  const lines: string[] = [];
  const corners: [number, number][] = [
    [f.x, y1],
    [x1, y1],
    [x1, f.y],
  ];
  corners.forEach(([gx, gy]) => lines.push(`M${pt(gx, gy, 0)}L${pt(gx, gy, h)}`));
  for (let z = 0; z <= h; z += 18) {
    lines.push(`M${pt(f.x, y1, z)}L${pt(x1, y1, z)}L${pt(x1, f.y, z)}`);
    if (z + 18 <= h) {
      lines.push(`M${pt(f.x, y1, z)}L${pt(x1, y1, z + 18)}`);
      lines.push(`M${pt(x1, y1, z)}L${pt(x1, f.y, z + 18)}`);
    }
  }
  lines.push(`M${pt(f.x, f.y, h)}L${pt(x1, f.y, h)}L${pt(x1, y1, h)}L${pt(f.x, y1, h)}Z`);
  return <path d={lines.join("")} className="mc-scaffold" />;
}

function Dome({ f, z }: { f: Footprint; z: number }) {
  const cx = f.x + f.w / 2,
    cy = f.y + f.d / 2;
  const [x, y] = iso(cx, cy, z);
  const rx = ((f.w + f.d) / 2) * 22;
  const ry = rx / 2;
  return (
    <g>
      <path
        d={`M${x - rx} ${y}A${rx} ${rx * 1.05} 0 0 1 ${x + rx} ${y}A${rx} ${ry} 0 0 1 ${x - rx} ${y}Z`}
        fill="url(#mc-dome)"
        className="mc-dome"
      />
      <path d={`M${x - rx} ${y}A${rx} ${ry} 0 0 0 ${x + rx} ${y}`} className="mc-neon" />
      <path d={`M${x} ${y - rx * 1.05}V${y - rx * 1.05 - 14}`} className="mc-antenna" />
    </g>
  );
}
