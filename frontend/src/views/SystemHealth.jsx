import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSystemHealth } from "../api";

export default function SystemHealth() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ["system-health"],
    queryFn: fetchSystemHealth,
    refetchInterval: 30_000,
  });

  const services = health?.services || {};
  const overall = health?.overall || "LOADING";

  const serviceList = [
    { key: "postgresql", label: "PostgreSQL DB", icon: "DB" },
    { key: "redis", label: "Redis Cache", icon: "KV" },
    { key: "celery_worker", label: "Celery Worker", icon: "WK" },
    { key: "celery_beat", label: "Beat Scheduler", icon: "⏰" },
    { key: "blockchain", label: "Polygon Blockchain", icon: "◈" },
    { key: "nasa_api", label: "NASA POWER API", icon: "SAT" },
  ];

  // Build a subtitle line for each service from the fields the backend actually returns
  function svcDetail(svc = {}, key = "") {
    if (svc.memory_mb != null) return `Memory: ${svc.memory_mb} MB`;
    if (key === "blockchain") {
      const parts = [];
      if (svc.latest_block != null) parts.push(`Block #${svc.latest_block?.toLocaleString()}`);
      if (svc.network) parts.push(svc.network);
      if (svc.wallet_balance_matic != null) parts.push(`Wallet: ${svc.wallet_balance_matic} MATIC${svc.balance_low ? " ⚠ LOW" : ""}`);
      return parts.join(" · ");
    }
    if (svc.latency_ms != null) return `Latency: ${svc.latency_ms} ms`;
    if (svc.ping_bond_id) return `Pinged via ${svc.ping_bond_id}`;
    if (svc.reason) return svc.reason;
    return "";
  }

  return (
    <div>
      {/* Overall status banner */}
      <div style={{
        padding: "10px 14px", borderRadius: "var(--r2)", marginBottom: 14,
        display: "flex", alignItems: "center", gap: 10,
        background: overall === "OPERATIONAL" ? "var(--green-dim)" : "var(--red-dim)",
        border: `1px solid ${overall === "OPERATIONAL" ? "rgba(0,230,118,.2)" : "rgba(255,61,61,.2)"}`,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: overall === "OPERATIONAL" ? "var(--green)" : "var(--red)", animation: "pulse 2s infinite" }} />
        <span style={{ fontSize: 11, color: overall === "OPERATIONAL" ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
          {isLoading ? "CHECKING SYSTEMS..." : `ALL SYSTEMS ${overall}`}
        </span>
        <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: "auto", fontFamily: "var(--mono)" }}>
          {health?.timestamp} · Auto-refreshes every 30s
        </span>
        <button onClick={() => refetch()} style={{ padding: "4px 10px", background: "var(--card2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 10, borderRadius: "var(--r2)", cursor: "pointer", fontFamily: "var(--mono)" }}>
          ↻ Refresh
        </button>
      </div>

      {/* Low balance warning — only shown when balance is critically low */}
      {services.blockchain?.balance_low && (
        <div style={{ padding: "12px 16px", background: "var(--red-dim)", border: "1px solid rgba(255,61,61,.3)", borderRadius: "var(--r2)", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>▲</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)", marginBottom: 3 }}>
              WALLET LOW — {services.blockchain.wallet_balance_matic} MATIC remaining
            </div>
            <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>
              Blockchain penalty writes will fail when the wallet runs dry. Top up your Amoy testnet wallet before the next 6 AM audit.
            </div>
          </div>
        </div>
      )}

      {/* KPIs — only show live data, no hardcoded placeholders */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 14 }}>
        {[
          { l: "PostgreSQL", v: services.postgresql?.ok ? "ONLINE" : "OFFLINE", c: services.postgresql?.ok ? "var(--green)" : "var(--red)", s: services.postgresql?.status || "—" },
          { l: "Redis Memory", v: services.redis?.memory_mb != null ? `${services.redis.memory_mb} MB` : "—", c: services.redis?.ok ? "var(--green)" : "var(--red)", s: services.redis?.status || "—" },
          { l: "Celery Queue", v: services.celery_worker?.ok ? "RUNNING" : "DOWN", c: services.celery_worker?.ok ? "var(--green)" : "var(--red)", s: "Worker status" },
          { l: "Blockchain Block", v: services.blockchain?.latest_block != null ? `#${services.blockchain.latest_block.toLocaleString()}` : "—", c: services.blockchain?.ok ? "var(--cyan)" : "var(--red)", s: services.blockchain?.network || "Polygon" },
          { l: "Wallet Balance", v: services.blockchain?.wallet_balance_matic != null ? `${services.blockchain.wallet_balance_matic} MATIC` : "—", c: services.blockchain?.balance_low ? "var(--red)" : "var(--green)", s: services.blockchain?.balance_low ? "⚠ LOW — top up!" : "Sufficient for TX" },
        ].map(k => (
          <div key={k.l} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 8 }}>{k.l}</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 800, color: k.c }}>{isLoading ? "…" : k.v}</div>
            <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>{k.s}</div>
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: k.c }} />
          </div>
        ))}
      </div>

      {/* Service List */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 14 }}>◈ Services</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {serviceList.map(({ key, label, icon }) => {
            const svc = services[key] || {};
            const ok = svc.ok !== false;
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)" }}>
                <div>
                  <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".06em", color: "var(--text3)", fontFamily: "var(--mono)", background: "var(--border)", padding: "2px 5px", borderRadius: 3 }}>{icon}</span>
                    {label}
                  </div>
                  <div style={{ fontSize: 9, color: svc.balance_low ? "var(--red)" : "var(--text3)", marginTop: 2, fontFamily: "var(--mono)" }}>
                    {svcDetail(svc, key)}
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, color: ok ? "var(--green)" : "var(--red)" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? "var(--green)" : "var(--red)", animation: ok ? "pulse 2s infinite" : "none" }} />
                  {isLoading ? "CHECKING" : svc.status || (ok ? "OK" : "ERROR")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* NASA Ping Details */}
      {services.nasa_api?.ping_bond_id && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text2)", marginBottom: 10 }}>◈ NASA API Ping Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              { l: "Pinged Bond", v: services.nasa_api.ping_bond_id },
              { l: "Coordinates", v: services.nasa_api.ping_coords ? `${services.nasa_api.ping_coords.lat}°N, ${services.nasa_api.ping_coords.lng}°E` : "—" },
              { l: "Latency", v: services.nasa_api.latency_ms != null ? `${services.nasa_api.latency_ms} ms` : "—" },
            ].map(f => (
              <div key={f.l} style={{ background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text3)", marginBottom: 4 }}>{f.l}</div>
                <div style={{ fontSize: 12, color: "var(--cyan)", fontWeight: 600, fontFamily: "var(--mono)" }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Catchup Action ── */}

      {/* Cached indicator */}
      {health?.cached && (
        <div style={{ padding: "8px 14px", background: "var(--card2)", border: "1px solid var(--border)", borderRadius: "var(--r2)", fontSize: 10, color: "var(--text3)", fontFamily: "var(--mono)" }}>
          ↺ Showing cached result — refreshes automatically every 60s on the server
        </div>
      )}
    </div>
  );
}