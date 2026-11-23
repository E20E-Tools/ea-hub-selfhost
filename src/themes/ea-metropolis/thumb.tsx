/** Static mini isometric city for the admin picker. */
export function MetropolisThumb() {
  const box = (x: number, y: number, w: number, h: number, c: [string, string, string]) => (
    <g>
      <path d={`M${x} ${y}l${w} ${w / 2}v${-h}l${-w} ${-w / 2}z`} fill={c[1]} />
      <path d={`M${x + w} ${y + w / 2}l${w} ${-w / 2}v${-h}l${-w} ${w / 2}z`} fill={c[2]} />
      <path d={`M${x} ${y - h}l${w} ${w / 2}l${w} ${-w / 2}l${-w} ${-w / 2}z`} fill={c[0]} />
      {Array.from({ length: Math.floor(h / 9) }, (_, i) => (
        <path
          key={i}
          d={`M${x + 3} ${y - 6 - i * 9 + 1.5}l${w - 6} ${(w - 6) / 2}`}
          stroke="#FFD58A"
          strokeWidth="2"
          strokeDasharray="3 3"
          opacity="0.8"
        />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <linearGradient id="mc-thumb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2B2F66" />
          <stop offset="0.6" stopColor="#6D5BD0" />
          <stop offset="1" stopColor="#F2A07B" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#mc-thumb-sky)" />
      <circle cx="262" cy="34" r="10" fill="#FFE3B0" opacity="0.85" />
      <path d="M160 168l-110 -40l110 -40l110 40z" fill="#14315a" />
      <path
        d="M160 156l-110 -40l110 -40l110 40z"
        fill="#25466f"
        stroke="#39C5BB"
        strokeOpacity="0.6"
      />
      <path d="M160 140l-100 -36l100 -36l100 36z" fill="#3b4a66" />
      <path d="M110 122l100 -36M210 122l-100 -36" stroke="#1f2a3d" strokeWidth="6" />
      {box(84, 108, 18, 34, ["#c9d4ee", "#7f8fb8", "#4d5b85"])}
      {box(194, 104, 16, 44, ["#bfe3e0", "#5ea9a4", "#33716e"])}
      {box(142, 112, 18, 82, ["#ffe2a8", "#c69b54", "#8a6a33"])}
      {box(178, 128, 15, 26, ["#d9c7f2", "#9a7fc4", "#64508c"])}
      {box(116, 132, 15, 30, ["#c9d4ee", "#7f8fb8", "#4d5b85"])}
      <path d="M160 30v-12" stroke="#fff" strokeWidth="1.5" />
      <circle cx="160" cy="17" r="3" fill="#F4B860" />
      <path
        d="M232 128v-58M232 70h30M232 70h-10M262 70v18"
        stroke="#F4B860"
        strokeWidth="2"
        fill="none"
      />
      <rect x="257" y="88" width="10" height="7" fill="#F4B860" />
      <path d="M224 132l16 8 16 -8" stroke="#F4B860" strokeDasharray="3 2" fill="none" />
    </svg>
  );
}
