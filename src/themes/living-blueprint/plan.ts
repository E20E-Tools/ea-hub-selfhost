/** Deterministic floor-plan generator for the Living Blueprint stage (browser-safe, no React). */

export type Pt = [number, number];
export type Rect = { x: number; y: number; w: number; h: number };
export type Wall = "top" | "bottom" | "left" | "right";
export type PlanRoom = Rect & {
  index: number;
  /** Door centre on the wall that faces the corridor. */
  door: { x: number; y: number; wall: Wall };
  /** Orthogonal corridor centre-line from the door to the atrium edge. */
  corridor: Pt[];
  /** Outer-wall window span (start/end along the wall) when the room touches the façade. */
  window: { wall: Wall; from: number; to: number } | null;
};
export type FloorPlan = {
  width: number;
  height: number;
  outer: Rect;
  atrium: Rect;
  rooms: PlanRoom[];
  vertical: boolean;
};

export const DESKTOP = { width: 1200, height: 760 } as const;
const MOBILE_W = 360;

const weight = (features: number) =>
  1 + 0.15 * Math.min(Math.max(features, 0), 5);
const depthFactor = (features: number) =>
  0.8 + 0.04 * Math.min(Math.max(features, 0), 5);
const r1 = (v: number) => Math.round(v * 10) / 10;

function band(
  counts: number[],
  x0: number,
  x1: number,
  wallY: number,
  maxDepth: number,
  side: "top" | "bottom",
  corridorY: number,
  atrium: Rect,
  start: number,
): PlanRoom[] {
  const total = counts.reduce((s, f) => s + weight(f), 0);
  let x = x0;
  return counts.map((f, i) => {
    const w = ((x1 - x0) * weight(f)) / total;
    const h = maxDepth * depthFactor(f);
    const y = side === "top" ? wallY : wallY - h;
    const doorY = side === "top" ? y + h : y;
    const dx = x + w / 2;
    // Join the atrium inside its span so every corridor lands on the atrium wall.
    const jx = Math.min(Math.max(dx, atrium.x + 24), atrium.x + atrium.w - 24);
    const ay = side === "top" ? atrium.y : atrium.y + atrium.h;
    const room: PlanRoom = {
      index: start + i,
      x: r1(x),
      y: r1(y),
      w: r1(w),
      h: r1(h),
      door: {
        x: r1(dx),
        y: r1(doorY),
        wall: side === "top" ? "bottom" : "top",
      },
      corridor: [
        [r1(dx), r1(doorY)],
        [r1(dx), corridorY],
        [r1(jx), corridorY],
        [r1(jx), ay],
      ],
      window: { wall: side, from: r1(x + w * 0.3), to: r1(x + w * 0.7) },
    };
    x += w;
    return room;
  });
}

/**
 * Lays one room per product around a central atrium. Desktop: rooms along the top and
 * bottom façades (plus one each side from 9 products). Mobile: rooms stacked on both
 * sides of a central corridor below the atrium. `rtl` mirrors the plan horizontally.
 */
export function generateFloorPlan(
  features: number[],
  opts: { vertical: boolean; rtl?: boolean },
): FloorPlan {
  const list = features.slice(0, 12);
  const plan = opts.vertical ? verticalPlan(list) : desktopPlan(list);
  return opts.rtl ? mirror(plan) : plan;
}

function desktopPlan(list: number[]): FloorPlan {
  const { width, height } = DESKTOP;
  const outer: Rect = { x: 70, y: 70, w: 1060, h: 520 };
  const atrium: Rect = { x: 490, y: 265, w: 220, h: 130 };
  const n = list.length;
  const sides = n >= 9 ? 2 : 0;
  const rest = n - sides;
  const topN = Math.ceil(rest / 2);
  const top = list.slice(0, topN);
  const bottom = list.slice(topN, rest);
  const sideList = list.slice(rest);
  const depth = 150;
  const rooms: PlanRoom[] = [
    ...band(
      top,
      outer.x,
      outer.x + outer.w,
      outer.y,
      depth,
      "top",
      atrium.y - 24,
      atrium,
      0,
    ),
    ...band(
      bottom,
      outer.x,
      outer.x + outer.w,
      outer.y + outer.h,
      depth,
      "bottom",
      atrium.y + atrium.h + 24,
      atrium,
      top.length,
    ),
  ];
  sideList.forEach((f, i) => {
    const left = i === 0;
    const w = 190 + 6 * Math.min(f, 5);
    const x = left ? outer.x : outer.x + outer.w - w;
    const y = atrium.y + 4;
    const h = atrium.h - 8;
    const doorX = left ? x + w : x;
    const cy = r1(y + h / 2);
    rooms.push({
      index: rest + i,
      x,
      y,
      w,
      h,
      door: { x: doorX, y: cy, wall: left ? "right" : "left" },
      corridor: [
        [doorX, cy],
        [left ? atrium.x : atrium.x + atrium.w, cy],
      ],
      window: {
        wall: left ? "left" : "right",
        from: r1(y + h * 0.3),
        to: r1(y + h * 0.7),
      },
    });
  });
  return { width, height, outer, atrium, rooms, vertical: false };
}

function verticalPlan(list: number[]): FloorPlan {
  const width = MOBILE_W;
  const outer: Rect = { x: 16, y: 16, w: width - 32, h: 0 };
  const atrium: Rect = { x: 70, y: 34, w: width - 140, h: 112 };
  const corridorX = width / 2;
  const half = 18; // corridor half-width
  let y = atrium.y + atrium.h + 26;
  const rooms: PlanRoom[] = [];
  for (let row = 0; row * 2 < list.length; row++) {
    const pair = list.slice(row * 2, row * 2 + 2);
    const h = Math.max(...pair.map((f) => 92 + 6 * Math.min(f, 5)));
    pair.forEach((_, k) => {
      const left = k === 0;
      const x = left ? outer.x : corridorX + half;
      const w = corridorX - half - outer.x;
      const doorX = left ? x + w : x;
      const cy = r1(y + h / 2);
      rooms.push({
        index: row * 2 + k,
        x,
        y: r1(y),
        w,
        h,
        door: { x: doorX, y: cy, wall: left ? "right" : "left" },
        corridor: [
          [doorX, cy],
          [corridorX, cy],
          [corridorX, atrium.y + atrium.h],
        ],
        window: {
          wall: left ? "left" : "right",
          from: r1(y + h * 0.3),
          to: r1(y + h * 0.7),
        },
      });
    });
    y += h;
  }
  outer.h = r1(y + 18 - outer.y);
  return {
    width,
    height: r1(outer.y + outer.h + 16),
    outer,
    atrium,
    rooms,
    vertical: true,
  };
}

function mirror(plan: FloorPlan): FloorPlan {
  const W = plan.width;
  const mx = (x: number) => r1(W - x);
  const flipWall = (w: Wall): Wall =>
    w === "left" ? "right" : w === "right" ? "left" : w;
  const rect = (r: Rect): Rect => ({ ...r, x: r1(W - r.x - r.w) });
  return {
    ...plan,
    outer: rect(plan.outer),
    atrium: rect(plan.atrium),
    rooms: plan.rooms.map((room) => ({
      ...room,
      ...rect(room),
      door: {
        x: mx(room.door.x),
        y: room.door.y,
        wall: flipWall(room.door.wall),
      },
      corridor: room.corridor.map(([x, y]) => [mx(x), y] as Pt),
      window: room.window
        ? room.window.wall === "top" || room.window.wall === "bottom"
          ? {
              wall: room.window.wall,
              from: mx(room.window.to),
              to: mx(room.window.from),
            }
          : { ...room.window, wall: flipWall(room.window.wall) }
        : null,
    })),
  };
}

export function overlaps(a: Rect, b: Rect): boolean {
  const e = 0.5; // shared walls are allowed
  return (
    a.x + e < b.x + b.w &&
    b.x + e < a.x + a.w &&
    a.y + e < b.y + b.h &&
    b.y + e < a.y + a.h
  );
}

export function onRectEdge([x, y]: Pt, r: Rect, tol = 0.6): boolean {
  const inX = x >= r.x - tol && x <= r.x + r.w + tol;
  const inY = y >= r.y - tol && y <= r.y + r.h + tol;
  const onV = Math.abs(x - r.x) <= tol || Math.abs(x - (r.x + r.w)) <= tol;
  const onH = Math.abs(y - r.y) <= tol || Math.abs(y - (r.y + r.h)) <= tol;
  return (inX && onH) || (inY && onV);
}

/** Path for a rectangle so stroke-dash drawing works on every element type. */
export function rectPath(r: Rect): string {
  return `M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`;
}
export function polyPath(points: Pt[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");
}

/** Revision cloud: scalloped arcs around a rectangle (offset `pad`). */
export function revisionCloud(r: Rect, pad = 9, bump = 18): string {
  const x0 = r.x - pad,
    y0 = r.y - pad,
    x1 = r.x + r.w + pad,
    y1 = r.y + r.h + pad;
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / bump));
    let d = "";
    for (let i = 1; i <= n; i++) {
      const px = ax + ((bx - ax) * i) / n;
      const py = ay + ((by - ay) * i) / n;
      d += `A${r1(len / n / 1.7)} ${r1(len / n / 1.7)} 0 0 1 ${r1(px)} ${r1(py)}`;
    }
    return d;
  };
  return `M${r1(x0)} ${r1(y0)}${seg(x0, y0, x1, y0)}${seg(x1, y0, x1, y1)}${seg(x1, y1, x0, y1)}${seg(x0, y1, x0, y0)}Z`;
}

/** Door swing: opening on the wall, a leaf into the room and a quarter arc. */
export function doorSwing(
  door: PlanRoom["door"],
  size = 30,
): { gap: string; leaf: string; arc: string } {
  const { x, y, wall } = door;
  const s = size / 2;
  if (wall === "top" || wall === "bottom") {
    const into = wall === "bottom" ? -1 : 1; // leaf swings into the room
    const hx = x - s;
    return {
      gap: `M${hx} ${y}H${x + s}`,
      leaf: `M${hx} ${y}V${y + into * size}`,
      arc: `M${hx} ${y + into * size}A${size} ${size} 0 0 ${into > 0 ? 0 : 1} ${x + s} ${y}`,
    };
  }
  const into = wall === "right" ? -1 : 1;
  const hy = y - s;
  return {
    gap: `M${x} ${hy}V${y + s}`,
    leaf: `M${x} ${hy}H${x + into * size}`,
    arc: `M${x + into * size} ${hy}A${size} ${size} 0 0 ${into > 0 ? 1 : 0} ${x} ${y + s}`,
  };
}
