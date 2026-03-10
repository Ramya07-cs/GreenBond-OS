import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBond, deleteBond, fixBondRegistration } from "../api";
import { useBonds } from "../hooks/useBonds";

const inputStyle = {
  background: "var(--input)", border: "1px solid var(--border)",
  borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)",
  fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%",
};

function Field({ n, label, hint, children }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.3)",
        color: "var(--green)", fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 2,
      }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", fontWeight: 600, marginBottom: 5 }}>{label}</div>
        {children}
        {hint && <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}

const INITIAL = {
  id: "", name: "", capacity_kw: "", lat: "", lng: "",
  base_rate: "", tvl: "", maturity_date: "", issuer_email: "", issuer_phone: "",
};

export default function BondRegistration() {
  const [form, setForm] = useState(INITIAL);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("register"); // "register" | "manage"
  const { data: bonds = [] } = useBonds();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(null); // bond.id
  const [deleteStatus, setDeleteStatus] = useState({});
  const [fixState, setFixState] = useState({}); // { [bondId]: { open, tx, block, loading, done, error } }

  async function handleDelete(bondId) {
    setDeleteStatus(s => ({ ...s, [bondId]: "loading" }));
    try {
      await deleteBond(bondId);
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      setDeleteStatus(s => ({ ...s, [bondId]: "done" }));
      setDeleteConfirm(null);
    } catch (err) {
      setDeleteStatus(s => ({ ...s, [bondId]: "error" }));
    }
  }

  async function handleFixReg(bond) {
    const f = fixState[bond.id] || {};
    if (!f.tx?.trim()) return;
    setFixState(s => ({ ...s, [bond.id]: { ...f, loading: true, error: null } }));
    try {
      await fixBondRegistration(bond.id, f.tx.trim(), f.block ? parseInt(f.block) : null);
      queryClient.invalidateQueries({ queryKey: ["bonds"] });
      setFixState(s => ({ ...s, [bond.id]: { ...f, loading: false, done: true } }));
    } catch (err) {
      setFixState(s => ({ ...s, [bond.id]: { ...f, loading: false, error: "Failed to update registration." } }));
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: createBond,
    onSuccess: (data) => setResult({ ok: true, bond: data, warning: data.blockchain_warning || null }),
    onError: (err) => setResult({ ok: false, message: err?.response?.data?.detail || "Registration failed. Check console." }),
  });

  const handleSubmit = () => {
    if (!form.id || !form.name || !form.capacity_kw || !form.lat || !form.lng || !form.base_rate) return;
    mutation.mutate({
      id: form.id.trim().toUpperCase(),
      name: form.name.trim(),
      capacity_kw: parseFloat(form.capacity_kw),
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      base_rate: parseFloat(form.base_rate),
      tvl: form.tvl ? parseInt(form.tvl) : 0,
      maturity_date: form.maturity_date || null,
      issuer_email: form.issuer_email || null,
      issuer_phone: form.issuer_phone || null,
    });
  };

  const isValid = form.id && form.name && form.capacity_kw && form.lat && form.lng && form.base_rate;

  if (result?.ok) {
    const b = result.bond;
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={{ padding: 24, background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.25)", borderRadius: "var(--r)", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>🎉</div>
          <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Bond Registered!</div>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 16 }}>
            {b.name} is now active on the platform and ready to accept production data.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[["Bond ID", b.id], ["Status", b.status], ["Capacity", `${b.capacity_kw} kW`], ["Base Rate", `${Number(b.base_rate).toFixed(2)}%`]].map(([k, v]) => (
              <div key={k} style={{ padding: "8px 12px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", textAlign: "left" }}>
                <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</div>
                <div style={{ fontSize: 12, color: "var(--green)", fontFamily: "var(--mono)", fontWeight: 600, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r2)", marginBottom: 16, textAlign: "left" }}>
            <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>IoT Push Endpoint (Ready Now)</div>
            <pre style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
{`POST /api/production/iot
{ "bond_id": "${b.id}", "device_id": "...", "date": "YYYY-MM-DD", "kwh": 0.0 }`}
            </pre>
          </div>
          {result?.warning && (
            <div style={{ margin: "0 0 14px", padding: "10px 14px", background: "rgba(255,179,0,.08)", border: "1px solid rgba(255,179,0,.3)", borderRadius: "var(--r2)", textAlign: "left" }}>
              <div style={{ fontSize: 10, color: "var(--amber)", fontWeight: 700, marginBottom: 4 }}>⚠ Blockchain Registration Failed</div>
              <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "var(--mono)", marginBottom: 6 }}>{result.warning}</div>
              <div style={{ fontSize: 9, color: "var(--text3)" }}>Bond saved to DB. Daily audits will fail until registered. Go to <strong>Manage Bonds → Fix Registration</strong> to resolve.</div>
            </div>
          )}
          <button onClick={() => { setResult(null); setForm(INITIAL); }}
            style={{ padding: "9px 20px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)" }}>
            Register Another Bond
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {[["register", "🌿 Register Bond"], ["manage", "⚙ Manage Bonds"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "9px 20px", background: "none", border: "none",
            borderBottom: tab === id ? "2px solid var(--green)" : "2px solid transparent",
            color: tab === id ? "var(--green)" : "var(--text3)",
            fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "var(--mono)",
            letterSpacing: ".06em", transition: "color .2s",
          }}>{label}</button>
        ))}
      </div>

      {tab === "manage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bonds.length === 0 && <div style={{ color: "var(--text3)", fontSize: 12, padding: 24, textAlign: "center" }}>No bonds found.</div>}
          {bonds.map(bond => {
            const isConfirm = deleteConfirm === bond.id;
            const dStatus = deleteStatus[bond.id];
            const f = fixState[bond.id] || {};
            return (
              <div key={bond.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{bond.name}</div>
                    <div style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)", marginTop: 3 }}>
                      {bond.id} · {bond.capacity_kw} kW · {bond.base_rate}% · {bond.status}
                    </div>
                    {isConfirm && (
                      <div style={{ fontSize: 9, color: "var(--amber)", fontFamily: "var(--mono)", marginTop: 4, lineHeight: 1.6 }}>
                        ⚠ This removes all DB records and cache but the bond ID stays permanently on the blockchain — it cannot be reused for a new bond.
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setFixState(s => ({ ...s, [bond.id]: { ...f, open: !f.open } }))}
                      style={{ padding: "5px 12px", background: "var(--card2)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)" }}>
                      🔧 Fix Registration
                    </button>
                    {!isConfirm ? (
                      <button onClick={() => setDeleteConfirm(bond.id)}
                        style={{ padding: "5px 12px", background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.3)", color: "var(--red)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                        🗑 Delete
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "var(--red)", fontFamily: "var(--mono)" }}>Delete all data?</span>
                        <button onClick={() => handleDelete(bond.id)} disabled={dStatus === "loading"}
                          style={{ padding: "5px 10px", background: "var(--red)", border: "none", color: "#fff", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>
                          {dStatus === "loading" ? "..." : "Yes, Delete"}
                        </button>
                        <button onClick={() => setDeleteConfirm(null)}
                          style={{ padding: "5px 10px", background: "var(--card2)", border: "1px solid var(--border)", color: "var(--text2)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)" }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fix registration panel */}
                {f.open && (
                  <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(255,179,0,.06)", border: "1px solid rgba(255,179,0,.2)", borderRadius: "var(--r2)" }}>
                    <div style={{ fontSize: 9, color: "var(--amber)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Fix On-Chain Registration</div>
                    {f.done ? (
                      <div style={{ fontSize: 10, color: "var(--green)", fontFamily: "var(--mono)" }}>✓ Saved successfully</div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input placeholder="0x TX hash" value={f.tx || ""} onChange={e => setFixState(s => ({ ...s, [bond.id]: { ...f, tx: e.target.value } }))}
                          style={{ flex: 2, minWidth: 180, padding: "7px 10px", background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10, outline: "none" }} />
                        <input placeholder="Block number" value={f.block || ""} onChange={e => setFixState(s => ({ ...s, [bond.id]: { ...f, block: e.target.value } }))}
                          style={{ flex: 1, minWidth: 120, padding: "7px 10px", background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 10, outline: "none" }} />
                        <button onClick={() => handleFixReg(bond)} disabled={!f.tx?.trim() || f.loading}
                          style={{ padding: "7px 14px", background: "var(--amber)", border: "none", color: "#000", fontWeight: 700, fontSize: 10, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)", opacity: !f.tx?.trim() ? 0.4 : 1 }}>
                          {f.loading ? "..." : "💾 Save"}
                        </button>
                        {f.error && <div style={{ width: "100%", fontSize: 9, color: "var(--red)", fontFamily: "var(--mono)" }}>{f.error}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "register" &&
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
      {/* Form */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 20 }}>🌿 Register New Green Bond</div>

        {result?.ok === false && (
          <div style={{ padding: "10px 14px", background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.2)", borderRadius: "var(--r2)", marginBottom: 16, fontSize: 11, color: "var(--red)" }}>
            ❌ {result.message}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Section: Identity */}
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--text3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
            Identity
          </div>

          <Field n={1} label="Bond ID" hint="Unique identifier, e.g. GB-2025-001. Auto-uppercased.">
            <input type="text" placeholder="GB-2025-001" value={form.id} onChange={set("id")} style={inputStyle} />
          </Field>

          <Field n={2} label="Bond Name" hint="Human-readable name of the asset or project.">
            <input type="text" placeholder="Solar Farm Alpha" value={form.name} onChange={set("name")} style={inputStyle} />
          </Field>

          {/* Section: Technical */}
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--text3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginTop: 4 }}>
            Technical Parameters
          </div>

          <Field n={3} label="Installed Capacity (kW)" hint="Peak DC/AC nameplate capacity in kilowatts.">
            <input type="number" placeholder="e.g. 5000" value={form.capacity_kw} onChange={set("capacity_kw")} style={inputStyle} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field n={4} label="Latitude" hint="WGS84 decimal degrees">
              <input type="number" step="0.0001" placeholder="e.g. 20.5937" value={form.lat} onChange={set("lat")} style={inputStyle} />
            </Field>
            <Field n={5} label="Longitude" hint="WGS84 decimal degrees">
              <input type="number" step="0.0001" placeholder="e.g. 78.9629" value={form.lng} onChange={set("lng")} style={inputStyle} />
            </Field>
          </div>

          {/* Section: Financial */}
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--text3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginTop: 4 }}>
            Financial Terms
          </div>

          <Field n={6} label="Base Interest Rate (%)" hint="Annual coupon rate. Penalty events may reduce this.">
            <input type="number" step="0.01" placeholder="e.g. 8.50" value={form.base_rate} onChange={set("base_rate")} style={inputStyle} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field n={7} label="Total Value Locked (₹)" hint="Optional. TVL in rupees.">
              <input type="number" placeholder="e.g. 10000000" value={form.tvl} onChange={set("tvl")} style={inputStyle} />
            </Field>
            <Field n={8} label="Maturity Date" hint="Optional. The date this bond expires and investors are repaid principal.">
              <input type="date" value={form.maturity_date} min={new Date().toISOString().split("T")[0]} onChange={set("maturity_date")} style={inputStyle} />
            </Field>
          </div>

          {/* Section: Contact */}
          <div style={{ fontSize: 9, letterSpacing: ".12em", color: "var(--text3)", textTransform: "uppercase", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginTop: 4 }}>
            Issuer Contact (Optional)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field n={9} label="Issuer Email">
              <input type="email" placeholder="ops@example.com" value={form.issuer_email} onChange={set("issuer_email")} style={inputStyle} />
            </Field>
            <Field n={10} label="Issuer Phone">
              <input type="tel" placeholder="+91-..." value={form.issuer_phone} onChange={set("issuer_phone")} style={inputStyle} />
            </Field>
          </div>

          <button onClick={handleSubmit} disabled={mutation.isPending || !isValid}
            style={{ padding: "11px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)", opacity: !isValid ? .4 : 1, transition: "opacity .2s", marginTop: 4 }}>
            {mutation.isPending ? "⏳ Registering..." : "🌿 Register Bond"}
          </button>
        </div>
      </div>

      {/* Side info panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Required fields */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>📋 Required Fields</div>
          {[
            ["Bond ID", "Unique, immutable after creation"],
            ["Bond Name", "Display label across the dashboard"],
            ["Capacity (kW)", "Used by NASA GHI audit for PR calculation"],
            ["Lat / Lng", "Pinpoints the asset for satellite data"],
            ["Base Rate (%)", "Starting coupon — adjusts on penalty events"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 10, paddingBottom: 8, marginBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>{k}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{v}</div>
              </div>
            </div>
          ))}
        </div>

        {/* What happens next */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>⚡ What Happens Next</div>
          {[
            ["Bond activates immediately", "Status set to ACTIVE; IoT endpoint live."],
            ["Daily audit begins", "NASA POWER API fetches GHI for your coordinates."],
            ["Performance Ratio tracked", "PR = actual_kwh / expected_kwh from irradiance."],
            ["Blockchain events fire", "On penalty or recovery, Polygon tx is written."],
          ].map(([title, desc], i) => (
            <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: i < 3 ? "1px solid var(--border)" : "none" }}>
              <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700, fontFamily: "var(--mono)", flexShrink: 0, minWidth: 16 }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text)", fontWeight: 600 }}>{title}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        {(form.id || form.name) && (
          <div style={{ background: "var(--card)", border: "1px solid rgba(0,230,118,.15)", borderRadius: "var(--r)", padding: 16, animation: "fadeIn .2s" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--green)", marginBottom: 12 }}>👁 Live Preview</div>
            <pre style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text2)", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>
{JSON.stringify({
  id: form.id.toUpperCase() || "...",
  name: form.name || "...",
  capacity_kw: form.capacity_kw ? parseFloat(form.capacity_kw) : null,
  lat: form.lat ? parseFloat(form.lat) : null,
  lng: form.lng ? parseFloat(form.lng) : null,
  base_rate: form.base_rate ? parseFloat(form.base_rate) : null,
  status: "ACTIVE",
}, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>}
    </div>
  );
}