/** Static poster of the E20E Galaxy for the admin picker. */
export function GalaxyThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <radialGradient id="gx-thumb-sun">
          <stop offset="0" stopColor="oklch(0.99 0.03 90)" />
          <stop offset="0.45" stopColor="oklch(0.78 0.14 75)" />
          <stop offset="1" stopColor="oklch(0.78 0.14 75 / 0)" />
        </radialGradient>
        <radialGradient id="gx-thumb-neb" cx="0.3" cy="0.3">
          <stop offset="0" stopColor="oklch(0.33 0.12 300 / 0.8)" />
          <stop offset="1" stopColor="oklch(0.16 0.05 275 / 0)" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="oklch(0.16 0.05 275)" />
      <rect width="320" height="180" fill="url(#gx-thumb-neb)" />
      {[
        [30, 20],
        [80, 150],
        [290, 30],
        [250, 160],
        [140, 14],
        [200, 120],
        [20, 100],
        [300, 100],
      ].map(([x, y]) => (
        <circle
          key={`${x}${y}`}
          cx={x}
          cy={y}
          r="1"
          fill="white"
          opacity="0.7"
        />
      ))}
      <g fill="none" stroke="oklch(0.85 0.1 200 / 0.45)" strokeDasharray="3 3">
        <ellipse cx="160" cy="92" rx="56" ry="20" />
        <ellipse cx="160" cy="92" rx="96" ry="34" />
        <ellipse cx="160" cy="92" rx="138" ry="50" />
      </g>
      <circle cx="160" cy="92" r="34" fill="url(#gx-thumb-sun)" />
      <circle cx="160" cy="92" r="14" fill="oklch(0.98 0.04 90)" />
      <circle cx="214" cy="100" r="7" fill="oklch(0.7 0.12 200)" />
      <circle cx="74" cy="78" r="9" fill="oklch(0.65 0.15 30)" />
      <circle cx="250" cy="132" r="11" fill="oklch(0.6 0.13 150)" />
      <ellipse
        cx="250"
        cy="132"
        rx="17"
        ry="4"
        fill="none"
        stroke="oklch(0.9 0.05 150)"
      />
    </svg>
  );
}
