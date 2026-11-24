export function UntangleChaosThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#ECE5D3" />
      <rect x="160" width="160" height="180" fill="#F7F9FF" />
      {[30, 80, 130].map((y) => (
        <g key={y}>
          <rect
            x="12"
            y={y}
            width="62"
            height="22"
            rx="3"
            fill="#F6F1E3"
            stroke="#4A4536"
            strokeDasharray="3 2"
          />
          <path
            d={`M74 ${y + 11} C110 ${y - 20} 95 ${y + 50} 125 ${y + 20}`}
            fill="none"
            stroke="#4A4536"
            strokeWidth="1.5"
          />
          <rect x="246" y={y} width="62" height="22" rx="8" fill="#2F6BFF" />
          <path
            d={`M246 ${y + 11} H215 V90 H192`}
            fill="none"
            stroke="#2F6BFF"
            strokeWidth="2"
          />
          <circle cx="215" cy={y + 11} r="2.5" fill="#00D4FF" />
        </g>
      ))}
      <rect
        x="128"
        y="62"
        width="64"
        height="56"
        rx="8"
        fill="#101814"
        stroke="#4A4536"
        strokeWidth="2"
      />
      <text
        x="160"
        y="94"
        textAnchor="middle"
        fontSize="11"
        fill="#39FF6A"
        fontFamily='"Cairo Variable", "Cairo", sans-serif'
      >
        E20E.EXE
      </text>
      <g transform="translate(150 30)">
        <rect
          x="-10"
          y="-8"
          width="20"
          height="15"
          rx="6"
          fill="#fff"
          stroke="#2F6BFF"
          strokeWidth="2"
        />
        <path d="M-4 9 L-12 34 H12 L4 9z" fill="#00D4FF" opacity="0.35" />
      </g>
    </svg>
  );
}
