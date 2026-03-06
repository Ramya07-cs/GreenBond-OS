import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchBlockchainStatus, fetchTransaction, triggerAudit } from "../api";
import { useBonds } from "../hooks/useBonds";

const inputStyle = {
  background: "var(--input)", border: "1px solid var(--border)",
  borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)",
  fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%",
};

function StatBox({ label, value, sub, color = "var(--text)" }) {
  return (
    <div style={{ padding: "12px 14px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
      <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "var(--mono)" }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function JsonBlock({ data }) {
  if (!data) return null;
  const jsonStr = JSON.stringify(data, null, 2);
  return (
    <pre style={{
      background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)",
      padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)",
      lineHeight: 1.8, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto",
    }}>
      {jsonStr}
    </pre>
  );
}

export default function BlockchainExplorer() {
  const [tab, setTab] = useState("status");
  const [txHash, setTxHash] = useState("");
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split("T")[0]);
  const [auditResult, setAuditResult] = useState(null);
  const { data: bonds = [] } = useBonds();

  const { data: status, isFetching: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["blockchain-status"],
    queryFn: fetchBlockchainStatus,
    refetchInterval: 15000,
  });

  const txQuery = useQuery({
    queryKey: ["tx", txHash],
    queryFn: () => fetchTransaction(txHash),
    enabled: false,
  });

  const auditMutation = useMutation({
    mutationFn: ({ date }) => triggerAudit(date),
    onSuccess: (data) => setAuditResult({ ok: true, data }),
    onError: (err) => setAuditResult({ ok: false, message: err?.response?.data?.detail || "Audit trigger failed." }),
  });

  const tabs = [["status", "🔗 Network Status"], ["tx", "🔍 TX Lookup"], ["audit", "⚡ Trigger Audit"]];
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: "8px 18px", fontSize: 11, fontWeight: 600, background: "none", border: "none",
            borderBottom: `2px solid ${tab === k ? "var(--blue)" : "transparent"}`,
            color: tab === k ? "var(--blue)" : "var(--text2)", cursor: "pointer",
            transition: "all .2s", marginBottom: -1, letterSpacing: ".04em", fontFamily: "var(--mono)",
          }}>{l}</button>
        ))}
      </div>

      {/* ── Network Status ─────────────────────────────────────────────────── */}
      {tab === "status" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)" }}>
              🔗 Polygon Node Status
            </div>
            <button onClick={() => refetchStatus()} style={{ padding: "6px 14px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 10, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)" }}>
              {statusLoading ? "⏳ Refreshing..." : "↺ Refresh"}
            </button>
          </div>

          {status ? (
            <>
              {/* Connection status banner */}
              <div style={{ padding: "12px 16px", background: status.connected ? "var(--green-dim)" : "var(--red-dim)", border: `1px solid ${status.connected ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`, borderRadius: "var(--r2)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: status.connected ? "var(--green)" : "var(--red)", animation: status.connected ? "pulse 2s infinite" : "none" }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: status.connected ? "var(--green)" : "var(--red)" }}>
                    {status.connected ? "Connected" : "Disconnected"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 1 }}>{status.network}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <StatBox label="Network" value={status.network?.replace("Polygon ", "")} color="var(--blue)" />
                <StatBox label="Chain ID" value={status.chain_id} color="var(--amber)" />
                <StatBox label="Latest Block" value={status.latest_block?.toLocaleString()} color="var(--green)" sub="Polygon Amoy" />
                <StatBox label="Gas Price" value={status.gas_price_gwei ? `${status.gas_price_gwei} Gwei` : "—"} color="var(--cyan)" />
                <StatBox label="Explorer" value="Amoy Polygonscan" color="var(--text2)" sub="amoy.polygonscan.com" />
                <StatBox label="Auto-refresh" value="15s" color="var(--text3)" sub="Live polling active" />
              </div>

              {/* Raw JSON */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 10 }}>📋 Raw Response</div>
                <JsonBlock data={status} />
              </div>

              <a href="https://amoy.polygonscan.com" target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--blue)", fontSize: 11, borderRadius: "var(--r2)", textDecoration: "none", fontFamily: "var(--mono)", fontWeight: 600, alignSelf: "flex-start" }}>
                ↗ Open Amoy Polygonscan
              </a>
            </>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
              {statusLoading ? "⏳ Connecting to Polygon node..." : "Unable to fetch status."}
            </div>
          )}
        </div>
      )}

      {/* ── TX Lookup ─────────────────────────────────────────────────────── */}
      {tab === "tx" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🔍 Transaction Lookup</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Enter tx hash: 0x..."
                value={txHash}
                onChange={e => setTxHash(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={() => txQuery.refetch()}
                disabled={!txHash.trim() || txQuery.isFetching}
                style={{ padding: "9px 18px", background: "var(--blue)", border: "none", color: "#fff", fontWeight: 700, fontSize: 11, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)", opacity: !txHash.trim() ? .4 : 1, whiteSpace: "nowrap" }}
              >
                {txQuery.isFetching ? "⏳ Looking up..." : "🔍 Fetch TX"}
              </button>
            </div>
            {txHash && (
              <div style={{ marginTop: 10 }}>
                <a href={`https://amoy.polygonscan.com/tx/${txHash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", textDecoration: "none" }}>
                  ↗ View on Polygonscan: {txHash.slice(0, 20)}...
                </a>
              </div>
            )}
          </div>

          {txQuery.isError && (
            <div style={{ padding: "10px 14px", background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.2)", borderRadius: "var(--r2)", fontSize: 11, color: "var(--red)" }}>
              ❌ Transaction not found or node unavailable.
            </div>
          )}

          {txQuery.data && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--green)", marginBottom: 12 }}>✅ Transaction Found</div>

              {/* Key fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  ["Block Number", txQuery.data.blockNumber],
                  ["Gas Used", txQuery.data.gas],
                  ["From", txQuery.data.from ? txQuery.data.from.slice(0, 16) + "..." : "—"],
                  ["To", txQuery.data.to ? txQuery.data.to.slice(0, 16) + "..." : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: "8px 12px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                    <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
                    <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)", marginTop: 2 }}>{v ?? "—"}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text2)", marginBottom: 8 }}>Full Response</div>
              <JsonBlock data={txQuery.data} />

              <a href={`https://amoy.polygonscan.com/tx/${txHash}`} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, padding: "9px 16px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--blue)", fontSize: 11, borderRadius: "var(--r2)", textDecoration: "none", fontFamily: "var(--mono)", fontWeight: 600 }}>
                ↗ Open on Polygonscan
              </a>
            </div>
          )}

          {/* Recent bond transactions */}
          {bonds.length > 0 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>📑 Bond TX References</div>
              <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 10 }}>Click a hash to look it up above.</div>
              {bonds.filter(b => b.last_tx_hash).length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text3)", padding: "12px 0" }}>No on-chain transactions recorded yet. Blockchain writes activate once CONTRACT_ADDRESS is set.</div>
              ) : bonds.filter(b => b.last_tx_hash).map(b => (
                <div key={b.id} onClick={() => setTxHash(b.last_tx_hash)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", marginBottom: 6, cursor: "pointer" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text)" }}>{b.name}</div>
                    <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 2 }}>{b.last_tx_hash?.slice(0, 30)}...</div>
                  </div>
                  <span style={{ fontSize: 9, color: "var(--blue)", fontFamily: "var(--mono)" }}>USE ↑</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Trigger Audit ─────────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--amber-dim)", border: "1px solid rgba(255,179,0,.25)", borderRadius: "var(--r2)", fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
            ⚡ <strong style={{ color: "var(--amber)" }}>Manual Audit:</strong> Triggers the daily audit task immediately for a specific date.
            The audit fetches NASA GHI data, calculates PR, and writes penalty/recovery events to the Polygon blockchain.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Audit form */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>⚡ Trigger Audit</div>

              {auditResult ? (
                <div style={{ padding: 16, background: auditResult.ok ? "var(--green-dim)" : "var(--red-dim)", border: `1px solid ${auditResult.ok ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`, borderRadius: "var(--r2)" }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>{auditResult.ok ? "✅" : "❌"}</div>
                  <div style={{ color: auditResult.ok ? "var(--green)" : "var(--red)", fontWeight: 700, marginBottom: 8 }}>
                    {auditResult.ok ? "Audit Queued!" : "Audit Failed"}
                  </div>
                  {auditResult.ok && <JsonBlock data={auditResult.data} />}
                  {!auditResult.ok && <div style={{ fontSize: 11, color: "var(--text2)" }}>{auditResult.message}</div>}
                  <button onClick={() => setAuditResult(null)} style={{ marginTop: 12, padding: "7px 14px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)" }}>
                    Run Another
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", fontWeight: 600, marginBottom: 5 }}>Target Date</div>
                    <input type="date" value={auditDate} max={today}
                      onChange={e => setAuditDate(e.target.value)} style={inputStyle} />
                    <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 4 }}>
                      Audits all active bonds for the selected date. Defaults to today.
                    </div>
                  </div>

                  <div style={{ padding: "10px 12px", background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                    <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>What this does</div>
                    {["Fetches NASA POWER GHI for each bond's lat/lng", "Computes Performance Ratio = actual_kwh / expected_kwh", "Applies COMPLIANT / PENALTY verdict", "Triggers blockchain event if threshold crossed", "Updates current_rate on the bond"].map((s, i) => (
                      <div key={i} style={{ fontSize: 10, color: "var(--text2)", marginBottom: 4, display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--green)" }}>→</span> {s}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => auditMutation.mutate({ date: auditDate })}
                    disabled={auditMutation.isPending}
                    style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--amber)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)", transition: "opacity .2s" }}
                  >
                    {auditMutation.isPending ? "⏳ Queuing Audit..." : `⚡ Run Audit for ${auditDate}`}
                  </button>
                </div>
              )}
            </div>

            {/* Bonds audit status */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>📊 Bond Audit Snapshot</div>
              {bonds.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No bonds registered.</div>
              ) : bonds.map(b => (
                <div key={b.id} style={{ padding: "10px 12px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: b.status === "ACTIVE" ? "var(--green-dim)" : "var(--red-dim)", color: b.status === "ACTIVE" ? "var(--green)" : "var(--red)", fontFamily: "var(--mono)", fontWeight: 700 }}>
                      {b.status}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {[
                      ["PR Today", b.today_pr != null ? `${(b.today_pr * 100).toFixed(1)}%` : "—"],
                      ["Rate", `${Number(b.current_rate).toFixed(2)}%`],
                      ["Penalty Days", b.consecutive_penalty ?? 0],
                    ].map(([k, v]) => (
                      <div key={k} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "5px 8px" }}>
                        <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase" }}>{k}</div>
                        <div style={{ fontSize: 11, color: "var(--text)", fontFamily: "var(--mono)", fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}