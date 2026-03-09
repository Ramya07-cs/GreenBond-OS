import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useBonds } from "../hooks/useBonds";
import { submitManualEntry, submitIoTEntry, fetchMissingDays } from "../api";

function Field({ n, label, children }) {
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
      </div>
    </div>
  );
}

const inputStyle = {
  background: "var(--input)", border: "1px solid var(--border)",
  borderRadius: "var(--r2)", padding: "9px 12px", color: "var(--text)",
  fontFamily: "var(--mono)", fontSize: 12, outline: "none", width: "100%",
};

function ResultBanner({ ok, message, detail, onReset }) {
  return (
    <div style={{
      padding: 20, textAlign: "center",
      background: ok ? "var(--green-dim)" : "var(--red-dim)",
      border: `1px solid ${ok ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`,
      borderRadius: "var(--r2)",
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{ok ? "✅" : "❌"}</div>
      <div style={{ color: ok ? "var(--green)" : "var(--red)", fontWeight: 700, marginBottom: 4 }}>{message}</div>
      {detail && <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 10 }}>{detail}</div>}
      <button onClick={onReset} style={{
        marginTop: 4, padding: "8px 16px", background: "var(--card2)",
        border: "1px solid var(--border2)", color: "var(--text)",
        borderRadius: "var(--r2)", cursor: "pointer", fontSize: 11, fontFamily: "var(--mono)",
      }}>
        {ok ? "Submit Another" : "Try Again"}
      </button>
    </div>
  );
}

function ManualPanel({ bonds }) {
  const [form, setForm] = useState({
    bond_id: "", date: new Date().toISOString().split("T")[0], kwh: "", notes: "",
  });
  const [result, setResult] = useState(null);

  const selectedBond = bonds.find(b => b.id === form.bond_id);
  const minDate = selectedBond?.created_at ? selectedBond.created_at.split("T")[0] : undefined;
  const maxDate = new Date().toISOString().split("T")[0];

  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDow = (new Date(today.getFullYear(), today.getMonth(), 1).getDay() + 6) % 7;

  const { data: missingData } = useQuery({
    queryKey: ["missing", form.bond_id, today.getFullYear(), today.getMonth() + 1],
    queryFn: () => fetchMissingDays(form.bond_id, today.getFullYear(), today.getMonth() + 1),
    enabled: !!form.bond_id,
  });

  const missingSet = new Set((missingData?.missing_days || []).map(d => parseInt(d.split("-")[2])));
  const submittedSet = new Set((missingData?.submitted_dates || []).map(d => parseInt(d.split("-")[2])));
  const auditedMap = missingData?.audited_dates || {};
  const selectedDateAudit = auditedMap[form.date];
  const bondCreatedDay = missingData?.bond_created
    ? (new Date(missingData.bond_created).getMonth() === today.getMonth() &&
       new Date(missingData.bond_created).getFullYear() === today.getFullYear())
      ? new Date(missingData.bond_created).getDate()
      : 0
    : null;

  const mutation = useMutation({
    mutationFn: submitManualEntry,
    onSuccess: (data) => setResult({ ok: true, message: "Entry Submitted!", detail: `Record ID: ${data.id ?? "—"} · PR will be calculated in the next audit run.` }),
    onError: (err) => setResult({ ok: false, message: "Submission Failed", detail: err?.response?.data?.detail || "Check console for details." }),
  });

  const handleSubmit = () => {
    if (!form.bond_id || !form.date || !form.kwh) return;
    mutation.mutate({ bond_id: form.bond_id, date: form.date, kwh: parseFloat(form.kwh), notes: form.notes });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>📝 Submit Daily Production</div>
        {result ? (
          <ResultBanner {...result} onReset={() => { setResult(null); setForm(f => ({ ...f, kwh: "", notes: "" })); }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field n={1} label="Select Bond">
              <select value={form.bond_id} onChange={e => setForm(f => ({ ...f, bond_id: e.target.value }))} style={inputStyle}>
                <option value="">— Select bond —</option>
                {bonds.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
              </select>
            </Field>
            <Field n={2} label="Reporting Date">
              <input type="date" value={form.date} min={minDate} max={maxDate} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
            {selectedDateAudit && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,170,0,.1)", border: "1px solid rgba(255,170,0,.35)", borderRadius: "var(--r2)", fontSize: 10, color: "var(--amber)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
                ⚠ {form.date} is already audited (<strong>{selectedDateAudit}</strong>).
                Updating production data will overwrite the submitted kWh but <strong>will not change the audit verdict</strong> — the {selectedDateAudit} result is locked by the idempotency guard.
                To re-audit this date, use <strong>Blockchain Explorer → Trigger Audit</strong>.
              </div>
            )}
            </Field>
            <Field n={3} label="Energy Produced (kWh)">
              <input type="number" placeholder="e.g. 24800" value={form.kwh} onChange={e => setForm(f => ({ ...f, kwh: e.target.value }))} style={inputStyle} />
            </Field>
            <Field n={4} label="Notes (Optional)">
              <input type="text" placeholder="e.g. Grid outage 14:00–16:00" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
            </Field>
            <button onClick={handleSubmit} disabled={mutation.isPending || !form.bond_id || !form.kwh}
              style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--green)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)", opacity: (!form.bond_id || !form.kwh) ? .4 : 1, transition: "opacity .2s" }}>
              {mutation.isPending ? "⏳ Submitting..." : "⬆ Submit & Log"}
            </button>
          </div>
        )}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 12 }}>
          📅 {today.toLocaleDateString("en-IN", { month: "long", year: "numeric" })} — Data Coverage
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {[["var(--green-dim)","rgba(0,230,118,.3)","var(--green)","Submitted"],["var(--red-dim)","rgba(255,61,61,.3)","var(--red)","Missing"],["rgba(255,255,255,.02)","var(--border)","var(--text3)","Future"],["rgba(255,255,255,.01)","rgba(255,255,255,.04)","var(--text3)","N/A"]].map(([bg, border, color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "var(--text2)" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${border}` }} />
              <span style={{ color }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
          {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 9, color: "var(--text3)", padding: "2px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = day === today.getDate();
            const isFuture = day > today.getDate();
            const isNA = !form.bond_id ? false : bondCreatedDay !== null && bondCreatedDay > 0 && day < bondCreatedDay;
            const isSubmitted = !isNA && submittedSet.has(day);
            const isMissing = !isNA && !isFuture && missingSet.has(day);
            let bg = "var(--card2)", borderColor = "var(--border)", color = "var(--text2)", opacity = 1, dotColor = null;
            if (isNA) { bg = "rgba(255,255,255,.01)"; borderColor = "rgba(255,255,255,.04)"; color = "var(--text3)"; opacity = 0.35; }
            else if (isFuture) { bg = "rgba(255,255,255,.02)"; opacity = 0.25; color = "var(--text3)"; }
            else if (isSubmitted) { bg = "var(--green-dim)"; borderColor = "rgba(0,230,118,.35)"; color = "var(--green)"; dotColor = "var(--green)"; }
            else if (isMissing) { bg = "var(--red-dim)"; borderColor = "rgba(255,61,61,.35)"; color = "var(--red)"; dotColor = "var(--red)"; }
            if (isToday) borderColor = "var(--green)";
            return (
              <div key={day} style={{ aspectRatio: 1, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, position: "relative", background: bg, border: `1px solid ${borderColor}`, color, fontWeight: isToday ? 700 : 400, opacity }}>
                {day}
                {dotColor && <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: dotColor }} />}
              </div>
            );
          })}
        </div>
        {form.bond_id && missingData && (
          <div style={{ marginTop: 12 }}>
            {missingData.missing_days.length > 0 ? (
              <div style={{ padding: 10, background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.2)", borderRadius: "var(--r2)" }}>
                <div style={{ fontSize: 10, color: "var(--red)", fontWeight: 700, marginBottom: 3 }}>⚠ {missingData.missing_days.length} MISSING DAYS</div>
                <div style={{ fontSize: 10, color: "var(--text2)" }}>{missingData.submitted_days} of {missingData.total_days} applicable days submitted.</div>
              </div>
            ) : (
              <div style={{ padding: 10, background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.2)", borderRadius: "var(--r2)" }}>
                <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 700 }}>✅ All days submitted</div>
                <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{missingData.submitted_days} of {missingData.total_days} days covered this month.</div>
              </div>
            )}
          </div>
        )}
        {!form.bond_id && (
          <div style={{ marginTop: 10, padding: 10, background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", fontSize: 10, color: "var(--text3)", textAlign: "center" }}>
            Select a bond to see data coverage
          </div>
        )}
      </div>
    </div>
  );
}

function IoTPanel({ bonds }) {
  const [form, setForm] = useState({ bond_id: "", device_id: "", date: new Date().toISOString().split("T")[0], kwh: "" });
  const [result, setResult] = useState(null);
  const [expandedBond, setExpandedBond] = useState(null);
  const selectedBond = bonds.find(b => b.id === form.bond_id);
  const minDate = selectedBond?.created_at ? selectedBond.created_at.split("T")[0] : undefined;
  const iotToday = new Date();
  const { data: iotMissingData } = useQuery({
    queryKey: ["missing", form.bond_id, iotToday.getFullYear(), iotToday.getMonth() + 1],
    queryFn: () => fetchMissingDays(form.bond_id, iotToday.getFullYear(), iotToday.getMonth() + 1),
    enabled: !!form.bond_id,
  });
  const iotAuditedMap = iotMissingData?.audited_dates || {};
  const iotSelectedDateAudit = iotAuditedMap[form.date];

  const mutation = useMutation({
    mutationFn: submitIoTEntry,
    onSuccess: (data) => setResult({ ok: true, message: "IoT Push Accepted!", detail: `Entry ID: ${data.id ?? "—"} · Source: IOT` }),
    onError: (err) => setResult({ ok: false, message: "Push Failed", detail: err?.response?.data?.detail || "Check device_id and bond_id." }),
  });

  const handleSubmit = () => {
    if (!form.bond_id || !form.device_id || !form.kwh) return;
    mutation.mutate({ bond_id: form.bond_id, device_id: form.device_id, date: form.date, kwh: parseFloat(form.kwh) });
  };

  const maxDate = new Date().toISOString().split("T")[0];
  const previewPayload = { bond_id: form.bond_id || "...", device_id: form.device_id || "...", date: form.date, kwh: form.kwh ? parseFloat(form.kwh) : 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ padding: "10px 14px", background: "var(--amber-dim)", border: "1px solid rgba(255,179,0,.25)", borderRadius: "var(--r2)", fontSize: 11, color: "var(--text2)", lineHeight: 1.7 }}>
        📡 <strong style={{ color: "var(--amber)" }}>IoT Auto-Sync:</strong> Use the form below to simulate or trigger an IoT push. In production, inverters call{" "}
        <code style={{ fontFamily: "var(--mono)", fontSize: 10, background: "var(--input)", padding: "1px 5px", borderRadius: 3 }}>POST /api/production/iot</code> directly.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* IoT Push Form */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 16 }}>📡 IoT Push Form</div>
          {result ? (
            <ResultBanner {...result} onReset={() => { setResult(null); setForm(f => ({ ...f, kwh: "", device_id: "" })); }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field n={1} label="Target Bond">
                <select value={form.bond_id} onChange={e => setForm(f => ({ ...f, bond_id: e.target.value }))} style={inputStyle}>
                  <option value="">— Select bond —</option>
                  {bonds.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
                </select>
              </Field>
              <Field n={2} label="Device ID">
                <input type="text" placeholder="e.g. INV-ALPHA-001" value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} style={inputStyle} />
              </Field>
              <Field n={3} label="Production Date">
                <input type="date" value={form.date} min={minDate} max={maxDate} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                {iotSelectedDateAudit && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,170,0,.1)", border: "1px solid rgba(255,170,0,.35)", borderRadius: "var(--r2)", fontSize: 10, color: "var(--amber)", fontFamily: "var(--mono)", lineHeight: 1.6 }}>
                    ⚠ {form.date} is already audited (<strong>{iotSelectedDateAudit}</strong>).
                    Updating production data will overwrite the submitted kWh but <strong>will not change the audit verdict</strong> — the {iotSelectedDateAudit} result is locked by the idempotency guard.
                    To re-audit this date, use <strong>Blockchain Explorer → Trigger Audit</strong>.
                  </div>
                )}
              </Field>
              <Field n={4} label="Energy Generated (kWh)">
                <input type="number" placeholder="e.g. 24800.0" value={form.kwh} onChange={e => setForm(f => ({ ...f, kwh: e.target.value }))} style={inputStyle} />
              </Field>
              {(form.bond_id || form.device_id || form.kwh) && (
                <div style={{ background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, letterSpacing: ".1em", color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>📋 Payload Preview</div>
                  <pre style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{JSON.stringify(previewPayload, null, 2)}</pre>
                </div>
              )}
              <button onClick={handleSubmit} disabled={mutation.isPending || !form.bond_id || !form.device_id || !form.kwh}
                style={{ padding: "10px 20px", borderRadius: "var(--r2)", background: "var(--amber)", border: "none", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "var(--mono)", opacity: (!form.bond_id || !form.device_id || !form.kwh) ? .4 : 1, transition: "opacity .2s" }}>
                {mutation.isPending ? "⏳ Pushing..." : "📡 Push IoT Data"}
              </button>
            </div>
          )}
        </div>

        {/* Bond IoT Targets */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>🌐 Bond IoT Targets</div>
          {bonds.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No bonds registered yet.</div>
          ) : bonds.map(b => (
            <div key={b.id}>
              <div onClick={() => setExpandedBond(expandedBond === b.id ? null : b.id)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: expandedBond === b.id ? "var(--card2)" : "var(--card)", border: `1px solid ${expandedBond === b.id ? "rgba(0,230,118,.25)" : "var(--border)"}`, borderRadius: "var(--r2)", marginBottom: 6, cursor: "pointer", transition: "all .15s" }}>
                <div>
                  <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>📡 {b.name}<span style={{ fontSize: 9, color: "var(--text3)", fontFamily: "var(--mono)" }}>({b.id})</span></div>
                  <div style={{ fontSize: 9, color: "var(--text3)", marginTop: 2 }}>Tap to view connection details</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: b.status === "ACTIVE" ? "var(--green)" : "var(--slate)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: b.status === "ACTIVE" ? "var(--green)" : "var(--slate)", animation: b.status === "ACTIVE" ? "pulse 2s infinite" : "none" }} />
                    {b.status}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, bond_id: b.id })); }}
                    style={{ padding: "4px 10px", background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.25)", color: "var(--green)", fontSize: 9, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)", fontWeight: 700 }}>
                    USE ↑
                  </button>
                </div>
              </div>
              {expandedBond === b.id && (
                <div style={{ marginBottom: 8, padding: "14px", background: "var(--void)", border: "1px solid var(--border)", borderRadius: "var(--r2)", animation: "fadeIn .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: ".1em", textTransform: "uppercase" }}>IoT Connection Details</div>
                    <span style={{ fontSize: 9, padding: "2px 8px", background: "var(--green-dim)", border: "1px solid rgba(0,230,118,.2)", color: "var(--green)", borderRadius: 100, fontFamily: "var(--mono)", fontWeight: 700 }}>ACTIVE</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "Endpoint", value: "POST /api/production/iot", valueColor: "var(--green)" },
                      { label: "Bond ID", value: b.id, valueColor: "#A5D6A7" },
                      { label: "Capacity", value: `${b.capacity_kw} kW`, valueColor: "var(--text2)" },
                      { label: "Status", value: b.status, valueColor: b.status === "ACTIVE" ? "var(--green)" : "var(--slate)" },
                    ].map(({ label, value, valueColor }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "var(--card)", borderRadius: "var(--r2)" }}>
                        <span style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</span>
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: valueColor, fontWeight: 600 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 9, color: "var(--text3)", lineHeight: 1.6 }}>
                    Required fields: <span style={{ color: "var(--text2)" }}>bond_id, device_id, date (YYYY-MM-DD), kwh</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DataEntry() {
  const [mode, setMode] = useState("manual");
  const { data: bonds = [] } = useBonds();
  const tabs = [["manual", "📝 Manual Entry"], ["iot", "🌐 IoT Auto-Sync"]];

  return (
    <div>
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} style={{ padding: "8px 18px", fontSize: 11, fontWeight: 600, background: "none", border: "none", borderBottom: `2px solid ${mode === k ? "var(--green)" : "transparent"}`, color: mode === k ? "var(--green)" : "var(--text2)", cursor: "pointer", transition: "all .2s", marginBottom: -1, letterSpacing: ".04em", fontFamily: "var(--mono)" }}>{l}</button>
        ))}
      </div>
      {mode === "manual" && <ManualPanel bonds={bonds} />}
      {mode === "iot" && <IoTPanel bonds={bonds} />}
    </div>
  );
}