import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./views/Dashboard";
import BondDetail from "./views/BondDetail";
import MapView from "./views/MapView";
import Alerts from "./views/Alerts";
import DataEntry from "./views/DataEntry";
import SystemHealth from "./views/SystemHealth";

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
`;

const VIEW_TITLES = {
  dashboard: "Global Overview",
  map: "Portfolio Map",
  alerts: "Alert Center",
  entry: "Data Entry",
  health: "System Health",
  detail: "Bond Detail",
};

export default function App() {
  const [view, setView] = useState("dashboard");
  const [selectedBond, setSelectedBond] = useState(null);

  const handleSelectBond = (bond) => {
    setSelectedBond(bond);
    setView("detail");
  };

  const handleBack = () => {
    setView("dashboard");
    setSelectedBond(null);
  };

  const handleNav = (id) => {
    setView(id);
    setSelectedBond(null);
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar
          view={view}
          onNav={handleNav}
          onBond={handleSelectBond}
          selectedBond={selectedBond}
        />
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
            {view === "map" && <MapView onSelectBond={handleSelectBond} />}
            {view === "alerts" && <Alerts />}
            {view === "entry" && <DataEntry />}
            {view === "health" && <SystemHealth />}
          </main>
        </div>
      </div>
    </>
  );
}
