/** Static mini blueprint for the admin picker. */
export function BlueprintThumb() {
  const line = { fill: "none", stroke: "#CFE8FF" } as const;
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <defs>
        <pattern id="lb-thumb-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M10 0H0V10"
            fill="none"
            stroke="#CFE8FF"
            strokeOpacity="0.14"
            strokeWidth="0.5"
          />
        </pattern>
        <pattern
          id="lb-thumb-hatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0V5" stroke="#FF6B6B" strokeOpacity="0.6" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="180" fill="#0D3B78" />
      <rect width="320" height="180" fill="url(#lb-thumb-grid)" />
      <rect x="6" y="6" width="308" height="168" {...line} strokeWidth="1" />
      <rect x="22" y="20" width="230" height="130" {...line} strokeWidth="3.5" />
      <path
        d="M22 62H252M22 108H252M80 20V62M150 20V62M80 108V150M180 108V150"
        {...line}
        strokeWidth="1.4"
      />
      <rect x="110" y="70" width="54" height="30" {...line} strokeWidth="1.4" />
      <circle cx="137" cy="85" r="9" {...line} strokeWidth="0.8" />
      <path d="M137 62V70M137 100V108" {...line} strokeWidth="0.8" strokeDasharray="2 2" />
      <rect x="180" y="108" width="72" height="42" fill="url(#lb-thumb-hatch)" />
      <path
        d="M176 106a6 6 0 0 1 10-2a6 6 0 0 1 10 0a6 6 0 0 1 10 0a6 6 0 0 1 10 0a6 6 0 0 1 10 0a6 6 0 0 1 10 0a6 6 0 0 1 10 3a6 6 0 0 1 0 10a6 6 0 0 1 0 10a6 6 0 0 1 0 10a6 6 0 0 1 -4 9a6 6 0 0 1 -10 0a6 6 0 0 1 -10 0a6 6 0 0 1 -10 0a6 6 0 0 1 -10 0a6 6 0 0 1 -10 0a6 6 0 0 1 -10 0a6 6 0 0 1 -6 -8a6 6 0 0 1 0 -10a6 6 0 0 1 0 -10a6 6 0 0 1 0 -12z"
        fill="none"
        stroke="#FF6B6B"
        strokeWidth="1.3"
      />
      <rect x="262" y="118" width="48" height="50" {...line} strokeWidth="1" />
      <path d="M262 130H310M262 142H310M262 155H310" {...line} strokeWidth="0.6" />
      <path d="M30 14H244" {...line} strokeWidth="0.6" />
    </svg>
  );
}
