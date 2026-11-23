export function TimeScannerThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#04110C" />
      <rect x="170" width="150" height="180" fill="#E9E1CF" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={190 + (i % 2) * 40}
          y={30 + i * 44}
          width="70"
          height="26"
          fill="#FBF7EC"
          stroke="#8B7B58"
          strokeDasharray="3 3"
          transform={`rotate(${i % 2 ? 4 : -4} ${220} ${40 + i * 44})`}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x="22"
            y={24 + i * 50}
            width="58"
            height="26"
            rx="6"
            fill="#0B2A1F"
            stroke="#3EE39A"
          />
          <rect
            x="96"
            y={24 + i * 50}
            width="58"
            height="26"
            rx="6"
            fill="#0B2A1F"
            stroke={i === 2 ? "#E6B25C" : "#3EE39A"}
          />
        </g>
      ))}
      <rect x="168" width="3" height="180" fill="#3EE39A" />
      <circle
        cx="169.5"
        cy="90"
        r="13"
        fill="#04110C"
        stroke="#3EE39A"
        strokeWidth="2"
      />
    </svg>
  );
}
