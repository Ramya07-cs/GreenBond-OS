export default function StreakTracker({ bond }) {
  const isP = bond.status === "PENALTY";
  const streakTarget = 3;
  const recoveryTarget = 7;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {isP ? (
        <>
          <div style={{
            padding: "10px 14px", background: "var(--red-dim)",
            borderRadius: "var(--r2)", border: "1px solid rgba(255,61,61,.2)",
          }}>
            <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700, letterSpacing: ".08em", marginBottom: 4 }}>
              ⚠ PENALTY STREAK
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: "var(--red)" }}>
              {bond.consecutive_penalty}/{streakTarget} days triggered
            </div>
          </div>

          <div>
            <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 6, textTransform: "uppercase" }}>
              Recovery Progress ({bond.consecutive_compliant}/{recoveryTarget} days)
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {Array.from({ length: recoveryTarget }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 7, borderRadius: 3,
                  background: i < bond.consecutive_compliant
                    ? "var(--cyan)" : "var(--border)",
                  boxShadow: i < bond.consecutive_compliant ? "0 0 8px rgba(0,188,212,.4)" : "none",
                  transition: "all .4s",
                }} />
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 8, lineHeight: 1.6 }}>
              🌿 Need <strong style={{ color: "var(--cyan)" }}>{recoveryTarget - bond.consecutive_compliant} more days</strong> above 75% to restore base rate
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{
            padding: "10px 14px", background: "var(--green-dim)",
            borderRadius: "var(--r2)", border: "1px solid rgba(0,230,118,.2)",
          }}>
            <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 700, letterSpacing: ".08em", marginBottom: 4 }}>
              ✅ COMPLIANT STREAK
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: "var(--green)" }}>
              {bond.consecutive_compliant} days above threshold
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {Array.from({ length: Math.min(bond.consecutive_compliant, 14) || 14 }).map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 7, borderRadius: 3,
                background: i < bond.consecutive_compliant ? "var(--green)" : "var(--border)",
                boxShadow: i < bond.consecutive_compliant ? "0 0 8px var(--green-glow)" : "none",
              }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
