import {
  khatam,
  polygon,
  starPoints,
  tessellationTile,
  toPath,
  tracePath,
} from "./geometry";

/** Static poster of the Digital Mashrabiya medallion for the admin picker. */
export function MashrabiyaThumb() {
  const cx = 160;
  const cy = 90;
  const tiles = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + 112 * Math.cos(a) * 1.05, cy + 66 * Math.sin(a)] as [
      number,
      number,
    ];
  });
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <pattern
          id="dm-thumb-tess"
          width="24"
          height="24"
          patternUnits="userSpaceOnUse"
        >
          <path
            d={tessellationTile(24)}
            fill="none"
            stroke="oklch(0.74 0.11 80 / 0.22)"
            strokeWidth="0.6"
          />
        </pattern>
      </defs>
      <rect width="320" height="180" fill="oklch(0.26 0.04 172)" />
      <rect width="320" height="180" fill="url(#dm-thumb-tess)" />
      {tiles.map((p, i) => (
        <path
          key={i}
          d={toPath(tracePath([cx, cy], p), false)}
          fill="none"
          stroke="oklch(0.8 0.12 82)"
          strokeWidth="1.4"
        />
      ))}
      <path
        d={toPath(starPoints(cx, cy, 36, 31, 16))}
        fill="oklch(0.22 0.04 172)"
        stroke="oklch(0.74 0.11 80)"
      />
      <path
        d={toPath(polygon(cx, cy, 28, 8))}
        fill="none"
        stroke="oklch(0.74 0.11 80)"
      />
      <path
        d={toPath(khatam(cx, cy, 25))}
        fill="oklch(0.74 0.11 80 / 0.25)"
        stroke="oklch(0.88 0.08 88)"
      />
      {tiles.map(([x, y], i) => (
        <path
          key={`t${i}`}
          d={toPath(khatam(x, y, 15))}
          fill="oklch(0.26 0.04 172)"
          stroke="oklch(0.8 0.12 82)"
          strokeWidth="1.3"
        />
      ))}
    </svg>
  );
}
