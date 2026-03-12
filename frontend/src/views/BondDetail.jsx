import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from "recharts";
import { fetchAuditLogs, fetchTimeseries, fetchBlockchainStatus } from "../api";
import { useBond } from "../hooks/useBonds";
import StatusBadge from "../components/StatusBadge";
import StreakTracker from "../components/StreakTracker";
import GlassBox from "../components/GlassBox";
import BlockchainModal from "../components/BlockchainModal";



function CT({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 6, padding: "10px 14px" }}>
      <div style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--text3)", marginBottom: 7, textTransform: "uppercase" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0", fontSize: 11 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          <span style={{ color: "var(--text2)" }}>{p.name}:</span>
          <span style={{ color: p.color, fontWeight: 700 }}>{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const TABS = [["overview","Overview"],["analytics","Analytics"],["glass","Glass Box"],["blockchain","Blockchain"],["auditlog","Audit Log"]];

export default function BondDetail({ bond: initialBond, onBack }) {
  const [tab, setTab] = useState("overview");
  const [txModal, setTxModal] = useState(false);
  const { data: bond = initialBond } = useBond(initialBond.id);

  // Compute days since bond was created — charts only show from registration date
  const bondCreatedAt = bond.created_at ? new Date(bond.created_at) : new Date();
  const daysSinceCreation = Math.max(7, Math.ceil((Date.now() - bondCreatedAt.getTime()) / 86400000) + 1);
  const chartDays = Math.min(daysSinceCreation, 365);

  const { data: ts } = useQuery({ queryKey: ["timeseries", bond.id, chartDays], queryFn: () => fetchTimeseries(bond.id, chartDays) });
  const { data: auditData } = useQuery({ queryKey: ["audit", bond.id], queryFn: () => fetchAuditLogs({ bond_id: bond.id, limit: 20 }) });
  const { data: chainStatus } = useQuery({ queryKey: ["blockchain-status"], queryFn: fetchBlockchainStatus, refetchInterval: 60_000, retry: false });
  // Find most recent audit that actually has a blockchain TX (not IGNORED/pending entries)
  const latestAudit = auditData?.logs?.find(l => l.blockchain_tx_hash) ?? auditData?.logs?.[0];
  // Most recent fully-computed audit — skips IGNORED/PENDING entries
  const latestCompletedAudit = auditData?.logs?.find(l => l.verdict === "COMPLIANT" || l.verdict === "PENALTY");
  const isP = bond.status === "PENALTY";
  const isM = bond.status === "MATURED";

  // Clip all chart series to dates on/after bond registration — no phantom history
  const createdDateStr = bond.created_at ? bond.created_at.split("T")[0] : null;
  const clipSeries = (arr) => createdDateStr ? (arr || []).filter(p => p.day >= createdDateStr) : (arr || []);
  const perfSeries = clipSeries(ts?.perf_series);
  const energySeries = clipSeries(ts?.energy_series);
  const interestSeries = clipSeries(ts?.interest_series);

  const extraPerDay = bond.tvl ? (bond.tvl * (bond.current_rate - bond.base_rate)) / 100 / 365 : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text2)", fontSize: 11, cursor: "pointer", background: "none", border: "none", fontFamily: "var(--mono)", transition: "color .2s" }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--green)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--text2)"}
        >← BACK</button>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={bond.status} />
          {isP && <button onClick={() => setTxModal(true)} style={{ padding: "5px 12px", borderRadius: "var(--r2)", background: "transparent", border: "1px solid rgba(33,150,243,.4)", color: "var(--blue)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>🔗 VERIFY ON CHAIN</button>}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--display)", fontSize: 26, fontWeight: 800, letterSpacing: ".04em", lineHeight: 1 }}>{bond.name}</div>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4, letterSpacing: ".08em" }}>{bond.id} · {bond.lat}°N, {bond.lng}°E</div>
      </div>

      {/* Identity Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        {[
          { l: "Bond ID", v: bond.id, c: "var(--text2)" },
          { l: "Capacity", v: `${(bond.capacity_kw / 1000).toFixed(1)} MW`, c: "var(--cyan)" },
          { l: "Base Rate", v: `${bond.base_rate}%`, c: "var(--text)" },
          { l: "Current Rate", v: `${bond.current_rate}%`, c: bond.current_rate > bond.base_rate ? "var(--red)" : "var(--green)" },
        ].map(i => (
          <div key={i.l} style={{ background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: 12 }}>
            <div style={{ fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 5 }}>{i.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700, color: i.c }}>{i.v}</div>
          </div>
        ))}
      </div>

      {/* Performance Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, padding: 14, background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r)", marginBottom: 14 }}>

        {/* Latest PR — last successfully computed audit date */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 4 }}>Latest PR</div>
          {latestCompletedAudit ? (
            <>
              <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: latestCompletedAudit.calculated_pr >= 0.75 ? "var(--green)" : "var(--red)" }}>
                {(latestCompletedAudit.calculated_pr * 100).toFixed(0)}%
              </div>
              <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 3, fontFamily: "var(--mono)" }}>{latestCompletedAudit.date}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, padding: "3px 10px", borderRadius: 100, background: "rgba(84,110,122,.12)", border: "1px solid rgba(84,110,122,.25)", color: "var(--slate)", fontWeight: 700, display: "inline-block", marginTop: 4 }}>⏳ PENDING</div>
              <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 3 }}>awaiting NASA data</div>
            </>
          )}
        </div>

        {/* Threshold */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>Threshold</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: "var(--amber)" }}>75%</div>
        </div>

        {/* Verdict */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>Verdict</div>
          <StatusBadge status={bond.status} />
        </div>

        {/* Penalty Days */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>Penalty Days</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: bond.consecutive_penalty > 0 ? "var(--red)" : "var(--text3)" }}>
            {bond.consecutive_penalty || 0}
          </div>
        </div>

        {/* Compliant Days */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>Compliant Days</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: bond.consecutive_compliant > 0 ? "var(--green)" : "var(--text3)" }}>
            {bond.consecutive_compliant || 0}
          </div>
        </div>

      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 18px", fontSize: 11, fontWeight: 600,
            background: "none", border: "none", borderBottom: `2px solid ${tab === k ? "var(--green)" : "transparent"}`,
            color: tab === k ? "var(--green)" : "var(--text2)", cursor: "pointer",
            transition: "all .2s", marginBottom: -1, letterSpacing: ".04em", fontFamily: "var(--mono)",
          }}>{l}</button>
        ))}
      </div>

      {/* ── MATURITY BANNER ── shown across all tabs when bond is matured ── */}
      {isM && (
        <div style={{ marginBottom: 16, padding: "16px 20px", background: "rgba(84,110,122,.08)", border: "1px solid rgba(84,110,122,.3)", borderRadius: "var(--r)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--slate)" }}>
            🏁 BOND MATURED — {bond.maturity_date}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[
              { l: "Final Avg PR", v: bond.final_avg_pr ? `${(bond.final_avg_pr * 100).toFixed(1)}%` : "—", c: bond.final_avg_pr >= 0.75 ? "var(--green)" : "var(--red)" },
              { l: "Total Penalty Days", v: bond.total_penalty_days ?? "—", c: bond.total_penalty_days > 0 ? "var(--red)" : "var(--green)" },
              { l: "Base Rate", v: `${bond.base_rate}%`, c: "var(--text2)" },
              { l: "TVL", v: bond.tvl ? `₹${(bond.tvl / 1e7).toFixed(2)} Cr` : "—", c: "var(--cyan)" },
            ].map(f => (
              <div key={f.l} style={{ background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 5 }}>{f.l}</div>
                <div style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 800, color: f.c }}>{f.v}</div>
              </div>
            ))}
          </div>
          {bond.tvl && bond.total_penalty_days > 0 && (
            <div style={{ fontSize: 10, color: "var(--text3)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              💸 Estimated extra interest paid during penalty periods:&nbsp;
              <span style={{ color: "var(--red)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                ₹{((bond.tvl * (bond.base_rate * 0.5) / 100 / 365) * bond.total_penalty_days).toFixed(0)}
              </span>
              &nbsp;(approx. at penalty rate ×1.5 above base)
            </div>
          )}
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🔥 Streak Tracker</div>
              <StreakTracker bond={bond} />
            </div>
            {isP && (
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>💸 Financial Impact</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { l: "Rate Hike", v: `+${(bond.current_rate - bond.base_rate).toFixed(1)}%` },
                    { l: "Extra / Day", v: `₹${extraPerDay.toFixed(0)}` },
                    { l: "Extra / Month", v: `₹${(extraPerDay * 30).toFixed(0)}` },
                    { l: "Extra / Year", v: `₹${(extraPerDay * 365).toFixed(0)}` },
                  ].map(f => (
                    <div key={f.l} style={{ background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.2)", borderRadius: "var(--r2)", padding: "12px 14px", textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>{f.l}</div>
                      <div style={{ fontFamily: "var(--display)", fontSize: 20, fontWeight: 800, color: "var(--red)" }}>{f.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interest Rate Timeline */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 8 }}>📉 Interest Rate Timeline</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={interestSeries}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#455A64", fontSize: 9 }} tickLine={false} interval={9} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                  <YAxis domain={[4, 9]} tick={{ fill: "#455A64", fontSize: 9 }} axisLine={false} tickFormatter={v => `${v}%`} width={34} />
                  <Tooltip content={<CT />} />
                  <ReferenceLine y={bond.base_rate} stroke="var(--green)" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Line type="stepAfter" dataKey="rate" name="Rate" stroke="var(--amber)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {tab === "analytics" && (
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 8 }}>📈 PR Over Time — Since {bondCreatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={perfSeries}>
                  <defs><linearGradient id="prg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--green)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--green)" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#455A64", fontSize: 9 }} tickLine={false} interval={9} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                  <YAxis domain={([min]) => [Math.min(min * 0.9, 0), 1.1]} tick={{ fill: "#455A64", fontSize: 9 }} axisLine={false} tickFormatter={v => `${(v*100).toFixed(0)}%`} width={36} />
                  <Tooltip content={<CT />} />
                  <ReferenceLine y={0.75} stroke="var(--red)" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: "75% Threshold", fill: "var(--red)", fontSize: 9, position: "insideTopRight" }} />
                  {perfSeries.filter(p => p.verdict === "PENALTY").map((p, i) => <ReferenceDot key={i} x={p.day} y={p.pr} r={3} fill="var(--red)" stroke="none" />)}
                  <Area type="monotone" dataKey="pr" name="PR" stroke="var(--green)" fill="url(#prg)" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6 }}>🔴 Red dots = penalty events (PR below 75%)</div>
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 8 }}>⚡ Production vs. NASA Expected (kWh)</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={energySeries}>
                  <defs>
                    <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--green)" stopOpacity={0.2}/><stop offset="95%" stopColor="var(--green)" stopOpacity={0}/></linearGradient>
                    <linearGradient id="pg3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--blue)" stopOpacity={0.15}/><stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#455A64", fontSize: 9 }} tickLine={false} interval={9} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                  <YAxis tick={{ fill: "#455A64", fontSize: 9 }} axisLine={false} unit=" kWh" width={48} />
                  <Tooltip content={<CT />} />
                  <Area type="linear" dataKey="predicted" name="NASA Predicted" stroke="var(--blue)" fill="url(#pg3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                  <Area type="linear" dataKey="actual" name="Actual kWh" stroke="var(--green)" fill="url(#ag2)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── GLASS BOX ── */}
      {tab === "glass" && (
        <div>
          <div style={{ padding: "10px 14px", background: "rgba(0,230,118,.04)", border: "1px solid rgba(0,230,118,.15)", borderRadius: "var(--r2)", marginBottom: 14, fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
            🔬 <strong style={{ color: "var(--green)" }}>Glass Box:</strong> Every step of the PR calculation is shown below. Auditors can independently verify the raw data, formula, and final verdict.
          </div>
          <div style={{ marginBottom: 14 }}><GlassBox bond={bond} auditLog={latestCompletedAudit} /></div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>📋 Audit Trail + Blockchain Hashes</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Date","PR","NASA GHI","Verdict","TX Hash"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 12px", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {(auditData?.logs || []).filter(log => log.verdict !== "IGNORED").map((log, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 12px", fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.date}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12, color: log.calculated_pr >= 0.75 ? "var(--green)" : "var(--red)", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.calculated_pr ? `${(log.calculated_pr * 100).toFixed(0)}%` : "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)", borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.nasa_ghi ? `${log.nasa_ghi} kWh/m²` : "—"}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}><span style={{ fontSize: 10, fontWeight: 700, color: log.verdict === "PENALTY" ? "var(--red)" : log.verdict === "COMPLIANT" ? "var(--green)" : "var(--slate)" }}>{log.verdict}</span></td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}>
                      {log.blockchain_tx_hash ? <span style={{ fontSize: 10, color: "var(--blue)", cursor: "pointer", fontFamily: "var(--mono)" }} onClick={() => setTxModal(true)}>{log.blockchain_tx_hash.slice(0, 18)}... ↗</span> : <span style={{ fontSize: 10, color: "var(--text3)" }}>—</span>}
                    </td>
                  </tr>
                ))}
                {(auditData?.logs || []).filter(log => log.verdict !== "IGNORED").length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "20px 12px", textAlign: "center", color: "var(--text3)", fontSize: 11 }}>No completed audits yet — first audit runs once NASA GHI data is available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BLOCKCHAIN ── */}
      {tab === "blockchain" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Node status strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[
              { l: "Network",      v: chainStatus?.network?.replace("Polygon ","") || "Amoy Testnet", c: "var(--blue)" },
              { l: "Connected",    v: chainStatus == null ? "..." : chainStatus.connected ? "✅ YES" : "⚠ NO", c: chainStatus?.connected ? "var(--green)" : "var(--red)" },
              { l: "Latest Block", v: chainStatus?.latest_block != null ? `#${chainStatus.latest_block.toLocaleString()}` : "—", c: "var(--cyan)" },
              { l: "Gas Price",    v: chainStatus?.gas_price_gwei != null ? `${chainStatus.gas_price_gwei} gwei` : "—", c: "var(--amber)" },
            ].map(t => (
              <div key={t.l} style={{ background: "var(--card2)", border: "1px solid rgba(33,150,243,.15)", borderRadius: "var(--r2)", padding: "12px 14px" }}>
                <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 5 }}>{t.l}</div>
                <div style={{ fontSize: 13, color: t.c, fontWeight: 700, fontFamily: "var(--mono)" }}>{t.v}</div>
              </div>
            ))}
          </div>

          {/* On-chain transactions for this bond */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>🔗 On-Chain Transactions</div>

            {/* Registration TX */}
            {bond.registration_tx_hash && (
              <div style={{ marginBottom: 14, padding: "10px 12px", background: "rgba(0,188,212,.05)", border: "1px solid rgba(0,188,212,.15)", borderRadius: "var(--r2)" }}>
                <div style={{ fontSize: 9, color: "var(--cyan)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>📋 Bond Registration</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  {[
                    { l: "TX Hash",      v: bond.registration_tx_hash.slice(0, 20) + "…" },
                    { l: "Block",        v: bond.registration_block?.toLocaleString() || "—" },
                    { l: "Type",         v: "registerBond()" },
                    { l: "Status",       v: "✅ CONFIRMED" },
                  ].map(t => (
                    <div key={t.l} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "7px 10px" }}>
                      <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 2 }}>{t.l}</div>
                      <div style={{ fontSize: 11, color: "var(--cyan)", fontWeight: 600, fontFamily: "var(--mono)" }}>{t.v}</div>
                    </div>
                  ))}
                </div>
                <a href={`https://amoy.polygonscan.com/tx/${bond.registration_tx_hash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", textDecoration: "none" }}>
                  ↗ View on Polygonscan
                </a>
              </div>
            )}

            {/* All rate-change TXes (penalty / recovery) — list every audit log that has a tx hash */}
            {(() => {
              const rateTxLogs = (auditData?.logs || []).filter(l => l.blockchain_tx_hash);
              if (rateTxLogs.length === 0) {
                return !bond.registration_tx_hash ? (
                  <div style={{ color: "var(--text3)", fontSize: 11, lineHeight: 1.7 }}>
                    No blockchain transactions yet for this bond. A TX is written only when the interest rate changes (penalty trigger or recovery).
                    <br /><br />
                    <span style={{ color: "var(--text2)" }}>Use the <strong style={{ color: "var(--blue)" }}>🔗 Blockchain</strong> page in the sidebar for full TX lookup and audit triggering.</span>
                  </div>
                ) : null;
              }
              return (
                <div>
                  <div style={{ fontSize: 9, color: "var(--amber)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
                    ⚡ Rate Change TXes ({rateTxLogs.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {rateTxLogs.map((log, i) => {
                      const isP = log.verdict === "PENALTY";
                      const isR = log.verdict === "RECOVERY";
                      const accentColor = isP ? "var(--red)" : isR ? "var(--green)" : "var(--cyan)";
                      return (
                        <div key={i} style={{ padding: "10px 12px", background: "var(--card2)", border: `1px solid ${isP ? "rgba(255,61,61,.2)" : isR ? "rgba(0,230,118,.2)" : "var(--border)"}`, borderRadius: "var(--r2)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, fontWeight: 700,
                              background: isP ? "var(--red-dim)" : isR ? "var(--green-dim)" : "rgba(0,188,212,.08)",
                              color: accentColor, border: `1px solid ${accentColor}33` }}>
                              {log.verdict}
                            </span>
                            <span style={{ fontSize: 9, color: "var(--text)", fontFamily: "var(--mono)" }}>{log.date}</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                            {[
                              { l: "TX Hash",    v: log.blockchain_tx_hash.slice(0, 20) + "…" },
                              { l: "Block",      v: log.block_number?.toLocaleString() || "—" },
                              { l: "Gas Used",   v: log.gas_used?.toLocaleString() || "—" },
                              { l: "Rate",       v: log.rate_before != null && log.rate_after != null ? `${log.rate_before}% → ${log.rate_after}%` : "—" },
                            ].map(t => (
                              <div key={t.l} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "6px 9px" }}>
                                <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>{t.l}</div>
                                <div style={{ fontSize: 10, color: accentColor, fontFamily: "var(--mono)", fontWeight: 600 }}>{t.v}</div>
                              </div>
                            ))}
                          </div>
                          <a href={`https://amoy.polygonscan.com/tx/${log.blockchain_tx_hash}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", textDecoration: "none" }}>
                            ↗ View on Polygonscan
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Inline TX lookup */}
        </div>
      )}

      {/* ── AUDIT LOG ── */}
      {tab === "auditlog" && (
        <div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              📋 Audit History — All Runs
              <span style={{ fontSize: 9, color: "var(--text3)" }}>{auditData?.logs?.filter(l => l.verdict !== "IGNORED").length || 0} RECORDS</span>
            </div>
            {(!auditData?.logs || auditData.logs.filter(l => l.verdict !== "IGNORED").length === 0) ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                No audit records yet. The first audit runs at 06:00 IST.<br />
                <span style={{ fontSize: 10, color: "var(--text3)" }}>Use <strong style={{ color: "var(--blue)" }}>Blockchain → Trigger Audit</strong> to run one manually.</span>
              </div>
            ) : (
              <div>
                {auditData.logs.filter(l => l.verdict !== "IGNORED").map((log, i, arr) => {
                  const isP = log.verdict === "PENALTY";
                  const isC = log.verdict === "COMPLIANT";
                  const nodeColor = isP ? "var(--red)" : isC ? "var(--green)" : "var(--slate)";
                  const rateChanged = log.rate_after !== log.rate_before;
                  return (
                    <div key={i} style={{ display: "flex", gap: 14 }}>
                      {/* Timeline track */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 20 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: nodeColor, boxShadow: `0 0 8px ${nodeColor}`, marginTop: 4, flexShrink: 0 }} />
                        {i < arr.length - 1 && <div style={{ flex: 1, width: 1, background: "var(--border)", minHeight: 24, margin: "4px 0" }} />}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: 18, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>{log.date}</span>
                          <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 100, fontWeight: 700, letterSpacing: ".07em",
                            background: isP ? "var(--red-dim)" : isC ? "var(--green-dim)" : "rgba(84,110,122,.1)",
                            color: isP ? "var(--red)" : isC ? "var(--green)" : "var(--slate)",
                            border: `1px solid ${isP ? "rgba(255,61,61,.25)" : isC ? "rgba(0,230,118,.25)" : "rgba(84,110,122,.2)"}`,
                          }}>{log.verdict}</span>
                          {rateChanged && (
                            <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 100, fontWeight: 700, background: "rgba(33,150,243,.12)", color: "var(--blue)", border: "1px solid rgba(33,150,243,.25)" }}>
                              🔗 RATE CHANGE
                            </span>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 16px", fontSize: 10 }}>
                          <span style={{ color: "var(--text3)" }}>PR</span>
                          <span style={{ color: nodeColor, fontWeight: 700, fontFamily: "var(--mono)" }}>
                            {log.calculated_pr != null ? `${(log.calculated_pr * 100).toFixed(1)}%` : "—"}
                          </span>
                          <span style={{ color: "var(--text3)" }}>NASA GHI</span>
                          <span style={{ color: "var(--blue)", fontFamily: "var(--mono)" }}>{log.nasa_ghi ? `${log.nasa_ghi} kWh/m²` : "—"}</span>
                          <span style={{ color: "var(--text3)" }}>Actual kWh</span>
                          <span style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>{log.actual_kwh ? `${log.actual_kwh.toLocaleString()}` : "—"}</span>
                          <span style={{ color: "var(--text3)" }}>Rate</span>
                          <span style={{ fontFamily: "var(--mono)", color: rateChanged ? "var(--amber)" : "var(--text2)" }}>
                            {log.rate_before}% {rateChanged ? `→ ${log.rate_after}%` : ""}
                          </span>
                        </div>
                        {log.blockchain_tx_hash && log.rate_after !== log.rate_before && (
                          <div style={{ marginTop: 5, fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", cursor: "pointer" }} onClick={() => setTxModal(true)}>
                            🔗 {log.blockchain_tx_hash.slice(0, 22)}... ↗
                          </div>
                        )}
                      </div>
                    </div>
                  );                })}
              </div>
            )}
          </div>
        </div>
      )}

      {txModal && <BlockchainModal bond={bond} txData={latestAudit} onClose={() => setTxModal(false)} />}
    </div>
  );
}