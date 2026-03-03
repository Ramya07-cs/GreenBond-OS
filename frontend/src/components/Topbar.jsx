import { useQuery } from "@tanstack/react-query";
import { fetchBlockchainStatus } from "../api";

export default function Topbar({ title, subtitle, onBack, onAlerts }) {
  const { data: chain } = useQuery({
    queryKey: ["blockchain-status"],
    queryFn: fetchBlockchainStatus,
    refetchInterval: 60_000,
    retry: false,
  });

  return (
    <div style={{
      height: 48, background: "var(--surface)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text2)", fontSize: 11, cursor: "pointer", background: "none", border: "none", fontFamily: "var(--mono)", transition: "color .2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--green)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--text2)"}
          >
            ←
          </button>
        )}
        <div>
          <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: ".04em" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: ".08em" }}>{subtitle}</div>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 100, border: "1px solid rgba(0,230,118,.25)", background: "var(--green-dim)", fontSize: 10, color: "var(--green)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "pulse 1.8s infinite" }} />
          LIVE
        </div>

        {/* Chain status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 100, border: "1px solid rgba(33,150,243,.25)", background: "var(--blue-dim)", fontSize: 10, color: "var(--blue)" }}>
          🔗 {chain?.connected ? `POLYGON · #${chain.latest_block?.toLocaleString()}` : "CONNECTING..."}
        </div>

        {/* Bell */}
        <div
          onClick={onAlerts}
          style={{
            position: "relative", width: 34, height: 34, borderRadius: "var(--r2)",
            border: "1px solid var(--border)", background: "var(--card)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 14, transition: "border-color .2s",
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--amber)"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
        >
          🔔
          <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--red)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", border: "2px solid var(--void)", fontFamily: "var(--mono)" }}>
            2
          </div>
        </div>
      </div>
    </div>
  );
}
