/** Static poster: beige spaghetti + legacy file on the left, white board with core and traces on the right. */
export function TransformationBoardThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <linearGradient id="tb-thumb-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2F6BFF" />
          <stop offset="0.5" stopColor="#00D4FF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        <pattern id="tb-thumb-dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.9" fill="#9fb0dc" />
        </pattern>
      </defs>
      <rect width="160" height="180" fill="#C9C3B5" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
        <rect key={k} y={k * 20} width="160" height="1.5" fill="#000" opacity="0.05" />
      ))}
      <rect x="160" width="160" height="180" fill="#F8FAFC" />
      <rect x="160" width="160" height="180" fill="url(#tb-thumb-dots)" />
      {/* Legacy: tangled cables and a file */}
      <path
        d="M40 40c40 10-10 50 30 40s20-40 50 0-20 40 10 50"
        fill="none"
        stroke="#4a4536"
        strokeWidth="2.2"
      />
      <path
        d="M30 140c20-30 60 20 40-20s50-10 30 30"
        fill="none"
        stroke="#4a4536"
        strokeWidth="2.2"
      />
      <circle cx="70" cy="80" r="3.5" fill="#241f19" />
      <circle cx="100" cy="150" r="3.5" fill="#241f19" />
      <path d="M22 24h18l6 6v24H22z" fill="#f2efe6" stroke="#4a4536" strokeWidth="1.5" />
      <rect x="26" y="38" width="16" height="8" fill="#3c7a3c" />
      <rect
        x="18"
        y="58"
        width="44"
        height="7"
        fill="#f2efe6"
        stroke="#4a4536"
        strokeWidth="1"
        strokeDasharray="2 1"
      />
      {/* Digital: core chip with chamfered gradient traces */}
      <g fill="none" stroke="url(#tb-thumb-g)" strokeWidth="2.4">
        <path d="M230 76V56l6-6h40v-12" />
        <path d="M230 104v20l6 6h40v12" />
        <path d="M204 90h-12l-6-6v-38" />
      </g>
      <rect
        x="204"
        y="76"
        width="60"
        height="28"
        rx="5"
        fill="#ffffff"
        stroke="url(#tb-thumb-g)"
        strokeWidth="2"
      />
      <rect x="216" y="86" width="36" height="7" rx="2" fill="url(#tb-thumb-g)" />
      {[
        [256, 22],
        [256, 142],
        [172, 30],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x}
            y={y}
            width="44"
            height="16"
            rx="3"
            fill="#ffffff"
            stroke="url(#tb-thumb-g)"
            strokeWidth="1.6"
          />
          <circle cx={x! + 38} cy={y! + 5} r="2" fill="#10b981" />
        </g>
      ))}
      <circle cx="236" cy="50" r="2.6" fill="#ffffff" stroke="#2F6BFF" strokeWidth="1.4" />
      {/* Handle */}
      <rect x="158" width="4" height="180" fill="#141414" />
      <circle cx="160" cy="150" r="13" fill="#ffffff" stroke="#141414" strokeWidth="3" />
      <path
        d="M152 150h16M152 150l4-4M152 150l4 4M168 150l-4-4M168 150l-4 4"
        stroke="#141414"
        strokeWidth="2"
      />
    </svg>
  );
}
