import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useBonds } from "../hooks/useBonds";
import { fetchDashboardSummary } from "../api";
import StatusBadge from "../components/StatusBadge";

function KPI({ label, icon, value, sub, color, barColor }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", fontWeight: 600 }}>{label}</span>
        {icon && <span style={{ marginLeft: "auto", fontSize: 10, color: color || "var(--text3)", opacity: 0.6, fontFamily: "var(--mono)", letterSpacing: ".05em" }}>{icon}</span>}
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 5 }}>{sub}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: barColor || "var(--green)" }} />
    </div>
  );
}

export default function Dashboard({ onSelectBond }) {
  const { data: bonds = [], isLoading } = useBonds();
  // Use the dedicated cached dashboard summary endpoint (2-min TTL, invalidated after audits)
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
    refetchInterval: 120_000,
  });


  // Always compute from live bond list — backend summary.active can be stale (2-min Redis cache)
  const running = bonds.filter(b => b.status !== "MATURED"); // ACTIVE + PENALTY = bonds still operating
  const penalty = bonds.filter(b => b.status === "PENALTY");
  const compliant = bonds.filter(b => b.status === "ACTIVE");
  const tvl = summary?.tvl ?? bonds.reduce((s, b) => s + (b.tvl || 0), 0);
  const runningCount = running.length;
  const penaltyCount = penalty.length;
  const compliantCount = compliant.length;

  if (isLoading) return (
    <div style={{ padding: 40, color: "var(--green)", fontFamily: "var(--mono)", fontSize: 11, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "pulse 1.2s infinite" }} />
      LOADING PORTFOLIO...
    </div>
  );

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
        <KPI
          label="Running Bonds"
          icon="◈ LIVE"
          value={runningCount}
          sub={`${bonds.length} total instruments`}
          color="var(--green)"
        />
        <KPI
          label="Total Value Locked"
          icon="₿ ON-CHAIN"
          value={`₹${(tvl / 1e7).toFixed(1)}Cr`}
          sub="across portfolio"
          color="var(--text)"
          barColor="var(--amber)"
        />
        <KPI
          label="Under Penalty"
          icon={penaltyCount ? "▲ RATE HIKE" : "✓ CLEAR"}
          value={penaltyCount}
          sub={penaltyCount ? "Rate hike active" : "All compliant"}
          color={penaltyCount ? "var(--red)" : "var(--green)"}
          barColor={penaltyCount ? "var(--red)" : "var(--green)"}
        />
      </div>

      {/* Health Map + Recent */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>◈ Portfolio Health</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { l: "Penalty", n: penaltyCount, c: "var(--red)", bg: "var(--red-dim)" },
              { l: "Compliant", n: compliantCount, c: "var(--green)", bg: "var(--green-dim)" },
              { l: "Matured", n: bonds.filter(b => b.status === "MATURED").length, c: "var(--slate)", bg: "rgba(84,110,122,.1)" },
            ].map(h => (
              <div key={h.l} style={{ background: h.bg, border: `1px solid ${h.c}33`, borderRadius: "var(--r2)", padding: "14px 12px" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, color: h.c }}>{h.n}</div>
                <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{h.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, height: 3, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${runningCount ? (compliantCount / runningCount) * 100 : 0}%`, background: "var(--green)", borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text3)" }}>
            <span>Compliance Rate</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{runningCount ? ((compliantCount / runningCount) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>


      </div>

      {/* Bond Table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          ◈ Bond Portfolio
          <span style={{ fontSize: 9 }}>{bonds.length} INSTRUMENTS</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Bond", "Status", "Capacity", "Base Rate", "Current Rate", "Today's PR", "TVL", ""].map(h => (
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
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12 }}>{(b.capacity_kw / 1000).toFixed(1)} MW</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)" }}>{b.base_rate}%</td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: b.current_rate > b.base_rate ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
                  {b.current_rate}% {b.current_rate > b.base_rate && "↑"}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: b.today_pr ? (b.today_pr >= 0.75 && b.today_pr <= 1.0 ? "var(--green)" : "var(--red)") : "var(--slate)" }}>
                  {b.today_pr ? (
                    <div>
                      <div>{(b.today_pr * 100).toFixed(0)}%</div>
                      {b.today_pr_date && b.today_pr_date !== new Date().toISOString().split("T")[0] && (
                        <div style={{ fontSize: 8, color: "var(--text3)", marginTop: 1 }}>
                          {new Date(b.today_pr_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                      )}
                    </div>
                  ) : <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, background: "rgba(84,110,122,.12)", border: "1px solid rgba(84,110,122,.25)", color: "var(--slate)", letterSpacing: ".06em", fontWeight: 700 }}>— PENDING</span>}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12 }}>
                  {b.tvl ? `₹${(b.tvl / 1e5).toFixed(0)}L` : "—"}
                </td>
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}>
                  <button style={{ padding: "5px 12px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 10, cursor: "pointer", fontFamily: "var(--mono)" }}>
                    OPEN →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}