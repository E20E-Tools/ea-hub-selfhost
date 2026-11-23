/** Pure board geometry for Circuit Core (1–12 chips). Traces run core → chip. */
export type Box = { x: number; y: number; w: number; h: number };
/** `pts` are the trace's polyline vertices (core end first), used by themes that morph traces. */
export type Trace = { d: string; vias: Array<[number, number]>; pts: Array<[number, number]> };
export type CircuitLayout = {
  w: number;
  h: number;
  core: Box;
  chips: Box[];
  traces: Trace[];
  bus?: string | undefined;
};

const CH = 12; // chamfer size

/** Vertical-first trace with a 45° chamfered jog. */
function vTrace(x1: number, y1: number, x2: number, y2: number): Trace {
  if (Math.abs(x2 - x1) < 1)
    return {
      d: `M${x1} ${y1}V${y2}`,
      vias: [[x1, (y1 + y2) / 2]],
      pts: [
        [x1, y1],
        [x1, y2],
      ],
    };
  const s = Math.sign(x2 - x1);
  const v = Math.sign(y2 - y1);
  const c = Math.min(CH, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 4);
  const mid = (y1 + y2) / 2;
  return {
    d: `M${x1} ${y1}V${mid - v * c}L${x1 + s * c} ${mid}H${x2 - s * c}L${x2} ${mid + v * c}V${y2}`,
    pts: [
      [x1, y1],
      [x1, mid - v * c],
      [x1 + s * c, mid],
      [x2 - s * c, mid],
      [x2, mid + v * c],
      [x2, y2],
    ],
    vias: [
      [x1, mid - v * c],
      [x2, mid + v * c],
    ],
  };
}

/** Horizontal-first trace with a 45° chamfered jog. */
function hTrace(x1: number, y1: number, x2: number, y2: number): Trace {
  if (Math.abs(y2 - y1) < 1)
    return {
      d: `M${x1} ${y1}H${x2}`,
      vias: [[(x1 + x2) / 2, y1]],
      pts: [
        [x1, y1],
        [x2, y1],
      ],
    };
  const s = Math.sign(y2 - y1);
  const v = Math.sign(x2 - x1);
  const c = Math.min(CH, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 4);
  const mid = (x1 + x2) / 2;
  return {
    d: `M${x1} ${y1}H${mid - v * c}L${mid} ${y1 + s * c}V${y2 - s * c}L${mid + v * c} ${y2}H${x2}`,
    pts: [
      [x1, y1],
      [mid - v * c, y1],
      [mid, y1 + s * c],
      [mid, y2 - s * c],
      [mid + v * c, y2],
      [x2, y2],
    ],
    vias: [
      [mid - v * c, y1],
      [mid + v * c, y2],
    ],
  };
}

function row(count: number, width: number, chipW: number): number[] {
  const gap = count >= 4 ? 34 : 56;
  const total = count * chipW + (count - 1) * gap;
  const start = (width - total) / 2;
  return Array.from({ length: count }, (_, i) => start + i * (chipW + gap));
}

export function circuitLayout(count: number, mobile: boolean): CircuitLayout {
  const n = Math.max(0, Math.min(12, Math.floor(count)));
  return mobile ? mobileLayout(n) : desktopLayout(n);
}

function desktopLayout(n: number): CircuitLayout {
  const cw = 150;
  const chh = 84;
  const perSide = n >= 9 ? 2 : n >= 4 ? 1 : 0;
  const rest = n - perSide * 2;
  const top = Math.ceil(rest / 2);
  const bottom = rest - top;
  const w = 840;
  const h = perSide === 2 ? 620 : 520;
  const core: Box = { w: 240, h: 140, x: (w - 240) / 2, y: (h - 140) / 2 };
  const chips: Box[] = [];
  const traces: Trace[] = [];

  row(top, w, cw).forEach((x, i) => {
    const chip = { x, y: 24, w: cw, h: chh };
    chips.push(chip);
    traces.push(vTrace(core.x + (core.w * (i + 1)) / (top + 1), core.y, x + cw / 2, chip.y + chh));
  });
  const sideYs =
    perSide === 2 ? [h / 2 - chh - 14, h / 2 + 14] : perSide === 1 ? [h / 2 - chh / 2] : [];
  for (const side of ["left", "right"] as const) {
    sideYs.forEach((y, j) => {
      const x = side === "left" ? 16 : w - 16 - cw;
      chips.push({ x, y, w: cw, h: chh });
      const ay = core.y + (core.h * (j + 1)) / (perSide + 1);
      traces.push(
        side === "left"
          ? hTrace(core.x, ay, x + cw, y + chh / 2)
          : hTrace(core.x + core.w, ay, x, y + chh / 2),
      );
    });
  }
  row(bottom, w, cw).forEach((x, i) => {
    const chip = { x, y: h - 24 - chh, w: cw, h: chh };
    chips.push(chip);
    traces.push(
      vTrace(core.x + (core.w * (i + 1)) / (bottom + 1), core.y + core.h, x + cw / 2, chip.y),
    );
  });
  return { w, h, core, chips, traces };
}

function mobileLayout(n: number): CircuitLayout {
  const w = 360;
  const cw = 140;
  const chh = 78;
  const core: Box = { x: 60, y: 16, w: 240, h: 124 };
  const bus = 180;
  const chips: Box[] = [];
  const traces: Trace[] = [];
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const y = 176 + i * 96;
    const x = left ? 10 : w - 10 - cw;
    chips.push({ x, y, w: cw, h: chh });
    const cy = y + chh / 2;
    const edge = left ? x + cw : x;
    const s = left ? -1 : 1;
    traces.push({
      d: `M${bus} ${core.y + core.h}V${cy - 14}L${bus + s * 14} ${cy}H${edge}`,
      vias: [[bus, cy - 14]],
      pts: [
        [bus, core.y + core.h],
        [bus, cy - 14],
        [bus + s * 14, cy],
        [edge, cy],
      ],
    });
  }
  const last = chips[chips.length - 1];
  const h = last ? last.y + last.h + 20 : core.y + core.h + 20;
  return {
    w,
    h,
    core,
    chips,
    traces,
    bus: last ? `M${bus} ${core.y + core.h}V${last.y + last.h / 2 - 14}` : undefined,
  };
}

/** Longest chip code; every code fits a chip at the narrowest desktop board. */
export const CHIP_CODE_MAX = 7;

/**
 * Short monospace chip code (no invented data): the id when short enough, else the
 * product name (hyphen-joined words or its leading acronym), else a 5-letter abbreviation.
 */
export function chipCode(product: { id: string; name?: string }): string {
  const id = product.id.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (id && id.length <= CHIP_CODE_MAX) return id;
  const words = (product.name ?? "").match(/[A-Za-z0-9]+/g) ?? [];
  const joined = words.join("-").toUpperCase();
  if (words.length && joined.length <= CHIP_CODE_MAX) return joined;
  const acronym = words.find(
    (w) => w.length >= 2 && w.length <= 5 && /[A-Z]/.test(w) && w === w.toUpperCase(),
  );
  if (acronym) return acronym;
  if (words.length >= 2) {
    const initials = words
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    if (initials.length <= CHIP_CODE_MAX) return initials;
  }
  return (id || joined.replace(/-/g, "")).slice(0, 5) || "CHIP";
}
