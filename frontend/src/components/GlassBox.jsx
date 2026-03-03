import { useState } from "react";

export default function GlassBox({ bond, auditLog }) {
  const [open, setOpen] = useState(false);
  const pr = auditLog?.calculated_pr;
  const nasaGHI = auditLog?.nasa_ghi;
  const actualKWh = auditLog?.actual_kwh;
  const verdict = auditLog?.verdict || bond?.status;

  const rows = [
    { key: "Raw Production Data", value: actualKWh ? `${actualKWh.toLocaleString()} kWh (inverter log)` : "No data submitted", badge: "RAW", color: "var(--text3)" },
    { key: "NASA GHI Data", value: nasaGHI ? `${nasaGHI} kWh/m² · Source: NASA POWER API` : "Fetching...", badge: "EXTERNAL", color: "var(--blue)" },
    { key: "Capacity", value: bond ? `${(bond.capacity_kw / 1000).toFixed(1)} MW · Performance Factor: 0.80` : "—", badge: "CONFIG", color: "var(--text3)" },
    { key: "Calculated PR", value: pr ? `Actual GHI ÷ NASA GHI = ${pr.toFixed(4)}` : "—", badge: "COMPUTED", color: "var(--cyan)" },
    { key: "Threshold", value: "0.75 (75%) — defined in smart contract at bond creation", badge: "CONTRACT", color: "var(--amber)" },
    { key: "Final Verdict", value: verdict || "—", badge: verdict, color: verdict === "COMPLIANT" ? "var(--green)" : verdict === "PENALTY" ? "var(--red)" : "var(--slate)" },
  ];

  return (
    <div style={{ border: "1px solid rgba(0,230,118,.15)", borderRadius: "var(--r)", overflow: "hidden" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "rgba(0,230,118,.04)", cursor: "pointer",
          transition: "background .2s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(0,230,118,.08)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(0,230,118,.04)"}
      >
        <div style={{ fontFamily: "var(--display)", fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--green)", display: "flex", alignItems: "center", gap: 8 }}>
          🧪 Glass Box — Today's PR Audit Record
        </div>
        <span style={{ color: "var(--green)", fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ padding: 16, background: "var(--input)", borderTop: "1px solid rgba(0,230,118,.1)" }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "140px 1fr 90px",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
              alignItems: "center",
            }}>
              <div style={{ fontSize: 10, color: "var(--text3)", padding: "10px 12px 10px 0" }}>{row.key}</div>
              <div style={{ fontSize: 11, color: "var(--text)", padding: "10px 12px", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                {row.value}
              </div>
              <div style={{ padding: "10px 0 10px 12px", textAlign: "right" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 100, fontSize: 9, fontWeight: 700,
                  background: `${row.color}22`, color: row.color,
                  border: `1px solid ${row.color}44`, letterSpacing: ".06em",
                }}>
                  {row.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
