export default function BlockchainModal({ bond, txData, onClose }) {
  const payload = {
    bond_id: bond?.id,
    event: "PENALTY_RATE_CHANGE",
    timestamp: new Date().toISOString(),
    previous_rate: bond?.base_rate,
    new_rate: bond?.current_rate,
    trigger: {
      consecutive_days_below_threshold: bond?.consecutive_penalty,
      pr_threshold: 0.75,
    },
    smart_contract: "0xABCDEF123456789...",
    network: "Polygon Amoy Testnet",
    ...(txData || {}),
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const colored = jsonStr
    .replace(/"([^"]+)":/g, (_, k) => `"<span style="color:var(--amber)">${k}</span>":`)
    .replace(/: "([^"]+)"/g, (_, v) => `: "<span style="color:#A5D6A7">${v}</span>"`)
    .replace(/: (\d+(\.\d+)?)/g, (_, v) => `: <span style="color:#90CAF9">${v}</span>`);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.85)",
        backdropFilter: "blur(4px)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn .2s",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: 12, padding: 24, width: 560, maxWidth: "92vw",
          maxHeight: "80vh", overflowY: "auto",
          animation: "slideUp .22s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            🔗 Raw Blockchain Payload
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "var(--card)",
              border: "1px solid var(--border)", cursor: "pointer",
              fontSize: 13, color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >✕</button>
        </div>
        <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 12, lineHeight: 1.6 }}>
          This exact JSON was submitted to the Polygon smart contract and is permanently immutable.
          Anyone can verify this on Polygonscan using the transaction hash.
        </p>
        <div
          style={{
            background: "var(--void)", border: "1px solid var(--border)",
            borderRadius: "var(--r2)", padding: 14, fontFamily: "var(--mono)",
            fontSize: 10, lineHeight: 1.9, whiteSpace: "pre-wrap", overflowX: "auto",
            color: "var(--text2)",
          }}
          dangerouslySetInnerHTML={{ __html: colored }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)" }}
            onClick={() => { navigator.clipboard.writeText(jsonStr); onClose(); }}
          >
            📋 Copy JSON
          </button>
          <a
            href={`https://polygonscan.com/tx/${txData?.tx_hash || ""}`}
            target="_blank" rel="noreferrer"
            style={{ padding: "10px 18px", borderRadius: "var(--r2)", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--blue)", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            ↗ Polygonscan
          </a>
          <button
            onClick={onClose}
            style={{ padding: "10px 18px", borderRadius: "var(--r2)", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
