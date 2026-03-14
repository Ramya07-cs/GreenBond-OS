import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAlertDigest } from "../api";

const fetchDigest = (days) => fetchAlertDigest(days);

const VERDICT_COLOR = {
  PENALTY:   "var(--red)",
  COMPLIANT: "var(--green)",
  RECOVERY:  "var(--cyan)",
  IGNORED:   "var(--amber)",
  PENDING:   "var(--slate)",
};
const VERDICT_DIM = {
  PENALTY:   "rgba(255,61,61,.12)",
  COMPLIANT: "rgba(0,230,118,.10)",
  RECOVERY:  "rgba(0,188,212,.10)",
  IGNORED:   "rgba(255,179,0,.10)",
  PENDING:   "rgba(84,110,122,.10)",
};

function VerdictBadge({ v }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 100,
      letterSpacing: ".07em", whiteSpace: "nowrap",
      color: VERDICT_COLOR[v] || "var(--text2)",
      background: VERDICT_DIM[v] || "var(--card2)",
      border: `1px solid ${(VERDICT_COLOR[v] || "var(--border)") + "44"}`,
    }}>{v}</span>
  );
}

function Section({ title, count, accent, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 14px", cursor: "pointer",
          background: open ? "rgba(255,255,255,.02)" : "transparent",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: ".08em", textTransform: "uppercase", flex: 1 }}>
          {title}
        </span>
        {count != null && (
          <span style={{
            fontSize: 9, padding: "1px 7px", borderRadius: 100, fontWeight: 700,
            background: count > 0 ? `${accent}22` : "var(--card2)",
            color: count > 0 ? accent : "var(--text3)",
            border: `1px solid ${count > 0 ? accent + "44" : "var(--border)"}`,
          }}>{count}</span>
        )}
        <span style={{ fontSize: 10, color: "var(--text3)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: "8px 14px 14px" }}>{children}</div>}
    </div>
  );
}

function BondCard({ bond, daysLabel }) {
  const isMaturityWarning = bond.maturity_status === "SOON" || bond.maturity_status === "DUE";
  const borderColor = bond.status === "PENALTY"
    ? "rgba(255,61,61,.25)"
    : isMaturityWarning ? "rgba(255,179,0,.3)"
    : "var(--border)";

  return (
    <div style={{
      background: "var(--card)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--r)",
      overflow: "hidden",
      marginBottom: 12,
    }}>
      {/* Bond header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        background: bond.status === "PENALTY" ? "rgba(255,61,61,.04)" : "var(--card2)",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
            {bond.bond_id}
          </span>
          <span style={{ fontSize: 11, color: "var(--text2)" }}>{bond.bond_name}</span>
          <VerdictBadge v={bond.status} />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em" }}>Current Rate</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)", color: bond.current_rate > bond.base_rate ? "var(--red)" : "var(--green)" }}>
              {bond.current_rate}%
            </div>
          </div>
          {bond.maturity_date && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em" }}>Maturity</div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--mono)", color: isMaturityWarning ? "var(--amber)" : "var(--text2)" }}>
                {bond.maturity_date}
                {bond.days_to_maturity != null && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: isMaturityWarning ? "var(--amber)" : "var(--text3)" }}>
                    {bond.maturity_status === "MATURED" ? "✓ MATURED"
                      : bond.maturity_status === "DUE" ? "▲ DUE"
                      : bond.maturity_status === "SOON" ? `▲ ${bond.days_to_maturity}d left`
                      : `${bond.days_to_maturity}d`}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Streak row */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {[
          { l: `Penalty Days (${daysLabel})`, v: bond.total_penalty, c: bond.total_penalty > 0 ? "var(--red)" : "var(--text2)" },
          { l: `Compliant Days (${daysLabel})`, v: bond.total_compliant, c: bond.total_compliant > 0 ? "var(--green)" : "var(--text2)" },
          { l: "Current Streak", v: (bond.penalty_streak ?? 0) > 0 ? `${bond.penalty_streak}d penalty` : `${bond.compliant_streak ?? 0}d compliant`, c: (bond.penalty_streak ?? 0) > 0 ? "var(--red)" : "var(--green)" },
          { l: "Unsubmitted Days", v: bond.total_missing, c: bond.total_missing > 0 ? "var(--slate)" : "var(--text2)" },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "8px 14px", borderRight: i < 3 ? "1px solid var(--border)" : "none" }}>
            <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 3 }}>{s.l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--mono)", color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Missing Production */}
      <Section title="Unsubmitted Days (within 7d window)" count={bond.missing_days.length} accent={bond.missing_days.length > 0 ? "var(--slate)" : "var(--text3)"} defaultOpen={bond.missing_days.length > 0}>
        {bond.missing_days.length === 0 ? (
          <div style={{ fontSize: 11, color: "var(--green)", padding: "8px 0" }}>✓ No missing production data in this period.</div>
        ) : (
          <>
            <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 8, lineHeight: 1.6 }}>
              These days have no production data yet. Submit before the 7-day deadline or they will be auto-locked as penalty.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {bond.missing_days.map((d, i) => (
                <span key={i} style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "3px 9px", borderRadius: 3, background: "var(--blue-dim)", color: "var(--blue)", border: "1px solid rgba(33,150,243,.25)", fontWeight: 600 }}>
                  {d.date}
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Maturity */}
      {bond.maturity_date && (
        <Section title="Maturity" accent={isMaturityWarning ? "var(--amber)" : "var(--text3)"} defaultOpen={isMaturityWarning}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { l: "Maturity Date", v: bond.maturity_date },
              { l: "Status", v: bond.maturity_status },
              { l: "Days Remaining", v: bond.maturity_status === "MATURED" ? "—" : `${bond.days_to_maturity}d` },
            ].map(f => (
              <div key={f.l} style={{ background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "8px 10px" }}>
                <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>{f.l}</div>
                <div style={{ fontSize: 12, fontFamily: "var(--mono)", fontWeight: 700, color: isMaturityWarning ? "var(--amber)" : "var(--text)" }}>{f.v}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export default function Alerts() {
  const { data: digest, isLoading } = useQuery({
    queryKey: ["alert-digest", 7],
    queryFn: () => fetchDigest(7),
    refetchInterval: 60000,
  });

  const bonds = (digest || []).filter(b => b.status !== "MATURED");
  const totalPenalty = bonds.reduce((s, b) => s + b.total_penalty, 0);
  const totalMissing = bonds.reduce((s, b) => s + b.total_missing, 0);
  const maturingSoon = bonds.filter(b => b.maturity_status === "SOON" || b.maturity_status === "DUE").length;
  const daysLabel = "7d";

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text2)" }}>
          ◈ Alert Center
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Penalty Days",    v: totalPenalty,  c: totalPenalty > 0 ? "var(--red)" : "var(--text2)" },
          { l: "Unsubmitted Days",  v: totalMissing,  c: totalMissing > 0 ? "var(--slate)" : "var(--text2)" },
          { l: "Maturing Soon",   v: maturingSoon,  c: maturingSoon > 0 ? "var(--amber)" : "var(--text2)" },
        ].map(k => (
          <div key={k.l} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 800, color: k.c }}>{k.v}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: k.c }} />
          </div>
        ))}
      </div>

      {/* Bond cards */}
      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text2)", fontSize: 12 }}>Loading digest…</div>
      ) : bonds.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No bonds found.</div>
      ) : (
        bonds.map(bond => <BondCard key={bond.bond_id} bond={bond} daysLabel={daysLabel} />)
      )}
    </div>
  );
}