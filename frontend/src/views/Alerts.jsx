import { useQuery } from "@tanstack/react-query";
import { fetchAlerts, fetchAlertSummary } from "../api";

const TYPE_ICONS = { BLOCKCHAIN: "🔗", EMAIL: "📩", SMS: "📱", SYSTEM: "⚙️" };
const TYPE_COLORS = {
  BLOCKCHAIN: "var(--cyan)", EMAIL: "var(--blue)",
  SMS: "var(--amber)", SYSTEM: "var(--slate)",
};

export default function Alerts() {
  const { data: summary } = useQuery({ queryKey: ["alert-summary"], queryFn: fetchAlertSummary });
  const { data, isLoading } = useQuery({ queryKey: ["alerts"], queryFn: () => fetchAlerts({ limit: 100 }) });
  const alerts = data?.alerts || [];

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Critical", v: summary?.by_severity?.critical || 0, c: "var(--red)" },
          { l: "Delivered", v: alerts.filter(a => a.status === "DELIVERED").length, c: "var(--green)" },
          { l: "On-Chain TXs", v: alerts.filter(a => a.type === "BLOCKCHAIN").length, c: "var(--cyan)" },
          { l: "Total", v: summary?.total || 0, c: "var(--text)" },
        ].map(k => (
          <div key={k.l} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 800, color: k.c }}>{k.v}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: k.c }} />
          </div>
        ))}
      </div>

      {/* Alert List */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text2)", fontSize: 12 }}>Loading alerts...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 14px", borderRadius: "var(--r2)",
              border: `1px solid ${a.severity === "critical" ? "rgba(255,61,61,.2)" : a.severity === "success" ? "rgba(0,230,118,.15)" : "var(--border)"}`,
              background: "var(--card2)",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{TYPE_ICONS[a.type] || "📌"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5 }}>{a.message}</div>
                <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 4, letterSpacing: ".06em" }}>
                  {a.bond_id} · {a.timestamp}
                </div>
                {a.tx_hash && (
                  <div style={{ fontSize: 10, color: "var(--blue)", marginTop: 3, cursor: "pointer" }}>
                    🔗 TX: {a.tx_hash} · Gas: {a.gas_used?.toLocaleString()} · Block #{a.block_number?.toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 9, fontWeight: 700, background: `${TYPE_COLORS[a.type]}18`, color: TYPE_COLORS[a.type], border: `1px solid ${TYPE_COLORS[a.type]}33` }}>
                  {a.type}
                </span>
                <span style={{
                  padding: "2px 8px", borderRadius: 100, fontSize: 9, fontWeight: 700,
                  background: a.status === "CONFIRMED" || a.status === "DELIVERED" ? "var(--green-dim)" : a.status === "FAILED" ? "var(--red-dim)" : "var(--amber-dim)",
                  color: a.status === "CONFIRMED" || a.status === "DELIVERED" ? "var(--green)" : a.status === "FAILED" ? "var(--red)" : "var(--amber)",
                  border: `1px solid ${a.status === "CONFIRMED" || a.status === "DELIVERED" ? "rgba(0,230,118,.25)" : "rgba(255,179,0,.25)"}`,
                }}>
                  {a.status}
                </span>
              </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No alerts recorded yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
