/** Static poster of the Transformation Metro map for the admin picker. */
export function MetroThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="oklch(0.973 0.008 106)" />
      <rect width="320" height="16" fill="oklch(0.2 0 0)" />
      <g fill="none" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 90H290" stroke="oklch(0.58 0.21 26)" />
        <path d="M120 150L160 110 M200 70L240 30H296" stroke="oklch(0.52 0.14 248)" />
        <path d="M160 90V30 M110 140L60 160H24" stroke="oklch(0.58 0.14 160)" />
      </g>
      {[
        [52, 90],
        [96, 90],
        [228, 90],
        [270, 90],
        [240, 30],
        [278, 30],
        [160, 40],
        [60, 160],
      ].map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="5.5"
          fill="white"
          stroke="oklch(0.2 0 0)"
          strokeWidth="2.5"
        />
      ))}
      <rect
        x="118"
        y="76"
        width="84"
        height="28"
        rx="14"
        fill="white"
        stroke="oklch(0.2 0 0)"
        strokeWidth="4"
      />
      <rect x="138" y="87" width="44" height="6" rx="3" fill="oklch(0.2 0 0)" />
    </svg>
  );
}
