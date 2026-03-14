import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./views/Dashboard";
import BondDetail from "./views/BondDetail";
import Alerts from "./views/Alerts";
import DataEntry from "./views/DataEntry";
import SystemHealth from "./views/SystemHealth";
import BondRegistration from "./views/BondRegistration";
import BlockchainExplorer from "./views/BlockchainExplorer";

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Barlow+Condensed:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --void:#020408;--surface:#070d14;--card:#0b1420;--card2:#0f1a28;--input:#060d18;
  --border:rgba(255,255,255,0.06);--border2:rgba(255,255,255,0.1);
  --green:#00E676;--green-dim:rgba(0,230,118,0.12);--green-glow:rgba(0,230,118,0.3);
  --amber:#FFB300;--amber-dim:rgba(255,179,0,0.12);
  --red:#FF3D3D;--red-dim:rgba(255,61,61,0.12);--red-glow:rgba(255,61,61,0.25);
  --blue:#2196F3;--blue-dim:rgba(33,150,243,0.12);
  --cyan:#00BCD4;--slate:#546E7A;
  --text:#E8F0FE;--text2:#90A4AE;--text3:#455A64;
  --mono:'IBM Plex Mono',monospace;--display:'Barlow Condensed',sans-serif;
  --r:8px;--r2:4px;
}
body{background:var(--void);color:var(--text);font-family:var(--mono);min-height:100vh;overflow-x:hidden}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-track{background:var(--void)}
::-webkit-scrollbar-thumb{background:var(--green);border-radius:2px}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,230,118,0.4)}50%{opacity:.7;box-shadow:0 0 0 6px transparent}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes matrixFadeOut{0%{opacity:1}80%{opacity:1}100%{opacity:0;pointer-events:none}}
@keyframes glitchTitle{
  0%{text-shadow:0 0 20px #00E676,0 0 40px #00E676;transform:skewX(0deg)}
  5%{text-shadow:3px 0 20px #00ff88,-3px 0 10px #0ff;transform:skewX(-2deg)}
  10%{text-shadow:0 0 20px #00E676,0 0 40px #00E676;transform:skewX(0deg)}
  50%{text-shadow:0 0 30px #00E676,0 0 60px #00E676,0 0 80px rgba(0,230,118,0.5)}
  100%{text-shadow:0 0 20px #00E676,0 0 40px #00E676;transform:skewX(0deg)}
}
@keyframes scanline{
  0%{transform:translateY(-100%)}
  100%{transform:translateY(100vh)}
}
@keyframes bootText{
  from{opacity:0;transform:translateX(-8px)}
  to{opacity:1;transform:translateX(0)}
}
@keyframes barFill{from{width:0}to{width:100%}}
@keyframes splashExit{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.04)}}
.splash-exit{animation:splashExit 0.7s ease-in forwards}
`;

function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0); // 0=booting, 1=title, 2=exiting
  const [bootLines, setBootLines] = useState([]);
  const [barWidth, setBarWidth] = useState(0);
  const [cursor, setCursor] = useState(true);

  const BOOT_SEQUENCE = [
    "[ OK ] Initializing GreenBond OS v2.4.1",
    "[ OK ] Loading blockchain interface · Polygon Amoy",
    "[ OK ] Connecting to oracle network...",
    "[ OK ] Fetching bond registry · 6 instruments found",
    "[ OK ] Decrypting portfolio state",
    "[ OK ] Audit engine · ONLINE",
    "[ OK ] Smart contract ABI · LOADED",
    "[ >> ] Launching dashboard...",
  ];

  // Blinking cursor
  useEffect(() => {
    const iv = setInterval(() => setCursor(c => !c), 530);
    return () => clearInterval(iv);
  }, []);

  // Safety net
  useEffect(() => {
    const safety = setTimeout(onDone, 12000);
    return () => clearTimeout(safety);
  }, []);

  useEffect(() => {
    let i = 0;
    let cancelled = false;
    const addLine = () => {
      if (cancelled) return;
      if (i < BOOT_SEQUENCE.length) {
        setBootLines(prev => [...prev, BOOT_SEQUENCE[i]]);
        i++;
        setTimeout(addLine, 380 + Math.random() * 220);
      } else {
        setTimeout(() => { if (!cancelled) setPhase(1); }, 500);
      }
    };
    setTimeout(addLine, 400);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase === 1) {
      let w = 0;
      const iv = setInterval(() => {
        w += 0.6;
        setBarWidth(Math.min(w, 100));
        if (w >= 100) { clearInterval(iv); setTimeout(() => { setPhase(2); setTimeout(onDone, 800); }, 600); }
      }, 22);
      return () => clearInterval(iv);
    }
  }, [phase]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#020408",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      ...(phase === 2 ? { animation: "splashExit 0.7s ease-in forwards" } : {})
    }}>
      {/* Subtle scanlines only */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
      }} />

      {/* Subtle green corner glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 50% 60%, rgba(0,230,118,0.04) 0%, transparent 70%)",
      }} />

      <div style={{ position: "relative", zIndex: 2, width: "min(600px, 90vw)" }}>

        {/* Terminal header bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: 16, paddingBottom: 10,
          borderBottom: "1px solid rgba(0,230,118,0.1)"
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,61,61,0.5)" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,179,0,0.5)" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(0,230,118,0.5)" }} />
          <span style={{ marginLeft: 8, fontSize: 9, color: "rgba(0,230,118,0.3)", letterSpacing: ".2em", fontFamily: "monospace" }}>
            GREENBOND-OS — boot
          </span>
        </div>

        {/* Boot log */}
        <div style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#00E676",
          marginBottom: phase >= 1 ? 36 : 0, minHeight: 200,
          opacity: phase === 2 ? 0 : 1, transition: "opacity 0.4s"
        }}>
          {bootLines.map((line, i) => (
            <div key={i} style={{ marginBottom: 7, opacity: 0, animation: `bootText 0.25s ${i * 0.03}s forwards`, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{
                color: line.startsWith("[ OK ]") ? "#00E676" : "#FFB300",
                fontWeight: 700, flexShrink: 0
              }}>{line.slice(0, 6)}</span>
              <span style={{ color: "rgba(0,230,118,0.7)" }}>{line.slice(7)}</span>
            </div>
          ))}
          {/* Blinking cursor on last line while booting */}
          {phase === 0 && bootLines.length < BOOT_SEQUENCE.length && (
            <span style={{ display: "inline-block", width: 7, height: 13, background: cursor ? "#00E676" : "transparent", verticalAlign: "middle", marginLeft: 2 }} />
          )}
        </div>

        {/* Title + bar */}
        {phase >= 1 && (
          <div style={{ animation: "fadeIn 0.5s ease forwards" }}>
            <div style={{ borderTop: "1px solid rgba(0,230,118,0.15)", paddingTop: 24, marginBottom: 20 }}>
              <div style={{
                fontFamily: "'Barlow Condensed',sans-serif",
                fontSize: "clamp(28px,5vw,48px)",
                fontWeight: 800,
                color: "#00E676",
                letterSpacing: "0.08em",
                animation: "glitchTitle 3s ease-in-out infinite",
                marginBottom: 6,
              }}>GREENBOND OS</div>
              <div style={{ fontSize: 10, color: "rgba(0,230,118,0.4)", letterSpacing: "0.25em" }}>
                SUSTAINABLE INFRASTRUCTURE · BLOCKCHAIN VERIFIED
              </div>
            </div>
            {/* Loading bar */}
            <div style={{ background: "rgba(0,230,118,0.08)", borderRadius: 2, height: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${barWidth}%`,
                background: "linear-gradient(90deg, #00E676, #00ff88)",
                boxShadow: "0 0 10px #589d7c",
                transition: "width 0.05s linear",
                borderRadius: 2
              }} />
            </div>
            <div style={{ fontSize: 9, color: "rgba(0,230,118,0.35)", marginTop: 8, letterSpacing: "0.2em", fontFamily: "monospace" }}>
              {barWidth < 100 ? `LOADING ${Math.floor(barWidth)}%` : "INITIALIZING DASHBOARD..."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const VIEW_TITLES = {
  dashboard: "Global Overview",
  alerts: "Alert Center",
  entry: "Data Entry",
  health: "System Health",
  detail: "Bond Detail",
  register: "Bond Registration",
  blockchain: "Blockchain Explorer",
};

export default function App() {
  const [splash, setSplash] = useState(true);
  const [view, setView] = useState("dashboard");
  const [selectedBond, setSelectedBond] = useState(null);

  const handleSelectBond = (bond) => { setSelectedBond(bond); setView("detail"); };
  const handleBack = () => { setView("dashboard"); setSelectedBond(null); };
  const handleNav = (id) => { setView(id); setSelectedBond(null); };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {splash && <SplashScreen onDone={() => setSplash(false)} />}
      <div style={{ display: "flex", height: "100vh", overflow: "hidden",
                    visibility: splash ? "hidden" : "visible" }}>
        <Sidebar view={view} onNav={handleNav} onBond={handleSelectBond} selectedBond={selectedBond} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Topbar
            title={view === "detail" && selectedBond ? selectedBond.name : VIEW_TITLES[view] || "Dashboard"}
            subtitle={view === "detail" && selectedBond ? `${selectedBond.id} · ${selectedBond.status}` : null}
            onBack={view === "detail" ? handleBack : null}
            onAlerts={() => handleNav("alerts")}
          />
          <main style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {view === "dashboard" && <Dashboard onSelectBond={handleSelectBond} />}
            {view === "detail" && selectedBond && <BondDetail bond={selectedBond} onBack={handleBack} />}
            {view === "alerts" && <Alerts />}
            {view === "entry" && <DataEntry />}
            {view === "health" && <SystemHealth />}
            {view === "register" && <BondRegistration />}
            {view === "blockchain" && <BlockchainExplorer />}
          </main>
        </div>
      </div>
    </>
  );
}