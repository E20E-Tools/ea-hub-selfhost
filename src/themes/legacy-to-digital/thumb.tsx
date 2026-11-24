/** Static before/after poster for the admin picker. */
export function LegacyDigitalThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <linearGradient id="ld-thumb-g" x1="0" x2="1">
          <stop offset="0" stopColor="#2F6BFF" />
          <stop offset="0.5" stopColor="#00D4FF" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="160" height="180" fill="#C9C3B5" />
      <rect x="160" width="160" height="180" fill="#F8FAFC" />
      <rect
        x="34"
        y="52"
        width="76"
        height="60"
        rx="8"
        fill="#8E897D"
        stroke="#4a4536"
        strokeWidth="3"
      />
      <rect x="42" y="60" width="60" height="42" rx="4" fill="#0e2a14" />
      <path
        d="M48 70h30M48 78h20M48 86h36"
        stroke="#39FF6A"
        strokeWidth="2.5"
      />
      <rect x="62" y="112" width="20" height="10" fill="#8E897D" />
      <path
        d="M14 150c30-40 40 30 70-10s30 40 60 0"
        fill="none"
        stroke="#5a564c"
        strokeWidth="2"
      />
      <path
        d="M20 30c20 30 60-20 40 30"
        fill="none"
        stroke="#5a564c"
        strokeWidth="2"
      />
      <path
        d="M176 120H306M196 70V120M246 50V120M290 80V120"
        fill="none"
        stroke="url(#ld-thumb-g)"
        strokeWidth="3"
      />
      {[
        [180, 56],
        [228, 36],
        [272, 66],
      ].map(([x, y]) => (
        <rect
          key={x}
          x={x}
          y={y}
          width="36"
          height="22"
          rx="7"
          fill="#ffffff"
          stroke="url(#ld-thumb-g)"
          strokeWidth="2"
        />
      ))}
      <circle cx="246" cy="120" r="10" fill="url(#ld-thumb-g)" />
      <rect x="158" width="4" height="180" fill="#141414" />
      <circle
        cx="160"
        cy="90"
        r="14"
        fill="#ffffff"
        stroke="#141414"
        strokeWidth="3"
      />
      <path
        d="M152 90h16M152 90l4-4M152 90l4 4M168 90l-4-4M168 90l-4 4"
        stroke="#141414"
        strokeWidth="2"
      />
    </svg>
  );
}
