import { useQuery } from "@tanstack/react-query";
import { fetchBlockchainStatus } from "../api";

export default function BlockchainModal({ bond, txData, onClose }) {
  const { data: chainStatus } = useQuery({
    queryKey: ["blockchain-status"],
    queryFn: fetchBlockchainStatus,
    staleTime: 30000,
  });

  const contractAddress = chainStatus?.contract_address || txData?.contract_address || null;
  const contractConfigured = chainStatus?.contract_configured ?? !!contractAddress;

  const payload = {
    bond_id: bond?.id,
    event: txData?.event_type || "PENALTY_RATE_CHANGE",
    timestamp: txData?.created_at || new Date().toISOString(),
    previous_rate: bond?.base_rate,
    new_rate: bond?.current_rate,
    trigger: {
      consecutive_days_below_threshold: bond?.consecutive_penalty,
      pr_threshold: 0.75,
      calculated_pr: txData?.calculated_pr,
    },
    smart_contract: contractAddress || "Not configured",
    network: txData?.network || "Polygon Amoy Testnet",
    block_number: txData?.block_number,
    gas_used: txData?.gas_used,
    tx_hash: txData?.blockchain_tx_hash,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const colored = jsonStr
    .replace(/"([^"]+)":/g, (_, k) => `"<span style="color:var(--amber)">${k}</span>":`)
    .replace(/: "([^"]+)"/g, (_, v) => `: "<span style="color:#A5D6A7">${v}</span>"`)
    .replace(/: (\d+(\.\d+)?)/g, (_, v) => `: <span style="color:#90CAF9">${v}</span>`)
    .replace(/: (null)/g, `<span style="color:var(--slate)">: null</span>`);

  const explorerUrl = txData?.blockchain_tx_hash
    ? `https://amoy.polygonscan.com/tx/${txData.blockchain_tx_hash}`
    : contractAddress
      ? `https://amoy.polygonscan.com/address/${contractAddress}`
      : "https://amoy.polygonscan.com";

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border2)", borderRadius: 12, padding: 24, width: 580, maxWidth: "92vw", maxHeight: "80vh", overflowY: "auto", animation: "slideUp .22s" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            🔗 Raw Blockchain Payload
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 13, color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Contract status banner */}
        <div style={{ padding: "8px 12px", borderRadius: "var(--r2)", marginBottom: 12, background: contractConfigured ? "var(--green-dim)" : "var(--amber-dim)", border: `1px solid ${contractConfigured ? "rgba(0,230,118,.2)" : "rgba(255,179,0,.2)"}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: contractConfigured ? "var(--green)" : "var(--amber)", flexShrink: 0 }} />
          <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)" }}>
            {contractConfigured
              ? <><span style={{ color: "var(--green)", fontWeight: 700 }}>Contract configured</span> · {contractAddress?.slice(0, 12)}...{contractAddress?.slice(-6)}</>
              : <><span style={{ color: "var(--amber)", fontWeight: 700 }}>No contract address set</span> · blockchain writes disabled</>
            }
          </div>
        </div>

        <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 12, lineHeight: 1.6 }}>
          This JSON payload is written to the Polygon Amoy Testnet smart contract on every penalty or recovery event.
          {txData?.blockchain_tx_hash
            ? " The transaction is confirmed and permanently immutable."
            : contractConfigured
              ? " Contract is configured — blockchain writes are active."
              : " Blockchain writes activate once CONTRACT_ADDRESS and WALLET_PRIVATE_KEY are set in .env."}
        </p>

        <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: 14, fontFamily: "var(--mono)", fontSize: 10, lineHeight: 1.9, whiteSpace: "pre-wrap", overflowX: "auto", color: "var(--text2)" }}
          dangerouslySetInnerHTML={{ __html: colored }} />

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)" }}
            onClick={() => { navigator.clipboard.writeText(jsonStr); onClose(); }}>
            📋 Copy JSON
          </button>
          <a href={explorerUrl} target="_blank" rel="noreferrer"
            style={{ padding: "10px 18px", borderRadius: "var(--r2)", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--blue)", fontSize: 12, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            ↗ {txData?.blockchain_tx_hash ? "View TX" : "Amoy Explorer"}
          </a>
          <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: "var(--r2)", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--mono)" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}