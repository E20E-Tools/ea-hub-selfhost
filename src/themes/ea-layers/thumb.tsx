export function EaLayersThumb() {
  const layers = ["#8B5CF6", "#2F6BFF", "#00D4FF", "#4A4536"];
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#F7F8FC" />
      {layers.map((c, i) => {
        const y = 40 + i * 34;
        return (
          <g key={c}>
            <path
              d={`M160 ${y - 22} L250 ${y} L160 ${y + 22} L70 ${y} Z`}
              fill={c}
              fillOpacity="0.18"
              stroke={c}
              strokeWidth="1.5"
            />
            <rect x={140 + (i % 2) * 24} y={y - 6} width="30" height="10" rx="3" fill={c} />
          </g>
        );
      })}
      <path d="M100 40 V142 M220 40 V142" stroke="#0F1730" strokeDasharray="3 4" opacity="0.5" />
      <circle cx="100" cy="90" r="3" fill="#8B5CF6" />
      <circle cx="220" cy="70" r="3" fill="#00D4FF" />
    </svg>
  );
}
