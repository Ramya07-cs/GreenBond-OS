import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchBlockchainStatus, triggerAudit, registerBondOnChain, setRegistrationTx } from "../api";
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
  return (
    <pre style={{
      background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)",
      padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)",
      lineHeight: 1.8, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto",
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ── Bond On-Chain Registration Panel ─────────────────────────────────────────
function RegisterPanel({ bonds }) {
  const queryClient = useQueryClient();
  // session = ephemeral loading/error state for this tab visit
  // Persistent "registered" truth comes from bond.registered_on_chain (DB-backed via API)
  const [session, setSession] = useState({});

  const setS = (bondId, patch) =>
    setSession(prev => ({ ...prev, [bondId]: { ...(prev[bondId] || {}), ...patch } }));

  async function handleRegister(bond) {
    setS(bond.id, { loading: true, error: null });
    try {
      const data = await registerBondOnChain(bond.id);
      setS(bond.id, { loading: false, freshData: data });
      // Refetch bonds list — bond.registered_on_chain will now be true from DB
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Registration failed — check RPC / wallet config.";
      setS(bond.id, { loading: false, error: msg });
    }
  }

  // Backfill state: { [bondId]: { txInput, blockInput, loading, error, done } }
  const [backfill, setBackfill] = useState({});
  const setB = (bondId, patch) =>
    setBackfill(prev => ({ ...prev, [bondId]: { ...(prev[bondId] || {}), ...patch } }));

  async function handleBackfill(bond) {
    const b = backfill[bond.id] || {};
    if (!b.txInput?.trim()) return;
    setB(bond.id, { loading: true, error: null });
    try {
      await setRegistrationTx(bond.id, b.txInput.trim(), b.blockInput ? parseInt(b.blockInput) : null);
      setB(bond.id, { loading: false, done: true });
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
    } catch (err) {
      setB(bond.id, { loading: false, error: err?.response?.data?.detail || "Failed to save TX hash." });
    }
  }

  const activeBonds = bonds.filter(b => b.status !== "MATURED");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Explainer banner */}
      <div style={{
        padding: "14px 16px",
        background: "rgba(255,179,0,.07)",
        border: "1px solid rgba(255,179,0,.25)",
        borderRadius: "var(--r2)",
        fontSize: 11,
        color: "var(--text2)",
        lineHeight: 1.8,
      }}>
        <div style={{ fontWeight: 700, color: "var(--amber)", marginBottom: 6, fontSize: 12 }}>
          🔗 Why register bonds on-chain?
        </div>
        Bonds created before the blockchain integration was live are not yet known to the smart contract.
        Without registration, any penalty trigger will revert with{" "}
        <span style={{ color: "var(--red)", fontFamily: "var(--mono)", fontSize: 10 }}>"bond not registered"</span>
        {" "}— the rate change is still saved in PostgreSQL but <strong>without a TX hash</strong>.
        Register each bond once to wire everything up end-to-end.
      </div>


      {/* Per-bond rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {activeBonds.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>
            No active bonds found.
          </div>
        )}
        {activeBonds.map(bond => {
          const s = session[bond.id] || {};
          // Registered = DB says so (persists across reloads) OR just succeeded in this session
          const isRegistered = bond.registered_on_chain || !!s.freshData;
          const isLoading = !!s.loading;
          const hasError = !!s.error;
          const borderColor = isRegistered
            ? "rgba(0,230,118,.25)"
            : hasError
            ? "rgba(255,61,61,.25)"
            : "var(--border)";

          return (
            <div key={bond.id} style={{
              background: "var(--card)",
              border: `1px solid ${borderColor}`,
              borderRadius: "var(--r)",
              padding: 16,
              transition: "border-color .3s",
            }}>
              {/* Bond header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{bond.name}</div>
                  <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 3 }}>
                    {bond.id} &middot; Base rate {bond.base_rate}% &middot; {(bond.capacity_kw / 1000).toFixed(1)} MW
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {isRegistered && (
                    <div style={{
                      fontSize: 9, padding: "3px 9px", borderRadius: 100,
                      background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.25)",
                      color: "var(--green)", fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".06em",
                    }}>
                      ✓ REGISTERED
                    </div>
                  )}
                  {hasError && !isRegistered && (
                    <div style={{
                      fontSize: 9, padding: "3px 9px", borderRadius: 100,
                      background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.25)",
                      color: "var(--red)", fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: ".06em",
                    }}>
                      ✗ FAILED
                    </div>
                  )}

                  {!isRegistered && (
                    <button
                      onClick={() => handleRegister(bond)}
                      disabled={isLoading}
                      style={{
                        padding: "8px 18px",
                        background: hasError ? "transparent" : "var(--green)",
                        border: hasError ? "1px solid rgba(255,61,61,.4)" : "none",
                        color: hasError ? "var(--red)" : "#000",
                        fontWeight: 700,
                        fontSize: 11,
                        borderRadius: "var(--r2)",
                        cursor: isLoading ? "not-allowed" : "pointer",
                        fontFamily: "var(--mono)",
                        opacity: isLoading ? 0.6 : 1,
                        transition: "opacity .2s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isLoading
                        ? "⏳ Registering..."
                        : hasError
                        ? "↺ Retry"
                        : "🔗 Register On-Chain"}
                    </button>
                  )}
                </div>
              </div>

              {/* Registered + has TX hash → show proof */}
              {isRegistered && (s.freshData?.tx_hash || bond.registration_tx_hash) && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                    {[
                      ["TX Hash", (s.freshData?.tx_hash || bond.registration_tx_hash)?.slice(0, 18) + "…"],
                      ["Block", (s.freshData?.block_number || bond.registration_block)?.toLocaleString() ?? "—"],
                      ["Status", s.freshData?.status ?? "CONFIRMED"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ padding: "8px 10px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                        <div style={{ fontSize: 8, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>{k}</div>
                        <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)", fontWeight: 600 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <a
                    href={`https://amoy.polygonscan.com/tx/${s.freshData?.tx_hash || bond.registration_tx_hash}`}
                    target="_blank" rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--blue)", fontFamily: "var(--mono)", textDecoration: "none" }}
                  >
                    ↗ View on Polygonscan
                  </a>
                </div>
              )}

              {/* Registered via old curl but no TX hash stored yet → show backfill form */}
              {isRegistered && !s.freshData?.tx_hash && !bond.registration_tx_hash && (() => {
                const bf = backfill[bond.id] || {};
                return bf.done ? (
                  <div style={{ marginTop: 12, fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)" }}>
                    ✓ TX hash saved — refresh to see it
                  </div>
                ) : (
                  <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(255,179,0,.06)", border: "1px solid rgba(255,179,0,.2)", borderRadius: "var(--r2)" }}>
                    <div style={{ fontSize: 9, color: "var(--amber)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
                      ⚠ Registered before TX logging was live — paste your TX hash from Polygonscan
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input
                        placeholder="TX hash  0x649db320..."
                        value={bf.txInput || ""}
                        onChange={e => setB(bond.id, { txInput: e.target.value })}
                        style={{ flex: 2, background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "7px 10px", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10, outline: "none" }}
                      />
                      <input
                        placeholder="Block #  e.g. 34870357"
                        value={bf.blockInput || ""}
                        onChange={e => setB(bond.id, { blockInput: e.target.value })}
                        style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "7px 10px", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10, outline: "none" }}
                      />
                      <button
                        onClick={() => handleBackfill(bond)}
                        disabled={!bf.txInput?.trim() || bf.loading}
                        style={{ padding: "7px 14px", background: "var(--amber)", border: "none", color: "#000", fontWeight: 700, fontSize: 10, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)", opacity: !bf.txInput?.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}
                      >
                        {bf.loading ? "⏳ Saving..." : "💾 Save"}
                      </button>
                    </div>
                    {bf.error && <div style={{ fontSize: 9, color: "var(--red)", fontFamily: "var(--mono)" }}>{bf.error}</div>}
                    <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 4 }}>
                      Find your TX hashes at{" "}
                      <a href="https://amoy.polygonscan.com" target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>amoy.polygonscan.com</a>
                      {" "}→ search your wallet address → Transactions
                    </div>
                  </div>
                );
              })()}

              {/* Error message */}
              {hasError && !isRegistered && (
                <div style={{ marginTop: 10, fontSize: 10, color: "var(--red)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
                  {s.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Register all button */}
      {activeBonds.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => {
              activeBonds.forEach(b => {
                const s = session[b.id] || {};
                const alreadyDone = b.registered_on_chain || !!s.freshData;
                if (!alreadyDone && !s.loading) handleRegister(b);
              });
            }}
            disabled={activeBonds.every(b => {
              const s = session[b.id] || {};
              return b.registered_on_chain || !!s.freshData || !!s.loading;
            })}
            style={{
              padding: "9px 22px",
              background: "var(--blue)",
              border: "none",
              color: "#fff",
              fontWeight: 700,
              fontSize: 11,
              borderRadius: "var(--r2)",
              cursor: "pointer",
              fontFamily: "var(--mono)",
              opacity: activeBonds.every(b => {
                const s = session[b.id] || {};
                return b.registered_on_chain || !!s.freshData || !!s.loading;
              }) ? 0.4 : 1,
            }}
          >
            🔗 Register All Unregistered Bonds
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BlockchainExplorer() {
  const [tab, setTab] = useState("status");
  const queryClient = useQueryClient();
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split("T")[0]);
  const [auditResult, setAuditResult] = useState(null);
  const { data: bonds = [] } = useBonds();

  const { data: status, isFetching: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ["blockchain-status"],
    queryFn: fetchBlockchainStatus,
    refetchInterval: 15000,
  });

  const auditMutation = useMutation({
    mutationFn: ({ date }) => triggerAudit(date),
    onSuccess: (data) => {
      setAuditResult({ ok: true, data });
      // Refetch bonds after a short delay so PR Today + snapshot update when audit completes
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["bonds"] }), 3000);
    },
    onError: (err) => setAuditResult({ ok: false, message: err?.response?.data?.detail || "Audit trigger failed." }),
  });

  const tabs = [
    ["status",   "🔗 Network Status"],
    ["register", "📋 Register Bonds"],
    ["audit",    "⚡ Trigger Audit"],
  ];
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

      {/* ── Network Status ───────────────────────────────────────────── */}
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
              <div style={{ padding: "12px 16px", background: status.connected ? "var(--green-dim)" : "var(--red-dim)", border: `1px solid ${status.connected ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`, borderRadius: "var(--r2)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: status.connected ? "var(--green)" : "var(--red)", animation: status.connected ? "pulse 2s infinite" : "none" }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: status.connected ? "var(--green)" : "var(--red)" }}>
                    {status.connected ? "Connected" : "Disconnected"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 1 }}>{status.network}</div>
                </div>
              </div>

              {/* Low balance warning banner */}
              {status.balance_low && (
                <div style={{ padding: "12px 16px", background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.3)", borderRadius: "var(--r2)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🚨</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 3 }}>
                      WALLET LOW — {status.wallet_balance_matic} MATIC remaining
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>
                      Below the {status.balance_threshold_matic} MATIC threshold. Top up your wallet before the next penalty trigger —
                      blockchain writes will fail with "insufficient funds" if balance reaches zero.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <StatBox label="Network" value={status.network?.replace("Polygon ", "")} color="var(--blue)" />
                <StatBox label="Chain ID" value={status.chain_id} color="var(--amber)" />
                <StatBox label="Latest Block" value={status.latest_block?.toLocaleString()} color="var(--green)" sub="Polygon Amoy" />
                <StatBox label="Gas Price" value={status.gas_price_gwei ? `${status.gas_price_gwei} Gwei` : "—"} color="var(--cyan)" />
                <StatBox
                  label="Wallet Balance"
                  value={status.wallet_balance_matic != null ? `${status.wallet_balance_matic} MATIC` : "—"}
                  color={status.balance_low ? "var(--red)" : "var(--green)"}
                  sub={status.balance_low ? "⚠ LOW — top up soon" : `Threshold: ${status.balance_threshold_matic} MATIC`}
                />
                <StatBox label="Auto-refresh" value="15s" color="var(--text3)" sub="Live polling active" />
              </div>

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

      {/* ── Register Bonds ───────────────────────────────────────────── */}
      {tab === "register" && <RegisterPanel bonds={bonds} />}

      {/* ── Trigger Audit ────────────────────────────────────────────── */}
      {tab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--amber-dim)", border: "1px solid rgba(255,179,0,.25)", borderRadius: "var(--r2)", fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
            ⚡ <strong style={{ color: "var(--amber)" }}>Manual Audit:</strong> Triggers the daily audit task immediately for a specific date.
            The audit fetches NASA GHI data, calculates PR, and writes penalty/recovery events to the Polygon blockchain.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                    {[
                      "Fetches NASA POWER GHI for each bond's lat/lng",
                      "Computes Performance Ratio = actual_kwh / expected_kwh",
                      "Applies COMPLIANT / PENALTY verdict",
                      "Triggers blockchain event if threshold crossed",
                      "Updates current_rate on the bond",
                    ].map((s, i) => (
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