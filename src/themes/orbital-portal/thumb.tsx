export function OrbitalPortalThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#030B08" />
      <ellipse
        cx="190"
        cy="96"
        rx="110"
        ry="42"
        fill="none"
        stroke="#3EE39A"
        strokeOpacity="0.5"
      />
      <ellipse
        cx="190"
        cy="96"
        rx="74"
        ry="28"
        fill="none"
        stroke="#3EE39A"
        strokeOpacity="0.4"
        strokeDasharray="4 4"
      />
      <circle cx="190" cy="96" r="24" fill="#0F3A2A" stroke="#3EE39A" />
      <path
        d="M190 72 A24 24 0 1 1 167 103"
        fill="none"
        stroke="#3EE39A"
        strokeWidth="4"
      />
      {[
        [90, 92, "#3EE39A"],
        [190, 54, "#3EE39A"],
        [290, 96, "#3EE39A"],
        [140, 132, "#E6B25C"],
        [244, 132, "#E6B25C"],
      ].map(([x, y, c]) => (
        <circle
          key={`${x}-${y}`}
          cx={Number(x)}
          cy={Number(y)}
          r="7"
          fill={String(c)}
        />
      ))}
      <rect x="18" y="30" width="54" height="16" fill="#EFE6D2" />
      <rect x="18" y="56" width="44" height="16" fill="#EFE6D2" opacity="0.7" />
    </svg>
  );
}
