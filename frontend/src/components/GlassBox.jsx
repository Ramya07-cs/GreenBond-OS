import { useState } from "react";
export default function GlassBox({ bond, auditLog }) {
  const [open, setOpen] = useState(false);
  const pr = auditLog?.calculated_pr;
  const nasaGHI = auditLog?.nasa_ghi;
  const actualKWh = auditLog?.actual_kwh;
  const expectedKWh = auditLog?.expected_kwh;
  const verdict = auditLog?.verdict;
  const auditDate = auditLog?.date;

  const hasRealAudit = auditLog && (verdict === "COMPLIANT" || verdict === "PENALTY" || verdict === "RECOVERY");
  const isIgnored = auditLog && verdict === "IGNORED";
  const isPending = !auditLog;

  const headerColor = hasRealAudit
    ? (verdict === "COMPLIANT" ? "var(--green)" : verdict === "RECOVERY" ? "var(--cyan)" : "var(--red)")
    : isIgnored ? "var(--amber)" : "var(--slate)";

  const headerBg = hasRealAudit
    ? (verdict === "COMPLIANT" ? "rgba(0,230,118,.04)" : verdict === "RECOVERY" ? "rgba(0,188,212,.04)" : "rgba(255,61,61,.04)")
    : "rgba(84,110,122,.04)";

  const borderColor = hasRealAudit
    ? (verdict === "COMPLIANT" ? "rgba(0,230,118,.15)" : verdict === "RECOVERY" ? "rgba(0,188,212,.2)" : "rgba(255,61,61,.2)")
    : "rgba(84,110,122,.2)";

  const rows = hasRealAudit ? [
    {
      key: "Raw Production",
      value: actualKWh
        ? `${actualKWh.toLocaleString()} kWh — submitted via inverter log`
        : "No production data was submitted for this date",
      ok: !!actualKWh,
    },
    {
      key: "NASA GHI",
      value: nasaGHI
        ? `${nasaGHI} kWh/m² — fetched from NASA POWER API for ${bond?.lat}°N, ${bond?.lng}°E`
        : "Not available — NASA satellite data had a 5–6 day processing lag on this date",
      ok: !!nasaGHI,
    },
    {
      key: "System Capacity",
      value: bond
        ? `${(bond.capacity_kw / 1000).toFixed(1)} MW · Performance factor 0.80 · Expected = ${
            nasaGHI && bond
              ? `${(nasaGHI * bond.capacity_kw * 0.80).toFixed(0)} kWh`
              : "—"
          }`
        : "—",
      ok: true,
    },
    {
      key: "PR Formula",
      value: pr && nasaGHI && bond && actualKWh
        ? `Actual GHI (${(actualKWh / (bond.capacity_kw * 0.80)).toFixed(4)} kWh/m²) ÷ NASA GHI (${nasaGHI}) = ${pr.toFixed(4)}`
        : "Cannot compute — missing production data or NASA GHI",
      ok: !!pr,
    },
    {
      key: "Threshold",
      value: "0.75 (75%) — encoded in the smart contract at bond creation, immutable",
      ok: true,
    },
    {
      key: "Energy Deficit",
      value: pr && expectedKWh && actualKWh
        ? pr > 1.0
          ? `None — but PR exceeded 100% (${(pr * 100).toFixed(1)}%), indicating a data anomaly`
          : pr >= 0.75
          ? `None — produced +${Math.abs(actualKWh - expectedKWh).toFixed(0)} kWh above expected ${expectedKWh.toLocaleString()} kWh`
          : `${(expectedKWh - actualKWh).toFixed(0)} kWh below expected output of ${expectedKWh.toLocaleString()} kWh`
        : "—",
      ok: pr >= 0.75 && pr <= 1.0,
    },
    {
      key: "Final Verdict",
      value: verdict === "COMPLIANT"
        ? `COMPLIANT — PR ${(pr * 100).toFixed(1)}% exceeds the 75% threshold`
        : verdict === "RECOVERY"
        ? `RECOVERY — PR ${(pr * 100).toFixed(1)}% exceeds threshold for 5th consecutive day, rate restored to base`
        : pr > 1.0
        ? `PENALTY — PR ${(pr * 100).toFixed(1)}% exceeds 100%, indicating manipulated or erroneous production data`
        : `PENALTY — PR ${(pr * 100).toFixed(1)}% is below the 75% threshold`,
      ok: verdict === "COMPLIANT",
      isVerdict: true,
    },
  ] : [];

  const verdictColor = verdict === "COMPLIANT" ? "var(--green)" : verdict === "RECOVERY" ? "var(--cyan)" : verdict === "PENALTY" ? "var(--red)" : "var(--slate)";

  return (
    <div>
      {/* Main glass box */}
      <div style={{ border: `1px solid ${borderColor}`, borderRadius: "var(--r)", overflow: "hidden" }}>
        <div
          onClick={() => setOpen(!open)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: headerBg, cursor: "pointer", transition: "background .2s" }}
        >
          <div style={{ fontFamily: "var(--display)", fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: headerColor, display: "flex", alignItems: "center", gap: 8 }}>
            🔬 Glass Box —&nbsp;
            {hasRealAudit && `PR Audit Record · ${auditDate}`}
            {isIgnored && `Audit Record · ${auditDate} · Skipped`}
            {isPending && "No Completed Audit Yet"}

            {hasRealAudit && (
              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, fontWeight: 700, background: verdict === "COMPLIANT" ? "rgba(0,230,118,.15)" : verdict === "RECOVERY" ? "rgba(0,188,212,.15)" : "rgba(255,61,61,.15)", color: verdict === "COMPLIANT" ? "var(--green)" : verdict === "RECOVERY" ? "var(--cyan)" : "var(--red)", border: `1px solid ${verdict === "COMPLIANT" ? "rgba(0,230,118,.3)" : verdict === "RECOVERY" ? "rgba(0,188,212,.3)" : "rgba(255,61,61,.3)"}` }}>
                {verdict}
              </span>
            )}
            {isIgnored && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, background: "rgba(255,179,0,.12)", color: "var(--amber)", border: "1px solid rgba(255,179,0,.25)", fontWeight: 700 }}>IGNORED</span>}
            {isPending && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 100, background: "rgba(84,110,122,.12)", color: "var(--slate)", border: "1px solid rgba(84,110,122,.25)", fontWeight: 700 }}>PENDING</span>}
          </div>
          <span style={{ color: headerColor, fontSize: 14 }}>{open ? "▲" : "▼"}</span>
        </div>

        {open && (
          <div style={{ background: "var(--input)", borderTop: `1px solid ${borderColor}` }}>
            {isIgnored && (
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>⚠ This day was excluded from penalty/compliant streak calculations</div>
                <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
                  Reason: {!auditLog?.actual_kwh && !auditLog?.nasa_ghi
                    ? "No production data was submitted and NASA GHI was unavailable."
                    : !auditLog?.nasa_ghi
                    ? "NASA satellite GHI data was unavailable for this date (5–6 day lag)."
                    : "No production data was submitted for this date."}
                  <br />IGNORED days do not count as penalty days and do not break a compliant streak.
                </div>
              </div>
            )}

            {isPending && (
              <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--slate)", fontWeight: 600 }}>No completed audits yet</div>
                <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
                  Audits run daily at 06:00 IST but require NASA GHI satellite data, which has a <strong style={{ color: "var(--amber)" }}>5–6 day processing lag</strong>.
                  Even if you've submitted production data, the PR cannot be calculated until NASA publishes the GHI value
                  for that date. The first fully-computed PR audit will appear here automatically once NASA data is available.
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", padding: "8px 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                  NASA data lag is normal — the satellite processes irradiance readings 5–6 days after the observation date.
                  No action is needed on your part.
                </div>
              </div>
            )}

            {hasRealAudit && rows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems: "stretch" }}>
                <div style={{ fontSize: 10, color: "var(--text3)", padding: "12px 14px", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center" }}>{row.key}</div>
                <div style={{ fontSize: 11, padding: "12px 14px", lineHeight: 1.6, color: row.isVerdict ? verdictColor : row.ok ? "var(--text)" : "var(--text2)", fontWeight: row.isVerdict ? 700 : 400 }}>{row.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}