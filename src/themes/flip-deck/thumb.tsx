export function FlipDeckThumb() {
  const cards = [-2, -1, 0, 1, 2];
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#F4F6FB" />
      {cards.map((o, i) => (
        <g
          key={o}
          transform={`translate(${160 + o * 46} ${96 + Math.abs(o) * 6}) rotate(${o * 6})`}
        >
          <rect
            x="-30"
            y="-44"
            width="60"
            height="88"
            rx="8"
            fill={i < 3 ? "#fff" : "#F6F1E3"}
            stroke={i < 3 ? "#2F6BFF" : "#4A4536"}
            strokeDasharray={i < 3 ? undefined : "3 2"}
            strokeWidth="1.5"
          />
          {i < 3 ? (
            <>
              <rect
                x="-18"
                y="-32"
                width="16"
                height="16"
                rx="4"
                fill={["#2F6BFF", "#00D4FF", "#8B5CF6"][i]}
              />
              <rect x="-18" y="-6" width="36" height="7" rx="3" fill="#0F1730" />
              <rect x="-18" y="6" width="30" height="4" rx="2" fill="#9aa3b8" />
            </>
          ) : (
            <rect x="-18" y="-4" width="36" height="6" rx="2" fill="#4A4536" />
          )}
        </g>
      ))}
    </svg>
  );
}
