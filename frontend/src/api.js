import axios from "axios";

const api = axios.create({
  baseURL: "",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ── Bonds ──────────────────────────────────────────────────────────────────
export const fetchBonds = () => api.get("/api/bonds").then((r) => r.data);
export const fetchBond = (id) => api.get(`/api/bonds/${id}`).then((r) => r.data);
export const createBond = (data) => api.post("/api/bonds", data).then((r) => r.data);
export const fetchTimeseries = (id, days = 60) =>
  api.get(`/api/bonds/${id}/timeseries`, { params: { days } }).then((r) => r.data);

// ── Dashboard ──────────────────────────────────────────────────────────────
// Uses the dedicated cached summary endpoint instead of computing client-side.
export const fetchDashboardSummary = () =>
  api.get("/api/bonds/dashboard/summary").then((r) => r.data);

// ── Audit ──────────────────────────────────────────────────────────────────
export const fetchAuditLogs = (params) =>
  api.get("/api/audit", { params }).then((r) => r.data);
export const triggerAudit = (date) =>
  api.post("/api/audit/run", null, { params: { target_date: date } }).then((r) => r.data);
export const triggerCatchup = () =>
  api.post("/api/audit/catchup").then((r) => r.data);

// ── Alerts ─────────────────────────────────────────────────────────────────
export const fetchAlerts = (params) =>
  api.get("/api/alerts", { params }).then((r) => r.data);
export const fetchAlertSummary = () =>
  api.get("/api/alerts/summary").then((r) => r.data);

// ── Production ─────────────────────────────────────────────────────────────
export const submitManualEntry = (data) =>
  api.post("/api/production/manual", data).then((r) => r.data);
export const submitIoTEntry = (data) =>
  api.post("/api/production/iot", data).then((r) => r.data);
export const fetchMissingDays = (bondId, year, month) =>
  api.get(`/api/production/missing/${bondId}`, { params: { year, month } }).then((r) => r.data);

// ── Blockchain ─────────────────────────────────────────────────────────────
export const fetchBlockchainStatus = () =>
  api.get("/api/blockchain/status").then((r) => r.data);
export const fetchTransaction = (hash) =>
  api.get(`/api/blockchain/tx/${hash}`).then((r) => r.data);
export const registerBondOnChain = (bondId) =>
  api.post(`/api/blockchain/register/${bondId}`).then((r) => r.data);
export const setRegistrationTx = (bondId, txHash, blockNumber = null) => {
  const params = { tx_hash: txHash };
  if (blockNumber) params.block_number = blockNumber;
  return api.patch(`/api/blockchain/register/${bondId}/tx`, null, { params }).then((r) => r.data);
};

// ── Bond Management ───────────────────────────────────────────────────────
export const deleteBond = (bondId) =>
  api.delete(`/api/bonds/${bondId}`).then((r) => r.data);

export const fixBondRegistration = (bondId, txHash, blockNumber = null) => {
  const params = { tx_hash: txHash };
  if (blockNumber) params.block_number = blockNumber;
  return api.patch(`/api/bonds/${bondId}/registration`, null, { params }).then((r) => r.data);
};

// ── Health ─────────────────────────────────────────────────────────────────
export const fetchSystemHealth = () =>
  api.get("/api/health").then((r) => r.data);

export default api;