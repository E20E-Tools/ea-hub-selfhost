/** Static poster of the Circuit Core board for the admin picker. */
export function CircuitCoreThumb() {
  const chips = [
    [28, 16],
    [124, 16],
    [220, 16],
    [12, 76],
    [236, 76],
    [28, 136],
    [124, 136],
    [220, 136],
  ] as const;
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <pattern
          id="cc-thumb-dots"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="1"
            cy="1"
            r="0.8"
            fill="oklch(0.844 0.159 114.1 / 0.18)"
          />
        </pattern>
      </defs>
      <rect width="320" height="180" fill="oklch(0.19 0.026 208.5)" />
      <rect width="320" height="180" fill="url(#cc-thumb-dots)" />
      {chips.map(([x, y], i) => (
        <path
          key={`t${i}`}
          d={`M160 90L${x + 36} ${y + 14}`}
          stroke="oklch(0.844 0.159 114.1 / 0.55)"
          strokeWidth="1.4"
          fill="none"
        />
      ))}
      {chips.map(([x, y], i) => (
        <g key={i}>
          <rect
            x={x}
            y={y}
            width="72"
            height="28"
            fill="oklch(0.241 0.034 205)"
            stroke={
              i === 7
                ? "oklch(0.806 0.147 79 / 0.8)"
                : "oklch(0.844 0.159 114.1)"
            }
          />
          <circle
            cx={x + 64}
            cy={y + 6}
            r="2.4"
            fill={i === 7 ? "oklch(0.806 0.147 79)" : "oklch(0.8 0.18 140)"}
          />
          <rect
            x={x + 8}
            y={y + 12}
            width="34"
            height="4"
            fill="oklch(0.946 0.017 164.7 / 0.8)"
          />
        </g>
      ))}
      <rect
        x="112"
        y="62"
        width="96"
        height="56"
        fill="oklch(0.241 0.034 205)"
        stroke="oklch(0.728 0.128 219.8)"
        strokeWidth="2"
      />
      <rect
        x="117"
        y="67"
        width="86"
        height="46"
        fill="none"
        stroke="oklch(0.728 0.128 219.8 / 0.5)"
      />
      <text
        x="160"
        y="95"
        textAnchor="middle"
        fontFamily="monospace"
        fontSize="11"
        fill="oklch(0.946 0.017 164.7)"
      >
        E20E TOOLS
      </text>
    </svg>
  );
}
