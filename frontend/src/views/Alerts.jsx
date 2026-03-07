import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAlerts, fetchAlertSummary } from "../api";

const SEVERITY_COLOR = {
  critical: "var(--red)",
  warning:  "var(--amber)",
  success:  "var(--green)",
  info:     "var(--blue)",
};
const SEVERITY_DIM = {
  critical: "var(--red-dim)",
  warning:  "var(--amber-dim)",
  success:  "var(--green-dim)",
  info:     "rgba(33,150,243,.08)",
};
const TYPE_ICON = { BLOCKCHAIN: "🔗", EMAIL: "📩", SMS: "📱", SYSTEM: "⚙️" };
const TYPE_COLOR = { BLOCKCHAIN: "var(--cyan)", EMAIL: "var(--blue)", SMS: "var(--amber)", SYSTEM: "var(--slate)" };

function Badge({ label, color, dim, border }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 100, fontSize: 9, fontWeight: 700,
      background: dim || `${color}18`, color, border: `1px solid ${border || color + "33"}`,
      letterSpacing: ".06em", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 12px", borderRadius: 100, fontSize: 10, fontWeight: 600,
      background: active ? "var(--blue)" : "var(--card2)",
      color: active ? "#fff" : "var(--text2)",
      border: `1px solid ${active ? "var(--blue)" : "var(--border)"}`,
      cursor: "pointer", fontFamily: "var(--mono)", transition: "all .15s",
    }}>{label}</button>
  );
}

export default function Alerts() {
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterBond, setFilterBond] = useState("all");
  const [collapseSystem, setCollapseSystem] = useState(true);

  const { data: summary } = useQuery({ queryKey: ["alert-summary"], queryFn: fetchAlertSummary });
  const { data, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fetchAlerts({ limit: 200 }),
    refetchInterval: 30000,
  });
  const alerts = data?.alerts || [];

  // Derive unique bond ids for filter
  const bondIds = useMemo(() => [...new Set(alerts.map(a => a.bond_id).filter(Boolean))], [alerts]);

  // Collapse repeated SYSTEM messages into one with a count
  const dedupedAlerts = useMemo(() => {
    if (!collapseSystem) return alerts;
    const seen = new Map();
    const out = [];
    for (const a of alerts) {
      if (a.type === "SYSTEM") {
        // Key = bond_id + normalized message (strip the date suffix to group same-type warnings)
        const key = `${a.bond_id}::${a.message.replace(/\d{4}-\d{2}-\d{2}/g, "DATE")}`;
        if (seen.has(key)) {
          seen.get(key).count++;
        } else {
          const entry = { ...a, count: 1 };
          seen.set(key, entry);
          out.push(entry);
        }
      } else {
        out.push({ ...a, count: 1 });
      }
    }
    return out;
  }, [alerts, collapseSystem]);

  const filtered = useMemo(() => dedupedAlerts.filter(a => {
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    if (filterBond !== "all" && a.bond_id !== filterBond) return false;
    return true;
  }), [dedupedAlerts, filterSeverity, filterType, filterBond]);

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Critical",     v: summary?.by_severity?.critical || 0,                          c: "var(--red)" },
          { l: "Blockchain TXs", v: alerts.filter(a => a.type === "BLOCKCHAIN").length,          c: "var(--cyan)" },
          { l: "Warnings",     v: alerts.filter(a => a.severity === "warning").length,           c: "var(--amber)" },
          { l: "Total",        v: summary?.total || alerts.length,                               c: "var(--text)" },
        ].map(k => (
          <div key={k.l} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 800, color: k.c }}>{k.v}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: k.c }} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginRight: 4 }}>SEVERITY</span>
          {["all", "critical", "warning", "success"].map(s => (
            <FilterChip key={s} label={s === "all" ? "All" : s} active={filterSeverity === s} onClick={() => setFilterSeverity(s)} />
          ))}
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
          <span style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginRight: 4 }}>TYPE</span>
          {["all", "BLOCKCHAIN", "SYSTEM", "EMAIL", "SMS"].map(t => (
            <FilterChip key={t} label={t === "all" ? "All" : t} active={filterType === t} onClick={() => setFilterType(t)} />
          ))}
          {bondIds.length > 0 && (
            <>
              <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
              <span style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginRight: 4 }}>BOND</span>
              <FilterChip label="All" active={filterBond === "all"} onClick={() => setFilterBond("all")} />
              {bondIds.map(id => (
                <FilterChip key={id} label={id} active={filterBond === id} onClick={() => setFilterBond(id)} />
              ))}
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "var(--text3)" }}>Collapse duplicate system alerts</span>
            <button onClick={() => setCollapseSystem(v => !v)} style={{
              width: 32, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
              background: collapseSystem ? "var(--green)" : "var(--border)",
              position: "relative", transition: "background .2s",
            }}>
              <div style={{
                position: "absolute", top: 2, left: collapseSystem ? 16 : 2,
                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                transition: "left .2s",
              }} />
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--text3)" }}>
          Showing <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> of <strong style={{ color: "var(--text)" }}>{alerts.length}</strong> alerts
          {collapseSystem && alerts.filter(a=>a.type==="SYSTEM").length > 0 && (
            <span style={{ color: "var(--amber)", marginLeft: 8 }}>
              · {alerts.filter(a=>a.type==="SYSTEM").length - dedupedAlerts.filter(a=>a.type==="SYSTEM").length} system duplicates collapsed
            </span>
          )}
        </div>
      </div>

      {/* Alert List */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text2)", fontSize: 12 }}>Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
          {alerts.length === 0 ? "No alerts recorded yet." : "No alerts match the current filters."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((a, i) => {
            const sevColor = SEVERITY_COLOR[a.severity] || "var(--text2)";
            const sevDim   = SEVERITY_DIM[a.severity]  || "var(--card2)";
            const typeColor = TYPE_COLOR[a.type] || "var(--text2)";
            return (
              <div key={a.id ?? i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 14px", borderRadius: "var(--r2)",
                border: `1px solid ${a.severity === "critical" ? "rgba(255,61,61,.25)" : a.severity === "success" ? "rgba(0,230,118,.15)" : "var(--border)"}`,
                background: a.severity === "critical" ? "rgba(255,61,61,.04)" : "var(--card2)",
              }}>
                {/* Left: severity stripe */}
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: sevColor, flexShrink: 0 }} />

                {/* Icon */}
                <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[a.type] || "📌"}</span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, flex: 1 }}>
                      {a.message}
                      {a.count > 1 && (
                        <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 7px", borderRadius: 100,
                          background: "rgba(255,179,0,.12)", color: "var(--amber)", border: "1px solid rgba(255,179,0,.25)", fontWeight: 700 }}>
                          ×{a.count}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap" }}>
                      <Badge label={a.type} color={typeColor} />
                      <Badge label={a.severity?.toUpperCase()} color={sevColor} dim={sevDim} />
                      <Badge
                        label={a.status}
                        color={a.status === "CONFIRMED" || a.status === "DELIVERED" ? "var(--green)" : a.status === "FAILED" ? "var(--red)" : "var(--amber)"}
                        dim={a.status === "CONFIRMED" || a.status === "DELIVERED" ? "var(--green-dim)" : a.status === "FAILED" ? "var(--red-dim)" : "var(--amber-dim)"}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--mono)", color: "var(--cyan)" }}>{a.bond_id}</span>
                    <span>{a.timestamp ? new Date(a.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}</span>
                  </div>
                  {a.tx_hash && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <a href={`https://amoy.polygonscan.com/tx/${a.tx_hash}`} target="_blank" rel="noreferrer"
                        style={{ fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", textDecoration: "none" }}>
                        🔗 {a.tx_hash.slice(0, 22)}… ↗
                      </a>
                      {a.gas_used && <span style={{ fontSize: 9, color: "var(--text3)" }}>Gas: {a.gas_used.toLocaleString()}</span>}
                      {a.block_number && <span style={{ fontSize: 9, color: "var(--text3)" }}>Block #{a.block_number.toLocaleString()}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
