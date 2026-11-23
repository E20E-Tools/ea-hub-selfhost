export function TerminalMigrationThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#F2F5F3" />
      <rect
        x="14"
        y="40"
        width="92"
        height="124"
        rx="10"
        fill="#1C1710"
        stroke="#3A3226"
        strokeWidth="4"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x="24"
          y={54 + i * 14}
          width={60 - (i % 3) * 12}
          height="5"
          fill="#FFBF5A"
          opacity="0.8"
        />
      ))}
      <rect x="110" y="40" width="34" height="124" fill="#0B2A1F" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x="116"
          y={52 + i * 28}
          width="22"
          height="20"
          rx="5"
          fill={i === 2 ? "#3EE39A" : "#0F3326"}
        />
      ))}
      <rect
        x="148"
        y="40"
        width="158"
        height="124"
        rx="10"
        fill="#FFFFFF"
        stroke="#D5E1DB"
      />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={158 + (i % 2) * 52}
          y={56 + Math.floor(i / 2) * 32}
          width="46"
          height="24"
          rx="6"
          fill="#F2F5F3"
        />
      ))}
      <circle cx="270" cy="102" r="26" fill="#0B2A1F" />
      <rect x="14" y="14" width="120" height="12" rx="4" fill="#0B2A1F" />
    </svg>
  );
}
