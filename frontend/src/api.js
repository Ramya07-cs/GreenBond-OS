import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ── Bonds ──────────────────────────────────────────────────────────────────
export const fetchBonds = () => api.get("/bonds").then((r) => r.data);
export const fetchBond = (id) => api.get(`/bonds/${id}`).then((r) => r.data);
export const createBond = (data) => api.post("/bonds", data).then((r) => r.data);
export const fetchTimeseries = (id, days = 60) =>
  api.get(`/bonds/${id}/timeseries`, { params: { days } }).then((r) => r.data);

// ── Audit ──────────────────────────────────────────────────────────────────
export const fetchAuditLogs = (params) =>
  api.get("/audit", { params }).then((r) => r.data);
export const triggerAudit = (date) =>
  api.post("/audit/run", null, { params: { target_date: date } }).then((r) => r.data);

// ── Alerts ─────────────────────────────────────────────────────────────────
export const fetchAlerts = (params) =>
  api.get("/alerts", { params }).then((r) => r.data);
export const fetchAlertSummary = () =>
  api.get("/alerts/summary").then((r) => r.data);

// ── Production ─────────────────────────────────────────────────────────────
export const submitManualEntry = (data) =>
  api.post("/production/manual", data).then((r) => r.data);
export const submitIoTEntry = (data) =>
  api.post("/production/iot", data).then((r) => r.data);
export const fetchMissingDays = (bondId, year, month) =>
  api.get(`/production/missing/${bondId}`, { params: { year, month } }).then((r) => r.data);

// ── Blockchain ─────────────────────────────────────────────────────────────
export const fetchBlockchainStatus = () =>
  api.get("/blockchain/status").then((r) => r.data);
export const fetchTransaction = (hash) =>
  api.get(`/blockchain/tx/${hash}`).then((r) => r.data);

// ── Health ─────────────────────────────────────────────────────────────────
export const fetchSystemHealth = () =>
  api.get("/health").then((r) => r.data);

export default api;
