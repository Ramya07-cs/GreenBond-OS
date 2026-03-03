import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useBonds } from "../hooks/useBonds";
import { fetchAlertSummary, fetchTimeseries } from "../api";
import StatusBadge from "../components/StatusBadge";

function KPI({ label, value, sub, color, barColor }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 5 }}>{sub}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: barColor || "var(--green)" }} />
    </div>
  );
}

export default function Dashboard({ onSelectBond }) {
  const { data: bonds = [], isLoading } = useBonds();
  const { data: alertSummary } = useQuery({ queryKey: ["alert-summary"], queryFn: fetchAlertSummary });

  const active = bonds.filter(b => b.status !== "MATURED");
  const penalty = bonds.filter(b => b.status === "PENALTY");
  const tvl = bonds.reduce((s, b) => s + (b.tvl || 0), 0);
  const avgPR = active.length
    ? active.filter(b => b.today_pr).reduce((s, b) => s + b.today_pr, 0) / active.filter(b => b.today_pr).length
    : 0;

  if (isLoading) return <div style={{ padding: 40, color: "var(--text2)", fontFamily: "var(--mono)", fontSize: 12 }}>Loading portfolio...</div>;

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 16 }}>
        <KPI label="📊 Active Bonds" value={active.length} sub={`${bonds.length} total`} color="var(--green)" />
        <KPI label="💰 Total Value Locked" value={`₹${(tvl / 1e7).toFixed(1)}Cr`} sub="across portfolio" color="var(--text)" barColor="var(--amber)" />
        <KPI label="🚨 Under Penalty" value={penalty.length} sub={penalty.length ? "Rate hike active" : "All compliant"} color={penalty.length ? "var(--red)" : "var(--green)"} barColor={penalty.length ? "var(--red)" : "var(--green)"} />
        <KPI label="📈 Avg PR" value={avgPR ? `${(avgPR * 100).toFixed(1)}%` : "—"} sub="threshold 75%" color={avgPR >= 0.75 ? "var(--green)" : "var(--red)"} barColor={avgPR >= 0.75 ? "var(--green)" : "var(--red)"} />
        <KPI label="🔔 Critical Alerts" value={alertSummary?.unread_critical || 0} sub="today" color={alertSummary?.unread_critical ? "var(--red)" : "var(--green)"} barColor="var(--cyan)" />
      </div>

      {/* Health Map + Recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🗺️ Portfolio Health</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { l: "Penalty", n: penalty.length, c: "var(--red)", bg: "var(--red-dim)" },
              { l: "Active", n: bonds.filter(b => b.status === "ACTIVE").length, c: "var(--green)", bg: "var(--green-dim)" },
              { l: "Matured", n: bonds.filter(b => b.status === "MATURED").length, c: "var(--slate)", bg: "rgba(84,110,122,.1)" },
            ].map(h => (
              <div key={h.l} style={{ background: h.bg, border: `1px solid ${h.c}33`, borderRadius: "var(--r2)", padding: "14px 12px" }}>
                <div style={{ fontFamily: "var(--display)", fontSize: 28, fontWeight: 800, color: h.c }}>{h.n}</div>
                <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{h.l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, height: 3, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${active.length ? (bonds.filter(b => b.status === "ACTIVE").length / active.length) * 100 : 0}%`, background: "var(--green)", borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--text3)" }}>
            <span>Compliance Rate</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{active.length ? ((bonds.filter(b => b.status === "ACTIVE").length / active.length) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>

        {/* Portfolio PR Sparkline */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            📈 Portfolio PR (30d)
            <span style={{ fontSize: 9, color: "var(--text3)" }}>FIRST BOND SAMPLE</span>
          </div>
          {bonds[0] && <PRSparkline bondId={bonds[0].id} />}
        </div>
      </div>

      {/* Bond Table */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
          ⚡ Bond Portfolio
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
                <td style={{ padding: "11px 12px", borderBottom: "1px solid rgba(255,255,255,.025)", fontFamily: "var(--mono)", fontSize: 12, color: b.today_pr ? (b.today_pr >= 0.75 ? "var(--green)" : "var(--red)") : "var(--slate)" }}>
                  {b.today_pr ? `${(b.today_pr * 100).toFixed(0)}%` : "—"}
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

function PRSparkline({ bondId }) {
  const { data } = useQuery({ queryKey: ["timeseries", bondId, 30], queryFn: () => fetchTimeseries(bondId, 30), enabled: !!bondId });
  const chartData = data?.perf_series?.slice(-30) || [];
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="spg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="day" tick={false} axisLine={false} />
          <YAxis domain={[0.4, 1.05]} tick={{ fill: "#455A64", fontSize: 9 }} axisLine={false} tickFormatter={v => `${(v * 100).toFixed(0)}%`} width={34} />
          <Tooltip formatter={(v) => [`${(v * 100).toFixed(1)}%`, "PR"]} />
          <ReferenceLine y={0.75} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.5} />
          <Area type="monotone" dataKey="pr" stroke="var(--green)" fill="url(#spg)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
