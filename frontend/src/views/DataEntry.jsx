import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useBonds } from "../hooks/useBonds";
import { submitManualEntry, fetchMissingDays } from "../api";

export default function DataEntry() {
  const [mode, setMode] = useState("manual");
  const [form, setForm] = useState({ bond_id: "", date: new Date().toISOString().split("T")[0], kwh: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const { data: bonds = [] } = useBonds();
  const selectedBond = bonds.find(b => b.id === form.bond_id);
  const minDate = selectedBond?.created_at ? selectedBond.created_at.split("T")[0] : undefined;
  const maxDate = new Date().toISOString().split("T")[0];

  const mutation = useMutation({
    mutationFn: submitManualEntry,
    onSuccess: () => setSubmitted(true),
  });

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const { data: missingData } = useQuery({
    queryKey: ["missing", form.bond_id, today.getFullYear(), today.getMonth() + 1],
    queryFn: () => fetchMissingDays(form.bond_id, today.getFullYear(), today.getMonth() + 1),
    enabled: !!form.bond_id,
  });
  const missingSet = new Set((missingData?.missing_days || []).map(d => parseInt(d.split("-")[2])));

  const handleSubmit = () => {
    if (!form.bond_id || !form.date || !form.kwh) return;
    mutation.mutate({ bond_id: form.bond_id, date: form.date, kwh: parseFloat(form.kwh), notes: form.notes });
  };

  const tabs = [["manual", "📝 Manual Entry"], ["iot", "🌐 IoT Auto-Sync"]];

  return (
    <div>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} style={{
            padding: "8px 18px", fontSize: 11, fontWeight: 600,
            background: "none", border: "none", borderBottom: `2px solid ${mode === k ? "var(--green)" : "transparent"}`,
            color: mode === k ? "var(--green)" : "var(--text2)", cursor: "pointer",
            transition: "all .2s", marginBottom: -1, letterSpacing: ".04em", fontFamily: "var(--mono)",
          }}>{l}</button>
        ))}
      </div>

      {mode === "manual" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Form */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>📝 Submit Daily Production</div>
            {submitted ? (
              <div style={{ padding: 24, textAlign: "center", background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.2)", borderRadius: "var(--r2)" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                <div style={{ color: "var(--green)", fontWeight: 700, marginBottom: 4 }}>Entry Submitted!</div>
                <div style={{ fontSize: 11, color: "var(--text2)" }}>PR will be calculated in tonight's audit run.</div>
                <button onClick={() => setSubmitted(false)} style={{ marginTop: 12, padding: "8px 16px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--r2)", cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)" }}>
                  Submit Another
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { n: 1, l: "Select Bond", el: (
                    <select value={form.bond_id} onChange={e => setForm(f => ({ ...f, bond_id: e.target.value }))}
                      style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)", fontSize: 12, outline: "none", width: "100%" }}>
                      <option value="">— Select bond —</option>
                      {bonds.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
                    </select>
                  )},
                  { n: 2, l: "Reporting Date", el: <input type="date" value={form.date} min={minDate} max={maxDate} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%" }} /> },
                  { n: 3, l: "Energy Produced (kWh)", el: <input type="number" placeholder="e.g. 24800" value={form.kwh} onChange={e => setForm(f => ({ ...f, kwh: e.target.value }))} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%" }} /> },
                  { n: 4, l: "Notes (Optional)", el: <input type="text" placeholder="e.g. Grid outage 14:00–16:00" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ background: "var(--input)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)", fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%" }} /> },
                ].map(f => (
                  <div key={f.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.3)", color: "var(--green)", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{f.n}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", fontWeight: 600, marginBottom: 5 }}>{f.l}</div>
                      {f.el}
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleSubmit}
                  disabled={mutation.isPending || !form.bond_id || !form.kwh}
                  style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)", opacity: (!form.bond_id || !form.kwh) ? .4 : 1 }}
                >
                  {mutation.isPending ? "Submitting..." : "⬆ Submit & Log"}
                </button>
                {mutation.isError && <div style={{ fontSize: 11, color: "var(--red)" }}>Submission failed. Check console.</div>}
              </div>
            )}
          </div>

          {/* Calendar */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>
              📅 {today.toLocaleDateString("en-IN", { month: "long", year: "numeric" })} — Data Coverage
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              {[["var(--red-dim)", "rgba(255,61,61,.3)", "Missing"], ["var(--green-dim)", "rgba(0,230,118,.3)", "Submitted"], ["var(--border)", "var(--border)", "Future"]].map(([bg, border, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text2)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${border}` }} /> {l}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 6 }}>
              {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 9, color: "var(--text3)", padding: "4px 0" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === today.getDate();
                const isMissing = missingSet.has(day);
                const isFuture = day > today.getDate();
                return (
                  <div key={i} style={{
                    aspectRatio: 1, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, position: "relative",
                    background: isMissing ? "var(--red-dim)" : isFuture ? "rgba(255,255,255,.02)" : "var(--card2)",
                    border: `1px solid ${isToday ? "var(--green)" : isMissing ? "rgba(255,61,61,.3)" : "var(--border)"}`,
                    color: isToday ? "var(--green)" : isMissing ? "var(--red)" : isFuture ? "var(--text3)" : "var(--text2)",
                    fontWeight: isToday ? 700 : 400, opacity: isFuture ? .3 : 1,
                  }}>
                    {day}
                    {isMissing && <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: "var(--red)" }} />}
                  </div>
                );
              })}
            </div>
            {missingData && (
              <div style={{ marginTop: 12, padding: 10, background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.2)", borderRadius: "var(--r2)" }}>
                <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700, marginBottom: 4 }}>⚠ {missingData.missing_days.length} MISSING DAYS</div>
                <div style={{ fontSize: 10, color: "var(--text2)" }}>{missingData.submitted_days} of {missingData.total_days} days submitted this month.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {mode === "iot" && (
        <div>
          {/* IoT note — no hardcoded bond IDs; shows real bonds from DB */}
          <div style={{ padding: "10px 14px", background: "var(--amber-dim)", border: "1px solid rgba(255,179,0,.25)", borderRadius: "var(--r2)", marginBottom: 14, fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
            📡 <strong style={{ color: "var(--amber)" }}>IoT Auto-Sync:</strong> Inverters push data via{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 10, background: "var(--input)", padding: "1px 5px", borderRadius: 3 }}>POST /api/production/iot</code>.
            Each payload must include a <code style={{ fontFamily: "var(--mono)", fontSize: 10, background: "var(--input)", padding: "1px 5px", borderRadius: 3 }}>bond_id</code> matching one of your registered bonds below.
          </div>

          {/* Show real bonds from the database as sync targets */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🌐 Bond IoT Targets</div>
            {bonds.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No bonds registered yet. Create a bond first.</div>
            ) : (
              bonds.map(b => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      📡 {b.name}
                      <span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)" }}>({b.id})</span>
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 3, fontFamily: "var(--mono)" }}>
                      Endpoint: POST /api/production/iot · body: {"{"} bond_id: "{b.id}", date, kwh {"}"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: b.status === "ACTIVE" ? "var(--green)" : "var(--slate)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: b.status === "ACTIVE" ? "var(--green)" : "var(--slate)", animation: b.status === "ACTIVE" ? "pulse 2s infinite" : "none" }} />
                    {b.status}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Example curl command, always uses the first active bond if available */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>📋 Example IoT Push</div>
            <pre style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "12px 14px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", lineHeight: 1.8, overflowX: "auto", whiteSpace: "pre-wrap" }}>
{`curl -X POST http://localhost:8000/api/production/iot \\
  -H "Content-Type: application/json" \\
  -d '{
    "bond_id": "${bonds[0]?.id || "GB-XXXX-XXX"}",
    "date": "${new Date().toISOString().split("T")[0]}",
    "kwh": 24800.0
  }'`}
            </pre>
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 8 }}>
              The backend validates bond_id exists in the database, stores the reading, and uses it in the next 6 AM audit.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
