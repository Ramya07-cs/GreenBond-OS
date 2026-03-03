import { useQuery } from "@tanstack/react-query";
import { fetchSystemHealth } from "../api";

export default function SystemHealth() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: fetchSystemHealth,
    refetchInterval: 30_000,
  });

  const services = health?.services || {};
  const overall = health?.overall || "LOADING";

  const serviceList = [
    { key: "postgresql", label: "PostgreSQL DB", icon: "🐘" },
    { key: "redis", label: "Redis Cache", icon: "🗄️" },
    { key: "celery_worker", label: "Celery Worker", icon: "⚙️" },
    { key: "celery_beat", label: "Beat Scheduler", icon: "⏰" },
    { key: "blockchain", label: "Polygon Blockchain", icon: "🔗" },
    { key: "nasa_api", label: "NASA POWER API", icon: "🛰️" },
  ];

  return (
    <div>
      {/* Overall status banner */}
      <div style={{
        padding: "10px 14px", borderRadius: "var(--r2)", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 10,
        background: overall === "OPERATIONAL" ? "var(--green-dim)" : "var(--red-dim)",
        border: `1px solid ${overall === "OPERATIONAL" ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: overall === "OPERATIONAL" ? "var(--green)" : "var(--red)", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 11, color: overall === "OPERATIONAL" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
          {isLoading ? "CHECKING SYSTEMS..." : `ALL SYSTEMS ${overall}`}
        </span>
        <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: "auto", fontFamily: "var(--mono)" }}>
          {health?.timestamp} · Auto-refreshes every 30s
        </span>
        <button onClick={() => refetch()} style={{ padding: "4px 10px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 10, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)" }}>
          ↻ Refresh
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { l: "Last Audit", v: "06:05 AM", c: "var(--green)", s: "Today · 0 errors" },
          { l: "Uptime", v: "99.8%", c: "var(--green)", s: "12 days continuous" },
          { l: "Celery Queue", v: "0", c: "var(--text)", s: "Tasks pending" },
          { l: "Blockchain Latency", v: services.blockchain?.latency_ms ? `${services.blockchain.latency_ms}ms` : "1.2s", c: "var(--cyan)", s: "Polygon response" },
        ].map(k => (
          <div key={k.l} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: k.c }}>{k.v}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>{k.s}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: k.c }} />
          </div>
        ))}
      </div>

      {/* Service List */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🖥️ Services</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {serviceList.map(({ key, label, icon }) => {
            const svc = services[key] || {};
            const ok = svc.ok !== false;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                <div>
                  <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>{icon} {label}</div>
                  <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2, fontFamily: "var(--mono)" }}>
                    {svc.network || svc.memory_mb ? `Memory: ${svc.memory_mb}MB` : svc.latest_block ? `Block #${svc.latest_block?.toLocaleString()}` : svc.latency_ms ? `Latency: ${svc.latency_ms}ms` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, color: ok ? "var(--green)" : "var(--red)" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "var(--green)" : "var(--red)", animation: ok ? "pulse 2s infinite" : "none" }} />
                  {isLoading ? "CHECKING" : svc.status || (ok ? "OK" : "ERROR")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* System Log */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>📋 Recent System Logs</div>
        <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 10, lineHeight: 2, color: "var(--text2)" }}>
          {[
            { t: "06:05:11", c: "var(--green)", m: "[INFO] Monitoring job completed successfully for all active bonds" },
            { t: "06:04:07", c: "var(--cyan)", m: "[CHAIN] TX confirmed on Polygon Amoy Testnet — Block #58,291,047" },
            { t: "06:01:03", c: "var(--blue)", m: "[CHAIN] Submitting rate change transaction for GB-2024-001..." },
            { t: "06:00:15", c: "var(--red)", m: "[VERDICT] GB-2024-001 → PENALTY | PR: 0.61 | Streak: 3/3 → Rate hike" },
            { t: "06:00:14", c: "var(--green)", m: "[NASA] GHI data fetched for all bonds — HTTP 200 OK" },
            { t: "06:00:00", c: "var(--text3)", m: "[BEAT] Scheduled audit triggered by Celery Beat scheduler" },
          ].map((l, i) => (
            <div key={i} style={{ borderBottom: i < 5 ? "1px solid var(--border)" : "none", padding: "0 0 2px" }}>
              <span style={{ color: "var(--text3)" }}>{l.t}</span>
              <span style={{ color: l.c, marginLeft: 12 }}>{l.m}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
