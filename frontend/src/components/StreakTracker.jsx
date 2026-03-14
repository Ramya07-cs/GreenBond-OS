export default function StreakTracker({ bond }) {
  const isP = bond.status === "PENALTY";
  // Use values from API if present; fall back to config defaults.
  // These are also re-derived from consecutive counts so the bar
  // always reflects reality even if the field is missing on first render.
  const streakTarget   = bond.penalty_days_threshold  ?? 3;
  const recoveryTarget = bond.recovery_days_threshold ?? 5;
  // Safety: if bond doesn't carry threshold fields yet (stale initialBond),
  // infer streakTarget from the penalty streak itself so bars never mislead.
  const effectiveStreakTarget   = Math.max(streakTarget, bond.consecutive_penalty  ?? 0);
  const effectiveRecoveryTarget = recoveryTarget; // always trust this, 5 is correct

  const penaltyDays   = bond.consecutive_penalty  ?? 0;
  const compliantDays = bond.consecutive_compliant ?? 0;

  const penaltyFill = Math.min(penaltyDays, effectiveStreakTarget);

  const compliantBarLength = isP ? recoveryTarget : Math.max(compliantDays, recoveryTarget);
  const compliantFill      = isP ? Math.min(compliantDays, recoveryTarget) : compliantDays;

  // Badge shows the dominant state:
  // - penalty days > 0 and not yet in PENALTY status → "approaching penalty"
  // - PENALTY status → "penalty active"
  // - compliant with 0 penalty days → just show compliant count (skip if 0)
  const showPenaltyBadge = isP || penaltyDays > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Status badge — only shown when meaningful ── */}
      {(showPenaltyBadge || compliantDays > 0) && (
        <div style={{
          padding: "10px 14px",
          background: isP ? "var(--red-dim)" : penaltyDays > 0 ? "rgba(255,152,0,.08)" : "var(--green-dim)",
          borderRadius: "var(--r2)",
          border: `1px solid ${isP ? "rgba(255,61,61,.2)" : penaltyDays > 0 ? "rgba(255,152,0,.25)" : "rgba(0,230,118,.2)"}`,
        }}>
          <div style={{ fontSize: 10, color: isP ? "var(--red)" : penaltyDays > 0 ? "var(--amber)" : "var(--green)", fontWeight: 700, letterSpacing: ".08em", marginBottom: 4 }}>
            {isP ? "⚠ PENALTY ACTIVE" : penaltyDays > 0 ? "⚠ APPROACHING PENALTY" : "✅ COMPLIANT STREAK"}
          </div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: isP ? "var(--red)" : penaltyDays > 0 ? "var(--amber)" : "var(--green)" }}>
            {isP
              ? compliantDays > 0
                ? `Rate hiked · recovering ${compliantDays}/${recoveryTarget} days`
                : `Rate hiked · needs ${recoveryTarget} compliant days to recover`
              : penaltyDays > 0
                ? `${penaltyDays}/${effectiveStreakTarget} penalty days`
                : `${compliantDays} day${compliantDays !== 1 ? "s" : ""} above threshold`}
          </div>
        </div>
      )}

      {/* ── Penalty streak bar ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", textTransform: "uppercase" }}>🔴 Penalty Streak</div>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: penaltyDays > 0 ? "var(--red)" : "var(--text3)", fontWeight: 700 }}>
            {penaltyDays} / {effectiveStreakTarget}
            <span style={{ color: "var(--text3)", fontWeight: 400, marginLeft: 6 }}>
              {isP ? "· rate hiked" : penaltyDays === 0 ? "· clear" : `· ${effectiveStreakTarget - penaltyDays} more to hike`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: effectiveStreakTarget }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 7, borderRadius: 3,
              background: i < penaltyFill ? "var(--red)" : "var(--border)",
              boxShadow: i < penaltyFill ? "0 0 8px rgba(255,61,61,.4)" : "none",
              transition: "all .4s",
            }} />
          ))}
        </div>
      </div>

      {/* ── Compliant / recovery bar ── */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", textTransform: "uppercase" }}>
            {isP ? "🌿 Recovery Progress" : "✅ Compliant Streak"}
          </div>
          <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: compliantDays > 0 ? (isP ? "var(--cyan)" : "var(--green)") : "var(--text3)", fontWeight: 700 }}>
            {isP ? `${compliantDays} / ${recoveryTarget}` : `${compliantDays} day${compliantDays !== 1 ? "s" : ""}`}
            {isP && (
              <span style={{ color: "var(--text3)", fontWeight: 400, marginLeft: 6 }}>
                · {compliantDays >= recoveryTarget ? "restores next audit" : `${recoveryTarget - compliantDays} more to recover`}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: compliantBarLength }).map((_, i) => {
            const filled = i < compliantFill;
            const color  = isP ? "var(--cyan)" : "var(--green)";
            const glow   = isP ? "rgba(0,188,212,.4)" : "rgba(0,230,118,.35)";
            return (
              <div key={i} style={{
                flex: 1, height: 7, borderRadius: 3,
                background: filled ? color : "var(--border)",
                boxShadow: filled ? `0 0 8px ${glow}` : "none",
                transition: "all .4s",
              }} />
            );
          })}
        </div>
      </div>

    </div>
  );
}