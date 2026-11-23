const DOTS = Array.from({ length: 90 }, (_, i) => i);
export function ParticleForgeThumb() {
  return (
    <svg viewBox="0 0 320 180" className="theme-thumb-svg" aria-hidden="true">
      <rect width="320" height="180" fill="#0F1730" />
      {DOTS.map((i) => {
        const c = i % 3;
        const a = i * 2.4;
        const r = 6 + (i % 7) * 3;
        return (
          <circle
            key={i}
            cx={70 + c * 90 + Math.cos(a) * r}
            cy={84 + Math.sin(a) * r}
            r="1.8"
            fill={["#2F6BFF", "#00D4FF", "#8B5CF6"][c]}
          />
        );
      })}
      {[70, 160, 250].map((x) => (
        <rect key={x} x={x - 20} y="128" width="40" height="6" rx="3" fill="#fff" opacity="0.8" />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={`g${i}`} cx={20 + i * 25} cy="160" r="1.6" fill="#ECE5D3" />
      ))}
    </svg>
  );
}
