const STATUS_MAP = {
  PENALTY: {
    color: "var(--red)", bg: "var(--red-dim)", border: "rgba(255,61,61,.3)",
    pulse: true, borderRadius: 3, glow: "0 0 8px rgba(255,61,61,.2)",
  },
  ACTIVE: {
    color: "var(--green)", bg: "var(--green-dim)", border: "rgba(0,230,118,.25)",
    pulse: false, borderRadius: 100, glow: "0 0 8px rgba(0,230,118,.15)",
  },
  MATURED: {
    color: "var(--slate)", bg: "rgba(84,110,122,.08)", border: "rgba(84,110,122,.2)",
    pulse: false, borderRadius: 3, glow: "none",
  },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.ACTIVE;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: cfg.borderRadius,
      fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase",
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      boxShadow: cfg.glow,
    }}>
      <span style={{
        width: status === "PENALTY" ? 4 : 5,
        height: status === "PENALTY" ? 4 : 5,
        borderRadius: status === "PENALTY" ? 1 : "50%",
        background: cfg.color,
        animation: cfg.pulse ? "pulse 1.5s infinite" : "none",
        flexShrink: 0,
      }} />
      {status}
    </span>
  );
}