import { useState, useEffect } from "react";
import { useBonds } from "../hooks/useBonds";

const NAV = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "map",       icon: "🗺️", label: "Map View" },
  { id: "alerts",    icon: "🔔", label: "Alert Center", badge: true },
  { id: "entry",     icon: "📥", label: "Data Entry" },
  { id: "health",    icon: "🖥️", label: "System Health" },
];

const SYS = [
  { label: "Celery", key: "celery" },
  { label: "Redis",  key: "redis" },
  { label: "Beat",   key: "beat" },
];

export default function Sidebar({ view, onNav, onBond, selectedBond }) {
  const { data: bonds = [] } = useBonds();
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const statusColor = { PENALTY: "var(--red)", ACTIVE: "var(--green)", MATURED: "var(--slate)" };

  return (
    <aside style={{ width: 220, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ padding: "18px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, background: "var(--green)", clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)" }} />
        <div>
          <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 800, letterSpacing: ".08em", color: "var(--green)", lineHeight: 1.1 }}>GREENBOND</div>
          <div style={{ fontSize: 8, color: "var(--text3)", letterSpacing: ".15em" }}>OPERATING SYSTEM</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <div style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--text3)", padding: "12px 10px 4px", textTransform: "uppercase" }}>Navigation</div>
        {NAV.map(n => (
          <div
            key={n.id}
            onClick={() => onNav(n.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: "var(--r2)", cursor: "pointer",
              border: `1px solid ${view === n.id ? "rgba(0,230,118,.2)" : "transparent"}`,
              background: view === n.id ? "var(--green-dim)" : "transparent",
              color: view === n.id ? "var(--green)" : "var(--text2)",
              fontSize: 12, letterSpacing: ".04em", transition: "all .18s",
            }}
          >
            <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{n.icon}</span>
            {n.label}
            {n.badge && <span style={{ marginLeft: "auto", background: "var(--red)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 100 }}>!</span>}
          </div>
        ))}

        <div style={{ fontSize: 9, letterSpacing: ".18em", color: "var(--text3)", padding: "12px 10px 4px", textTransform: "uppercase", marginTop: 8 }}>Bonds</div>
        {bonds.map(b => (
          <div
            key={b.id}
            onClick={() => onBond(b)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: "var(--r2)", cursor: "pointer",
              border: `1px solid ${view === "detail" && selectedBond?.id === b.id ? "rgba(0,230,118,.2)" : "transparent"}`,
              background: view === "detail" && selectedBond?.id === b.id ? "var(--green-dim)" : "transparent",
              fontSize: 11, color: "var(--text2)", transition: "all .18s",
            }}
          >
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: statusColor[b.status] || "var(--slate)",
              animation: b.status === "PENALTY" ? "pulse 1.5s infinite" : "none",
            }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {b.name.split(" ").slice(0, 2).join(" ")}
            </span>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 5, textTransform: "uppercase" }}>System</div>
        {SYS.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "var(--text2)" }}>{s.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "var(--green)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }} />
              OK
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>{clock.toLocaleTimeString("en-IN")}</span>
          <span style={{ fontSize: 9, color: "var(--text3)" }}>IST</span>
        </div>
      </div>
    </aside>
  );
}
