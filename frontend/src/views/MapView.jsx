import { useBonds } from "../hooks/useBonds";
import StatusBadge from "../components/StatusBadge";

const STATUS_COLOR = { PENALTY: "var(--red)", ACTIVE: "var(--green)", MATURED: "var(--slate)" };

function toXY(lat, lng) {
  // Approximate India bounding box: lat 8–37, lng 68–98
  const x = ((lng - 68) / (98 - 68)) * 100;
  const y = ((37 - lat) / (37 - 8)) * 100;
  return { x, y };
}

export default function MapView({ onSelectBond }) {
  const { data: bonds = [] } = useBonds();

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700, letterSpacing: ".04em" }}>Portfolio Map View</div>
        <div style={{ fontSize: 10, color: "var(--text3)" }}>Click any pin to open bond details</div>
      </div>

      {/* Map Canvas */}
      <div style={{ position: "relative", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden", marginBottom: 14 }}>
        {/* Grid overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(rgba(0,230,118,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,230,118,0.04) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        {/* SVG India outline */}
        <svg viewBox="0 0 500 600" style={{ width: "100%", display: "block", opacity: 0.12 }}>
          <path d="M200,30 L280,20 L340,50 L380,100 L390,160 L370,220 L400,280 L380,350 L350,400 L300,440 L260,480 L240,520 L220,500 L200,460 L170,420 L150,380 L120,330 L100,280 L110,220 L100,170 L120,120 L160,70 Z" fill="rgba(0,230,118,0.15)" stroke="var(--green)" strokeWidth="1.5" />
          <path d="M240,520 L250,560 L260,540 Z" fill="rgba(0,230,118,0.1)" stroke="var(--green)" strokeWidth="1" />
        </svg>

        {/* Bond Pins */}
        {bonds.map(b => {
          const { x, y } = toXY(b.lat, b.lng);
          const color = STATUS_COLOR[b.status] || "var(--slate)";
          return (
            <div
              key={b.id}
              onClick={() => onSelectBond(b)}
              style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)", cursor: "pointer", zIndex: 2 }}
            >
              {/* Ping rings for penalty bonds */}
              {b.status === "PENALTY" && (
                <div style={{
                  position: "absolute", inset: -8, borderRadius: "50%",
                  border: "1px solid var(--red)", animation: "pulse 1.5s infinite", opacity: 0.5,
                }} />
              )}
              <div
                style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: color, border: "2px solid var(--void)",
                  boxShadow: `0 0 14px ${color}`,
                  transition: "transform .2s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "scale(1.5)";
                  e.currentTarget.nextSibling.style.opacity = 1;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.nextSibling.style.opacity = 0;
                }}
              />
              {/* Hover label */}
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 4,
                padding: "5px 10px", fontSize: 10, whiteSpace: "nowrap", pointerEvents: "none",
                opacity: 0, transition: "opacity .2s", zIndex: 10,
              }}>
                <div style={{ fontWeight: 700, color }}>{b.name}</div>
                <div style={{ color: "var(--text3)" }}>{b.status} · {b.current_rate}% · PR: {b.today_pr ? `${(b.today_pr * 100).toFixed(0)}%` : "—"}</div>
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, padding: "10px 14px", borderTop: "1px solid var(--border)", position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(11,20,32,.8)", backdropFilter: "blur(4px)" }}>
          {[["var(--green)", "Compliant"], ["var(--red)", "Under Penalty"], ["var(--slate)", "Matured"]].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text2)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} /> {l}
            </div>
          ))}
        </div>
      </div>

      {/* Bond Table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Bond", "Status", "Coordinates", "Rate", "Today PR", ""].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "7px 12px", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bonds.map(b => (
              <tr key={b.id} onClick={() => onSelectBond(b)} style={{ cursor: "pointer" }}
                onMouseEnter={e => [...e.currentTarget.cells].forEach(c => c.style.background = "rgba(255,255,255,.02)")}
                onMouseLeave={e => [...e.currentTarget.cells].forEach(c => c.style.background = "")}
              >
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>{b.id}</div>
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}><StatusBadge status={b.status} /></td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text3)" }}>{b.lat}°N, {b.lng}°E</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: b.current_rate > b.base_rate ? "var(--red)" : "var(--green)", fontWeight: 700 }}>{b.current_rate}%</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: b.today_pr ? (b.today_pr >= .75 ? "var(--green)" : "var(--red)") : "var(--slate)" }}>
                  {b.today_pr ? `${(b.today_pr * 100).toFixed(0)}%` : "—"}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}>
                  <button style={{ padding: "5px 12px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 10, cursor: "pointer" }}>→</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
