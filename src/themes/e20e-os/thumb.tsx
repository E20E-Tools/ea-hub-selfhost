/** Static mini desktop for the admin picker: menu bar, 4 icons, a dock and one open window. */
export function E20eOsThumb() {
  const icon = [
    "oklch(0.72 0.13 200)",
    "oklch(0.74 0.13 85)",
    "oklch(0.7 0.14 300)",
    "oklch(0.7 0.14 150)",
  ];
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <radialGradient id="os-t-a" cx="0.2" cy="0.3" r="0.7">
          <stop offset="0" stopColor="oklch(0.536 0.089 205)" />
          <stop offset="1" stopColor="oklch(0.177 0.034 269.6)" />
        </radialGradient>
        <radialGradient id="os-t-b" cx="0.85" cy="0.8" r="0.5">
          <stop offset="0" stopColor="oklch(0.712 0.131 83.7 / 0.75)" />
          <stop offset="1" stopColor="oklch(0.712 0.131 83.7 / 0)" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#os-t-a)" />
      <rect width="320" height="180" fill="url(#os-t-b)" />
      <rect width="320" height="12" fill="oklch(0.2 0.03 260 / 0.6)" />
      <rect
        x="8"
        y="4"
        width="26"
        height="4"
        rx="2"
        fill="oklch(0.95 0.01 260)"
      />
      <rect
        x="270"
        y="4"
        width="40"
        height="4"
        rx="2"
        fill="oklch(0.95 0.01 260 / 0.7)"
      />
      {icon.map((c, i) => (
        <g key={i} transform={`translate(14 ${22 + i * 34})`}>
          <rect width="22" height="22" rx="6" fill={c} />
          <rect
            x="1"
            y="25"
            width="20"
            height="3"
            rx="1.5"
            fill="oklch(0.95 0.01 260 / 0.8)"
          />
        </g>
      ))}
      <g transform="translate(110 28)">
        <rect
          width="170"
          height="104"
          rx="8"
          fill="oklch(0.22 0.03 260 / 0.85)"
          stroke="oklch(1 0 0 / 0.25)"
        />
        <rect width="170" height="16" rx="8" fill="oklch(0.3 0.03 260 / 0.9)" />
        <circle cx="10" cy="8" r="3" fill="oklch(0.68 0.2 25)" />
        <circle cx="20" cy="8" r="3" fill="oklch(0.82 0.16 85)" />
        <circle cx="30" cy="8" r="3" fill="oklch(0.76 0.17 145)" />
        <rect
          x="8"
          y="22"
          width="154"
          height="38"
          rx="4"
          fill="oklch(0.536 0.089 205 / 0.6)"
        />
        <rect
          x="8"
          y="68"
          width="80"
          height="5"
          rx="2.5"
          fill="oklch(0.95 0.01 260)"
        />
        <rect
          x="8"
          y="79"
          width="120"
          height="4"
          rx="2"
          fill="oklch(0.95 0.01 260 / 0.55)"
        />
        <rect
          x="8"
          y="88"
          width="34"
          height="9"
          rx="4.5"
          fill="oklch(0.712 0.131 83.7)"
        />
      </g>
      <rect
        x="92"
        y="152"
        width="136"
        height="22"
        rx="9"
        fill="oklch(1 0 0 / 0.16)"
        stroke="oklch(1 0 0 / 0.25)"
      />
      {[...icon, "oklch(0.25 0.02 260)"].map((c, i) => (
        <rect
          key={i}
          x={100 + i * 25}
          y="156"
          width="17"
          height="14"
          rx="4"
          fill={c}
        />
      ))}
    </svg>
  );
}
