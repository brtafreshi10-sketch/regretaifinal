export default function RegretMeter({ score }: { score: number }) {
  const normalized = Number.isFinite(score) ? Math.round(score) : 0;
  const clamped = Math.max(0, Math.min(100, normalized));
  const dangerLevel = clamped / 100;
  const hue = Math.round(120 - dangerLevel * 120);
  const saturation = 90;
  const lightness = clamped > 70 ? 54 : 52;
  const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const badgeBackground = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.16)`;

  const label =
    clamped <= 10
      ? "No regret"
      : clamped <= 20
      ? "Minimal regret"
      : clamped <= 35
      ? "Mild regret"
      : clamped <= 55
      ? "Moderate regret"
      : clamped <= 75
      ? "Serious regret"
      : clamped <= 90
      ? "High regret"
      : clamped <= 97
      ? "Critical regret"
      : "Severe regret";

  return (
    <div className="meterWrapper">
      <div className="meterLabel">
        <span className="meterLabelText">Regret intensity</span>
        <span className="meterValue">{clamped}%</span>
      </div>
      <div className="meter">
        <div
          className="fill"
          style={{ width: `${clamped}%`, backgroundColor: color, boxShadow: `0 0 ${12 + dangerLevel * 22}px ${color}` }}
        />
      </div>
      <div className="meterBadge" style={{ backgroundColor: badgeBackground, color }}>
        {label}
      </div>
    </div>
  );
}
