import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBonds } from "../hooks/useBonds";
import { fetchSystemHealth, fetchAlertSummary } from "../api";

const NAV = [
  { id: "dashboard",  icon: "📊", label: "Dashboard" },
  { id: "register",   icon: "🌿", label: "Bond Registration" },
  { id: "entry",      icon: "📥", label: "Data Entry" },
  { id: "blockchain", icon: "🔗", label: "Blockchain" },
  { id: "health",     icon: "🖥️", label: "System Health" },
  { id: "alerts",     icon: "🔔", label: "Alert Center" },
];

// Keys to show in the sidebar footer. These match the service keys
// returned by GET /api/health → services.
const SYS_CHECKS = [
  { label: "Celery", key: "celery_worker" },
  { label: "Redis",  key: "redis" },
  { label: "Beat",   key: "celery_beat" },
];

export default function Sidebar({ view, onNav, onBond, selectedBond }) {
  const { data: bonds = [] } = useBonds();
  const [clock, setClock] = useState(new Date());

  // Poll the health endpoint every 30s — same interval as SystemHealth view.
  // retry: false prevents hammering the server if it's down.
  const { data: health } = useQuery({
    queryKey: ["system-health"],
    queryFn: fetchSystemHealth,
    refetchInterval: 30_000,
    retry: false,
    // Don't throw on error — sidebar should degrade gracefully, not crash.
    throwOnError: false,
  });

  const { data: alertSummary } = useQuery({
    queryKey: ["alert-summary"],
    queryFn: fetchAlertSummary,
    refetchInterval: 60_000,
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const statusColor = { PENALTY: "var(--red)", ACTIVE: "var(--green)", MATURED: "var(--slate)" };

  // Resolve a service's ok/status from the health response.
  // Returns { ok, label } — ok is null while loading (no health data yet).
  function svcStatus(key) {
    if (!health) return { ok: null, label: "..." };
    const svc = health.services?.[key];
    if (!svc) return { ok: false, label: "N/A" };
    return { ok: svc.ok !== false, label: svc.ok !== false ? "OK" : "ERR" };
  }

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
            {n.id === "alerts" && (alertSummary?.unread_critical > 0) && <span style={{ marginLeft: "auto", background: "var(--red)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 100 }}>{alertSummary.unread_critical}</span>}
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
              {b.name}
            </span>
          </div>
        ))}
      </nav>

      {/* Footer — live system status from /api/health */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 5, textTransform: "uppercase" }}>System</div>
        {SYS_CHECKS.map(s => {
          const { ok, label } = svcStatus(s.key);
          // ok === null means still loading (no health data yet)
          const dotColor = ok === null ? "var(--text3)" : ok ? "var(--green)" : "var(--red)";
          const textColor = ok === null ? "var(--text3)" : ok ? "var(--green)" : "var(--red)";
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: "var(--text2)" }}>{s.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: textColor }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: dotColor,
                  // Only pulse when confirmed OK — not while loading or errored
                  animation: ok === true ? "pulse 2s infinite" : "none",
                }} />
                {label}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>{clock.toLocaleTimeString("en-IN")}</span>
          <span style={{ fontSize: 9, color: "var(--text3)" }}>IST</span>
        </div>
      </div>
    </aside>
  );
}
