import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Product } from "@/lib/catalog";
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
import { launchInstant } from "../launch";
import {
  SUN_Z,
  behindSun,
  depthIndex,
  formatTDays,
  formatTMinus,
  idHue,
  orbitLayout,
  placeLabel,
  project,
} from "./orbits";

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

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function HudBody({ product }: { product: Product }) {
  const { t } = useLanguage();
  const facts = useInspectorFacts(product);
  const now = useNow(1000);
  const at = launchInstant(product);
  const tminus = at ? formatTMinus(at.getTime() - now.getTime()) : null;
  return (
    <div className="gx-hud-body">
      <dl className="gx-telemetry">
        <div>
          <dt>{t("gxClass")}</dt>
          <dd>{product.label}</dd>
        </div>
        <div>
          <dt>{t("gxStatus")}</dt>
          <dd data-soon={facts.available ? undefined : ""}>
            <span className="gx-beacon" aria-hidden="true" />
            {facts.available ? t("gxOperational") : t("gxInFormation")}
          </dd>
        </div>
        {facts.launch ? (
          <div>
            <dt>{t("gxLaunch")}</dt>
            <dd>
              <bdi className="gx-tminus" dir="ltr" aria-live="off">
                {tminus ?? facts.launch}
              </bdi>
              <small>{facts.launch}</small>
            </dd>
          </div>
        ) : null}
      </dl>
      {facts.features.length ? (
        <div className="gx-modules">
          <span className="gx-key">{t("gxModules")}</span>
          <ul>
            {facts.features.map((f, i) => (
              <li key={f}>
                <span dir="ltr" className="gx-mod-id">{`M${String(i + 1).padStart(2, "0")}`}</span>{" "}
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="gx-desc">{product.description}</p>
      <InspectorActions
        product={product}
        className="gx-hud-actions"
        details={t("gxLand")}
        openTool={t("gxLaunchTool")}
      />
    </div>
  );
}

type Star = { x: number; y: number; r: number; a: number; ph: number; sp: number };

export default function GalaxyStage({ products, settings }: StageProps) {
  const { t, language, dir } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const motion = useStageMotion(root);
  const mobile = useMobile();
  const list = products.slice(0, 12);
  const orbits = useMemo(() => orbitLayout(list.length), [list.length]);
  const inspector = useProductInspector();
  const [hover, setHover] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const planetRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const now = useNow(1000);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tilt = mobile ? 0.62 : 0.36;
  const cx = size.w / 2;
  const cy = size.h * (mobile ? 0.5 : 0.53);
  const R = Math.max(
    80,
    Math.min(size.w * (mobile ? 0.42 : 0.39), (size.h * (mobile ? 0.36 : 0.36)) / tilt),
  );
  const sunR = Math.min(Math.max(R * 0.16, 34), 84);
  const planetSize = Math.min(Math.max(R * 0.13, 38), 74);

  // Shared mutable state for the single animation loop.
  const live = useRef({
    hover: null as string | null,
    open: null as string | null,
    zoom: 0,
    fx: 0,
    fy: 0,
    px: 0,
    py: 0,
  });
  live.current.hover = hover;
  live.current.open = inspector.openId;

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const budget = (mobile ? 0.45 : 1) * motion.scale;
    const layers: Star[][] = [140, 80, 34].map((n, li) =>
      Array.from({ length: Math.round(n * budget) + 8 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: (0.5 + Math.random() * 0.7) * (li + 1) * 0.55,
        a: 0.35 + Math.random() * 0.55,
        ph: Math.random() * 6.28,
        sp: 0.6 + Math.random() * 1.8,
      })),
    );
    const times = orbits.map(() => 0);
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      pointer.tx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 30));
      pointer.ty = Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 30));
    };
    const animate = motion.running;
    if (animate) {
      root.current?.addEventListener("pointermove", onMove);
      window.addEventListener("deviceorientation", onTilt);
    }
    let speed = 1;
    let last = performance.now();
    let elapsed = 0;
    let raf = 0;
    const frame = (nowMs: number) => {
      const dt = animate ? Math.min(0.05, (nowMs - last) / 1000) : 0;
      last = nowMs;
      elapsed += dt;
      const st = live.current;
      speed += ((st.open ? 0 : 1) - speed) * Math.min(1, dt * 2.5);
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);

      // Starfield.
      ctx.clearRect(0, 0, size.w, size.h);
      layers.forEach((layer, li) => {
        const depth = [6, 14, 28][li] ?? 6;
        const ox = -pointer.x * depth;
        const oy = -pointer.y * depth;
        for (const s of layer) {
          const tw = animate ? 0.7 + 0.3 * Math.sin(elapsed * s.sp + s.ph) : 1;
          ctx.globalAlpha = s.a * tw;
          ctx.fillStyle = li === 2 ? "#fff6dd" : "#dfe8ff";
          const x = (((s.x * size.w + ox) % size.w) + size.w) % size.w;
          const y = (((s.y * size.h + oy) % size.h) + size.h) % size.h;
          ctx.beginPath();
          ctx.arc(x, y, s.r, 0, 6.283);
          ctx.fill();
        }
      });
      if (animate) {
        if (!shoot && Math.random() < dt * 0.09 * motion.scale) {
          shoot = {
            x: Math.random() * size.w,
            y: Math.random() * size.h * 0.4,
            vx: -380 - Math.random() * 200,
            vy: 160 + Math.random() * 80,
            life: 1,
          };
        }
        if (shoot) {
          shoot.x += shoot.vx * dt;
          shoot.y += shoot.vy * dt;
          shoot.life -= dt * 1.1;
          const g = ctx.createLinearGradient(
            shoot.x,
            shoot.y,
            shoot.x - shoot.vx * 0.18,
            shoot.y - shoot.vy * 0.18,
          );
          g.addColorStop(0, `rgba(255,255,255,${Math.max(0, shoot.life)})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.globalAlpha = 1;
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(shoot.x, shoot.y);
          ctx.lineTo(shoot.x - shoot.vx * 0.18, shoot.y - shoot.vy * 0.18);
          ctx.stroke();
          if (shoot.life <= 0) shoot = null;
        }
      }
      ctx.globalAlpha = 1;

      // Planets. Label sizes are read before any style writes to avoid layout thrash.
      const labelBoxes = labelRefs.current.map((l) =>
        l ? [l.offsetWidth, l.offsetHeight] : [0, 0],
      );
      orbits.forEach((o, i) => {
        const p = list[i];
        const el = planetRefs.current[i];
        const lab = labelRefs.current[i];
        if (!p || !el) return;
        times[i] = (times[i] ?? 0) + dt * speed * (st.hover === p.id ? 0.2 : 1);
        const pr = project(o, (times[i] ?? 0) + (animate ? 0 : 6), tilt);
        const x = cx + pr.x * R;
        const y = cy + pr.y * R;
        const s = pr.scale;
        el.style.transform = `translate3d(${(x - planetSize / 2).toFixed(1)}px, ${(y - planetSize / 2).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        el.style.zIndex = String(depthIndex(pr.z));
        const vx = cx - x;
        const vy = cy - y;
        const len = Math.hypot(vx, vy) || 1;
        el.style.setProperty("--lx", (vx / len).toFixed(3));
        el.style.setProperty("--ly", (vy / len).toFixed(3));
        el.style.setProperty("--far", ((1 - pr.z) / 2).toFixed(3));
        if (st.open === p.id) {
          st.px = x;
          st.py = y;
        }
        if (lab) {
          const hidden = behindSun(pr, (sunR * 1.25) / R) || Boolean(st.open);
          // Label sits on the reading-end side of the planet, flips to the inner side near the
          // stage edge, then clamps so it is always fully inside the stage.
          const [lw = 0, lh = 0] = labelBoxes[i] ?? [];
          const placed = placeLabel(x, (planetSize * s) / 2 + 8, lw, size.w, dir === "rtl");
          const pad = 8;
          const lx = placed.x;
          const ly = Math.max(pad, Math.min(size.h - pad - lh, y - 14));
          const side = placed.side;
          if (lab.dataset["side"] !== side) lab.dataset["side"] = side;
          lab.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
          lab.style.opacity = hidden ? "0" : String(0.55 + 0.45 * ((pr.z + 1) / 2));
          lab.style.zIndex = String(depthIndex(pr.z) + 1);
        }
      });

      // Camera zoom toward the opened planet.
      const target = st.open && animate ? 1 : 0;
      st.zoom += (target - st.zoom) * Math.min(1, dt * 2.6);
      if (st.open) {
        st.fx += (st.px - st.fx) * Math.min(1, dt * 4 + (st.zoom < 0.02 ? 1 : 0));
        st.fy += (st.py - st.fy) * Math.min(1, dt * 4 + (st.zoom < 0.02 ? 1 : 0));
      }
      if (scene.current) {
        const k = st.zoom;
        const z = 1 + 0.75 * k;
        const tx = mobile ? size.w / 2 : dir === "rtl" ? size.w * 0.7 : size.w * 0.3;
        const ty = mobile ? size.h * 0.3 : size.h * 0.5;
        const sx = st.fx + (tx - st.fx) * k;
        const sy = st.fy + (ty - st.fy) * k;
        scene.current.style.transform =
          k < 0.001
            ? ""
            : `translate3d(${(sx - st.fx * z).toFixed(1)}px, ${(sy - st.fy * z).toFixed(1)}px, 0) scale(${z.toFixed(4)})`;
      }
      if (animate) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      root.current?.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    size,
    mobile,
    motion.running,
    motion.scale,
    orbits,
    list.length,
    dir,
    motion.running ? null : inspector.openId,
  ]);

  // Static redraw when the inspector toggles while motion is off.
  const openProduct = list.find((p) => p.id === inspector.openId) ?? null;
  const inOrbit = list.filter((p) => !p.comingSoon).length;
  const clock = new Intl.DateTimeFormat(
    language === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Riyadh",
    },
  ).format(now);

  return (
    <div
      ref={root}
      className="gx-stage"
      data-mobile={mobile ? "" : undefined}
      data-open={openProduct ? "" : undefined}
    >
      <div className="gx-nebula" aria-hidden="true" />
      <canvas ref={canvas} className="gx-stars" aria-hidden="true" />

      <div ref={scene} className="gx-scene" dir="ltr">
        <svg className="gx-orbits" width={size.w} height={size.h} aria-hidden="true">
          {orbits.map((o, i) => {
            const p = list[i];
            const firstOnRing = orbits.findIndex((x) => x.ring === o.ring) === i;
            const hot = p && (hover === p.id || inspector.openId === p.id);
            const ringHot = orbits.some(
              (x, j) =>
                x.ring === o.ring &&
                list[j] &&
                (list[j]!.id === hover || list[j]!.id === inspector.openId),
            );
            if (!firstOnRing && !hot) return null;
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx={o.a * R}
                ry={o.a * R * tilt}
                className="gx-orbit"
                data-hot={ringHot ? "" : undefined}
              />
            );
          })}
        </svg>

        <div
          className="gx-sun"
          style={{
            left: cx - sunR,
            top: cy - sunR,
            width: sunR * 2,
            height: sunR * 2,
            zIndex: SUN_Z,
          }}
          aria-hidden="true"
        >
          <span className="gx-corona" />
          <span className="gx-boil" />
          {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="gx-sun-logo" /> : null}
        </div>

        {list.map((p, i) => {
          const at = launchInstant(p);
          const tdays = p.comingSoon
            ? at
              ? formatTDays(at.getTime() - now.getTime())
              : null
            : null;
          const hue = idHue(p.id);
          return (
            <div key={p.id} style={{ display: "contents" }}>
              <button
                ref={(el) => {
                  planetRefs.current[i] = el;
                }}
                type="button"
                className="gx-planet"
                data-soon={p.comingSoon ? "" : undefined}
                data-ring={!p.comingSoon && hue % 2 === 0 ? "" : undefined}
                data-hot={hover === p.id || inspector.openId === p.id ? "" : undefined}
                style={
                  {
                    width: planetSize,
                    height: planetSize,
                    "--hue": hue,
                    "--spin": `${18 + (hue % 14)}s`,
                  } as CSSProperties
                }
                aria-label={`${p.name} — ${p.label} — ${p.comingSoon ? t("comingSoonBadge") : t("gxOperational")}`}
                aria-expanded={inspector.openId === p.id}
                onPointerEnter={() => setHover(p.id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(p.id)}
                onBlur={() => setHover(null)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) =>
                  inspector.openId === p.id
                    ? inspector.close()
                    : inspector.open(p.id, e.currentTarget)
                }
              >
                {p.comingSoon ? <span className="gx-disk" aria-hidden="true" /> : null}
                <span className="gx-ringback" aria-hidden="true" />
                <span
                  className="gx-surface"
                  style={{ backgroundImage: `url(${p.image})` }}
                  aria-hidden="true"
                />
                <span className="gx-shade" aria-hidden="true" />
                <span className="gx-ringfront" aria-hidden="true" />
                {!p.comingSoon ? <span className="gx-moon" aria-hidden="true" /> : null}
                <span className="gx-reticle" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </button>
              <div
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                className="gx-label"
                dir={dir}
                aria-hidden="true"
              >
                <strong dir="ltr">{p.name}</strong>
                <small>
                  {p.label}
                  {p.comingSoon ? <b dir="ltr"> · {tdays ?? t("gxFormingShort")}</b> : null}
                </small>
              </div>
            </div>
          );
        })}
      </div>

      <div className="gx-intro" dir={dir}>
        <p className="gx-eyebrow">{t("gxSystem")}</p>
        <p className="gx-title" aria-hidden="true">
          {settings.displayTitle}
        </p>
        {settings.tagline ? <p className="gx-tagline">{settings.tagline}</p> : null}
      </div>

      <div className="gx-clock" dir={dir} role="status" aria-live="off">
        <span className="gx-key">{t("gxMission")}</span>
        <bdi dir="ltr" className="gx-clock-time">
          {clock}
        </bdi>
        <small>{t("gxRiyadh")}</small>
        <span className="gx-count">
          {fill(t("gxInOrbit"), String(inOrbit))} ·{" "}
          {fill(t("gxForming"), String(list.length - inOrbit))}
        </span>
      </div>

      {openProduct ? (
        <InspectorPanel
          product={openProduct}
          className="gx-hud"
          onClose={inspector.close}
          title={
            <bdi>
              {fill(
                t("gxTarget"),
                language === "ar" ? openProduct.name : openProduct.name.toUpperCase(),
              )}
            </bdi>
          }
        >
          <HudBody product={openProduct} />
        </InspectorPanel>
      ) : null}
    </div>
  );
}
