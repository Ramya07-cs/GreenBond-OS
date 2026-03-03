import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
} from "recharts";
import { fetchAuditLogs, fetchTimeseries } from "../api";
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

const TABS = [["overview","Overview"],["analytics","Analytics"],["glass","Glass Box"],["blockchain","Blockchain"],["monitor","Live Monitor"]];

export default function BondDetail({ bond: initialBond, onBack }) {
  const [tab, setTab] = useState("overview");
  const [txModal, setTxModal] = useState(false);
  const { data: bond = initialBond } = useBond(initialBond.id);
  const { data: ts } = useQuery({ queryKey: ["timeseries", bond.id, 60], queryFn: () => fetchTimeseries(bond.id, 60) });
  const { data: auditData } = useQuery({ queryKey: ["audit", bond.id], queryFn: () => fetchAuditLogs({ bond_id: bond.id, limit: 20 }) });
  const latestAudit = auditData?.logs?.[0];
  const isP = bond.status === "PENALTY";
  const perfSeries = ts?.perf_series || [];
  const energySeries = ts?.energy_series || [];
  const interestSeries = ts?.interest_series || [];

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
        {[
          { l: "Today's PR", v: bond.today_pr ? `${(bond.today_pr * 100).toFixed(0)}%` : "—", c: bond.today_pr ? (bond.today_pr >= .75 ? "var(--green)" : "var(--red)") : "var(--text3)" },
          { l: "Threshold", v: "75%", c: "var(--amber)" },
          { l: "Verdict", v: bond.status, badge: true },
          { l: "Penalty Days", v: bond.consecutive_penalty || 0, c: bond.consecutive_penalty > 0 ? "var(--red)" : "var(--text3)" },
          { l: "Compliant Days", v: bond.consecutive_compliant || 0, c: bond.consecutive_compliant > 0 ? "var(--green)" : "var(--text3)" },
        ].map((p, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>{p.l}</div>
            {p.badge ? <StatusBadge status={bond.status} /> : <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: p.c || "var(--text)" }}>{p.v}</div>}
          </div>
        ))}
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
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 8 }}>📈 PR Over Time (60 days)</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={perfSeries}>
                  <defs><linearGradient id="prg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--green)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--green)" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#455A64", fontSize: 9 }} tickLine={false} interval={9} axisLine={{ stroke: "rgba(255,255,255,0.06)" }} />
                  <YAxis domain={[0.4, 1.05]} tick={{ fill: "#455A64", fontSize: 9 }} axisLine={false} tickFormatter={v => `${(v*100).toFixed(0)}%`} width={36} />
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
                  <Area type="monotone" dataKey="predicted" name="NASA Predicted" stroke="var(--blue)" fill="url(#pg3)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                  <Area type="monotone" dataKey="actual" name="Actual kWh" stroke="var(--green)" fill="url(#ag2)" strokeWidth={2} dot={false} />
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
          <div style={{ marginBottom: 14 }}><GlassBox bond={bond} auditLog={latestAudit} /></div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>📋 Audit Trail + Blockchain Hashes</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Date","PR","NASA GHI","Verdict","TX Hash"].map(h => <th key={h} style={{ textAlign: "left", padding: "7px 12px", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>)}</tr></thead>
              <tbody>
                {(auditData?.logs || []).map((log, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 12px", fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)", borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.date}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12, color: log.calculated_pr >= 0.75 ? "var(--green)" : "var(--red)", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.calculated_pr ? `${(log.calculated_pr * 100).toFixed(0)}%` : "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)", borderBottom: "1px solid rgba(255,255,255,.025)" }}>{log.nasa_ghi}</td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}><span style={{ fontSize: 10, fontWeight: 700, color: log.verdict === "PENALTY" ? "var(--red)" : log.verdict === "COMPLIANT" ? "var(--green)" : "var(--slate)" }}>{log.verdict}</span></td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.025)" }}>
                      {log.blockchain_tx_hash ? <span style={{ fontSize: 10, color: "var(--blue)", cursor: "pointer", fontFamily: "var(--mono)" }} onClick={() => setTxModal(true)}>{log.blockchain_tx_hash.slice(0, 18)}... ↗</span> : <span style={{ fontSize: 10, color: "var(--text3)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BLOCKCHAIN ── */}
      {tab === "blockchain" && (
        <div>
          <div style={{ background: "var(--card2)", border: "1px solid rgba(33,150,243,.2)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 8 }}>LATEST TRANSACTION</div>
            <div style={{ fontSize: 11, color: "var(--blue)", wordBreak: "break-all", cursor: "pointer", fontFamily: "var(--mono)" }} onClick={() => setTxModal(true)}>
              {latestAudit?.blockchain_tx_hash || "No transactions yet"} {latestAudit?.blockchain_tx_hash ? "↗" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              {[
                { l: "Gas Used", v: latestAudit?.gas_used?.toLocaleString() || "—" },
                { l: "Block Number", v: latestAudit?.block_number?.toLocaleString() || "—" },
                { l: "Network", v: "Polygon Mainnet" },
                { l: "Status", v: latestAudit?.blockchain_tx_hash ? "✅ CONFIRMED" : "—" },
              ].map(t => (
                <div key={t.l} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: 10 }}>
                  <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 4 }}>{t.l}</div>
                  <div style={{ fontSize: 12, color: "var(--cyan)", fontWeight: 600, fontFamily: "var(--mono)" }}>{t.v}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setTxModal(true)} style={{ marginTop: 14, padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)" }}>
              🔍 View Raw JSON Payload
            </button>
          </div>
        </div>
      )}

      {/* ── LIVE MONITOR ── */}
      {tab === "monitor" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>📡 Audit Timeline — Today</div>
          <div>
            {[
              { t: "06:00:00", e: "Monitoring job started by Celery Beat scheduler", tag: "SCHEDULER", c: "var(--text3)" },
              { t: "06:00:12", e: `NASA POWER API request for (${bond.lat}°N, ${bond.lng}°E)`, tag: "API CALL", c: "var(--blue)" },
              { t: "06:00:14", e: `GHI received: ${latestAudit?.nasa_ghi || "—"} kWh/m² · HTTP 200 OK`, tag: "SUCCESS", c: "var(--green)" },
              { t: "06:00:15", e: `Production data fetched from PostgreSQL for ${bond.id}`, tag: "DB QUERY", c: "var(--amber)" },
              { t: "06:00:15", e: `PR calculated: ${latestAudit?.calculated_pr?.toFixed(4) || "—"} → verdict: ${latestAudit?.verdict || "—"}`, tag: "COMPUTE", c: "var(--cyan)" },
              { t: "06:01:03", e: "Smart contract write initiated — Polygon Mainnet", tag: "BLOCKCHAIN", c: "var(--blue)" },
              { t: "06:04:07", e: `TX confirmed: ${latestAudit?.blockchain_tx_hash?.slice(0,20) || "—"}...`, tag: "CONFIRMED", c: "var(--green)" },
              { t: "06:05:01", e: "Alert pipeline triggered — Email + SMS queued", tag: "ALERT", c: "var(--amber)" },
              { t: "06:05:10", e: "Audit record written to PostgreSQL with TX hash", tag: "LOGGED", c: "var(--text3)" },
            ].map((item, i, arr) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: item.c, boxShadow: `0 0 6px ${item.c}`, marginTop: 3 }} />
                  {i < arr.length - 1 && <div style={{ flex: 1, width: 1, background: "var(--border)", margin: "3px 0", minHeight: 18 }} />}
                </div>
                <div style={{ paddingBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: ".06em", fontFamily: "var(--mono)" }}>{item.t}</div>
                  <div style={{ fontSize: 12, color: "var(--text)", marginTop: 2, lineHeight: 1.4 }}>{item.e}</div>
                  <span style={{ display: "inline-block", fontSize: 9, padding: "1px 7px", borderRadius: 100, marginTop: 4, fontWeight: 600, letterSpacing: ".06em", background: `${item.c}18`, color: item.c, border: `1px solid ${item.c}33` }}>{item.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {txModal && <BlockchainModal bond={bond} txData={latestAudit} onClose={() => setTxModal(false)} />}
    </div>
  );
}
