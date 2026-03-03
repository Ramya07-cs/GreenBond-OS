const STATUS_MAP = {
  PENALTY: { color: "var(--red)", bg: "var(--red-dim)", border: "rgba(255,61,61,.25)", pulse: true },
  ACTIVE:  { color: "var(--green)", bg: "var(--green-dim)", border: "rgba(0,230,118,.25)", pulse: false },
  MATURED: { color: "var(--slate)", bg: "rgba(84,110,122,.12)", border: "rgba(84,110,122,.25)", pulse: false },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.ACTIVE;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 100,
      fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%", background: cfg.color,
        animation: cfg.pulse ? "pulse 1.5s infinite" : "none",
      }} />
      {status}
    </span>
  );
}
