export function RevealLensThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <clipPath id="rl-thumb-lens">
          <circle cx="190" cy="92" r="58" />
        </clipPath>
      </defs>
      <rect width="320" height="180" fill="#ECE5D3" />
      {[24, 70, 120].map((y) => (
        <rect
          key={y}
          x="18"
          y={y}
          width="70"
          height="24"
          rx="3"
          fill="#F6F1E3"
          stroke="#4A4536"
          strokeDasharray="3 2"
        />
      ))}
      <path
        d="M88 40 C140 10 120 140 180 110 S240 30 290 90"
        fill="none"
        stroke="#4A4536"
        strokeWidth="1.5"
      />
      <g clipPath="url(#rl-thumb-lens)">
        <rect width="320" height="180" fill="#F4F8FF" />
        <path d="M130 92 H250 M190 40 V150" stroke="#2F6BFF" strokeWidth="2" />
        <rect x="172" y="74" width="36" height="36" rx="8" fill="#2F6BFF" />
        <rect x="216" y="50" width="44" height="16" rx="6" fill="#00D4FF" />
        <rect x="132" y="120" width="44" height="16" rx="6" fill="#8B5CF6" />
        <circle cx="160" cy="92" r="3" fill="#00D4FF" />
      </g>
      <circle cx="190" cy="92" r="58" fill="none" stroke="#0F1730" strokeWidth="3" />
    </svg>
  );
}
