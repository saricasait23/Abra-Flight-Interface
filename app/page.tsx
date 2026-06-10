"use client";
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import HUD from '../components/HUD';

const MapComponent = dynamic(() => import('../components/MapComponent'), { ssr: false });

export default function Home() {
  const [swarm, setSwarm] = useState<any[]>([]);
  const [selectedIhaId, setSelectedIhaId] = useState<number | null>(null);
  const selectedIha = swarm.find((i) => i.id === selectedIhaId) || null;
  
  const [consoleLogs, setConsoleLogs] = useState<{time: string, msg: string}[]>([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<"telemetry" | "parameters">("telemetry");
  const [searchParam, setSearchParam] = useState("");
  const [params, setParams] = useState([
    { id: "WPNAV_SPEED", value: 500.0, desc: "Otonom Görev Seyir Hızı (cm/s)" },
    { id: "WPNAV_ACCEL", value: 100.0, desc: "Otonom Yatay İvmelenme Hızı (cm/s/s)" },
    { id: "WPNAV_SPEED_UP", value: 250.0, desc: "Otonom Tırmanış Hızı (cm/s)" },
    { id: "WPNAV_SPEED_DN", value: 150.0, desc: "Otonom İniş Hızı (cm/s)" },
    { id: "WPNAV_ACCEL_Z", value: 100.0, desc: "Dikey İvmelenme/Frenleme (cm/s/s)" },
    { id: "ATC_ANG_PIT_P", value: 4.5, desc: "Pitch Açısı P Kazancı (Sertlik)" },
    { id: "ATC_ANG_RLL_P", value: 4.5, desc: "Roll Açısı P Kazancı (Sertlik)" },
    { id: "ATC_RAT_PIT_P", value: 0.135, desc: "Pitch Oranı P Kazancı (Hassasiyet)" },
    { id: "ATC_RAT_RLL_P", value: 0.135, desc: "Roll Oranı P Kazancı (Hassasiyet)" },
    { id: "ATC_RAT_YAW_P", value: 0.180, desc: "Yaw Oranı P Kazancı (Kuyruk Tutuşu)" },
    { id: "INS_GYRO_FILTER", value: 20.0, desc: "Gyro Yazılımsal Filtre Frekansı (Hz)" },
    { id: "INS_ACCEL_FILTER", value: 20.0, desc: "İvmeölçer Filtre Frekansı (Hz)" },
    { id: "FENCE_ENABLE", value: 0.0, desc: "Sanal Çit Koruması (0: Kapalı, 1: Açık)" },
    { id: "FENCE_RADIUS", value: 300.0, desc: "Sanal Çit Maksimum Yarıçap (m)" },
    { id: "RTL_ALT", value: 1500.0, desc: "Eve Dönüş (RTL) İrtifası (cm)" },
  ]);

  const [ipAddress, setIpAddress] = useState("192.168.30.3");
  const [port, setPort] = useState("5760");
  const [isConnected, setIsConnected] = useState(false);
  
  const [waypoints, setWaypoints] = useState<{lat: number, lon: number, alt: number, speed: number}[]>([]);
  const [actionMenu, setActionMenu] = useState<{lat: number, lon: number} | null>(null);
  const [missionAlt, setMissionAlt] = useState(20);
  const [missionSpeed, setMissionSpeed] = useState(15);
  const [qrMission, setQrMission] = useState("AWAITING QR SCAN...");
  
  const [isMounted, setIsMounted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    setConsoleLogs(prev => [...prev.slice(-49), { time, msg }]);
  };

  useEffect(() => { consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [consoleLogs]);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");
    wsRef.current = ws;

    ws.onopen = () => addLog(">> WEBSOCKET READY. BACKEND CONNECTED.");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.type === "telemetry") {
            setSwarm(payload.data);
            setSelectedIhaId((currentId) => {
              if (!currentId && payload.data.length > 0) return payload.data[0].id;
              return currentId;
            });
        }
        
        // HATA ÇÖZÜMÜ: Bağlantı başarısızsa arayüzdeki butonu iptal et
        if (payload.type === "connection_failed") {
            setIsConnected(false);
            setSwarm([]);
        }

        if (payload.console && payload.console.length > 0) {
            payload.console.forEach((msg: string) => addLog(msg));
        }
      } catch {
        addLog("⚠️ INVALID TELEMETRY DATA RECEIVED");
      }
    };

    ws.onerror = () => addLog("⚠️ BACKEND NOT FOUND. START PYTHON SERVER FIRST.");
    ws.onclose = () => addLog(">> WEBSOCKET CLOSED.");

    return () => ws.close();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (swarm.length === 0) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedIhaId((currentId) => {
          if (!currentId) return swarm[0].id;
          const currentIndex = swarm.findIndex(i => i.id === currentId);
          const nextIndex = (currentIndex + 1) % swarm.length;
          return swarm[nextIndex].id;
        });
      }

      const numKey = parseInt(e.key);
      if (!isNaN(numKey) && numKey > 0 && numKey <= swarm.length) {
        setSelectedIhaId(swarm[numKey - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [swarm]);

  const sendCommand = (actionType: string, targetParam: any = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const payloadTarget = actionType === "CONNECT" ? { host: ipAddress, port: Number(port) } : targetParam;
      wsRef.current.send(JSON.stringify({ action: actionType, target: payloadTarget }));
      if (actionType !== "WRITE_PARAM") addLog(`>> UPLINK: ${actionType}`);
    } else {
      addLog("⚠️ ERROR: NO ACTIVE WEBSOCKET LINK!");
    }
  };

  const handleConnect = () => {
    if (isConnected) {
      sendCommand("DISCONNECT");
      setIsConnected(false);
      setSwarm([]);
      setSelectedIhaId(null);
      addLog(">> NETWORK DISCONNECTED. SYSTEM OFFLINE.");
    } else {
      sendCommand("CONNECT");
      setIsConnected(true);
      addLog(`>> ESTABLISHING TCP LINK AT ${ipAddress}:${port}...`);
    }
  };

  const handleMapRightClick = (lat: number, lon: number) => {
    if (!isConnected) {
      addLog("⚠️ CONNECT SYSTEM TO ADD WAYPOINTS");
      return;
    }
    setActionMenu({ lat, lon });
  };

  const handleWaypointClick = (index: number) => {
    setWaypoints(prev => prev.filter((_, i) => i !== index));
    addLog(`>> WP${index + 1} DELETED FROM FLIGHT PLAN`);
  };

  const addWaypointToMission = () => {
    if (!actionMenu) return;
    setWaypoints((prev) => [...prev, { lat: actionMenu.lat, lon: actionMenu.lon, alt: missionAlt, speed: missionSpeed }]);
    addLog(`>> WP${waypoints.length + 1} LINKED AT ${actionMenu.lat.toFixed(4)}, ${actionMenu.lon.toFixed(4)}`);
    setActionMenu(null);
  };

  const executeFlyTo = () => {
    if (!actionMenu) return;
    sendCommand("FLY_TO", { lat: actionMenu.lat, lon: actionMenu.lon, alt: missionAlt, speed: missionSpeed });
    addLog(`>> COMMAND: GUIDED FLY-TO TARGET SENT`);
    setActionMenu(null);
  };

  if (!isMounted) {
    return (
      <div className="flex h-screen bg-neutral-950 text-white items-center justify-center font-mono text-sm tracking-widest text-emerald-500">
        INITIALIZING TACTICAL SYSTEMS...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-950 text-white p-2 gap-2 font-sans text-sm select-none relative">
      
      {actionMenu && (
        <div className="absolute inset-0 bg-black/60 z-[2000] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 p-5 rounded-xl shadow-2xl w-80 flex flex-col gap-4">
            <h3 className="text-cyan-400 font-bold uppercase tracking-widest text-sm border-b border-neutral-700 pb-2">Taktik Hedef Emri</h3>
            
            <div className="flex flex-col gap-2 font-mono text-xs text-neutral-400">
              <span>LAT: {actionMenu.lat.toFixed(6)}</span>
              <span>LON: {actionMenu.lon.toFixed(6)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-neutral-500">İrtifa (m)</label>
                <input type="number" value={missionAlt} onChange={(e) => setMissionAlt(Number(e.target.value))} className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 font-mono" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-neutral-500">Hız (m/s)</label>
                <input type="number" value={missionSpeed} onChange={(e) => setMissionSpeed(Number(e.target.value))} className="bg-neutral-950 border border-neutral-700 rounded p-1.5 text-white outline-none focus:border-cyan-500 font-mono" />
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button onClick={addWaypointToMission} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded text-xs transition-colors">GÖREV (WP) LİSTESİNE EKLE</button>
              <button onClick={executeFlyTo} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition-colors">DOĞRUDAN ORAYA UÇ (GUIDED)</button>
              <button onClick={() => setActionMenu(null)} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold py-1.5 rounded text-xs transition-colors">İPTAL</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT PANEL */}
      <div className="w-[320px] bg-neutral-900 rounded-xl p-4 shadow-lg border border-neutral-800 flex flex-col overflow-hidden">
        
        <div className="bg-neutral-800 p-2 rounded-lg border border-neutral-700 mb-4 shrink-0">
          <span className="text-neutral-400 text-[10px] font-bold tracking-wider uppercase mb-2 block border-b border-neutral-700 pb-1">Telemetry Link (TCP)</span>
          <div className="flex gap-2 mb-2">
            <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} disabled={isConnected} className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1 text-xs w-2/3 outline-none disabled:opacity-50" placeholder="192.168.30.x" />
            <input type="text" value={port} onChange={(e) => setPort(e.target.value)} disabled={isConnected} className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1 text-xs w-1/3 outline-none disabled:opacity-50" placeholder="5760" />
          </div>
          <button onClick={handleConnect} className={`w-full py-2 rounded text-xs font-bold transition-colors ${isConnected ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {isConnected ? "DISCONNECT LINK" : "CONNECT TO FLEET"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2 shrink-0">
          <button onClick={() => sendCommand("ARM")} disabled={!isConnected} className="bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">ARM</button>
          <button onClick={() => sendCommand("DISARM")} disabled={!isConnected} className="bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">DISARM</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
          <button onClick={() => sendCommand("TAKEOFF")} disabled={!isConnected} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">TAKE-OFF</button>
          <button onClick={() => sendCommand("SMART_RTL")} disabled={!isConnected} className="bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">SMART RTL</button>
        </div>

        <span className="text-neutral-500 text-[10px] font-bold tracking-wider uppercase mb-1 shrink-0">Node Registry</span>
        <div className="flex flex-col gap-1 overflow-y-auto mb-4 min-h-[80px] bg-neutral-950/50 rounded p-1 border border-neutral-800 custom-scrollbar">
          {!isConnected || swarm.length === 0 ? (
             <div className="flex items-center justify-center h-full text-neutral-600 text-xs italic">No nodes detected...</div>
          ) : (
            swarm.map((iha) => (
              <div key={iha.id} onClick={() => setSelectedIhaId(iha.id)} className={`p-2 rounded cursor-pointer border transition-all ${selectedIhaId === iha.id ? 'bg-cyan-900/30 border-cyan-500' : 'bg-neutral-800/50 border-neutral-700'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-xs flex items-center gap-1">{iha.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${iha.status === 'ARMED' ? 'bg-red-500/20 text-red-400' : iha.status === 'OFFLINE' ? 'bg-neutral-600 text-neutral-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{iha.status}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-black/80 rounded border border-neutral-700 flex flex-col h-48 overflow-hidden mt-auto shrink-0">
           <div className="bg-neutral-800 px-2 py-1.5 border-b border-neutral-700 flex justify-between items-center">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">MAVLink Terminal</span>
              <button onClick={() => setConsoleLogs([])} className="text-[9px] text-neutral-500 hover:text-white font-bold transition-colors">CLEAR</button>
           </div>
           <div className="p-2 overflow-y-auto flex-1 font-mono text-[10px] flex flex-col gap-1 custom-scrollbar">
              {consoleLogs.length === 0 && <span className="text-neutral-700 italic">Awaiting telemetry...</span>}
              {consoleLogs.map((log, i) => (
                 <div key={i} className="flex gap-2 break-all">
                    <span className="text-neutral-500 shrink-0">[{log.time}]</span>
                    <span className={log.msg.includes('ERROR') || log.msg.includes('⚠️') || log.msg.includes('❌') ? 'text-rose-400 font-bold' : log.msg.includes('>>') ? 'text-cyan-400' : 'text-emerald-400'}>{log.msg}</span>
                 </div>
              ))}
              <div ref={consoleEndRef} />
           </div>
        </div>
      </div>

      {/* CENTER PANEL */}
      <div className="flex-1 flex flex-col gap-2 relative z-0">
        <div className="h-[65%] bg-neutral-900 rounded-xl p-1 shadow-lg border border-neutral-800 overflow-hidden relative cursor-crosshair">
          {!isConnected && <div className="absolute inset-0 bg-black/80 z-[500] flex items-center justify-center font-bold tracking-widest text-neutral-500 text-xl">NO ACTIVE CONNECTION</div>}
          <div className="absolute top-2 left-2 z-[400] flex gap-2 pointer-events-none">
             <div className="bg-black/60 text-white px-2 py-1 rounded text-xs border border-white/10"><span className="text-amber-400">SATS:</span> {selectedIha?.sats || 0}</div>
             <div className="bg-black/60 text-white px-2 py-1 rounded text-xs border border-white/10"><span className="text-cyan-400">HDOP:</span> {selectedIha?.hdop || 99}</div>
          </div>
          
          {waypoints.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[400] bg-black/80 border border-neutral-700 p-2 rounded-lg flex gap-3 items-center backdrop-blur shadow-2xl">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">BEKLEYEN GÖREV: {waypoints.length} WP</span>
              <button onClick={() => sendCommand("UPLOAD_MISSION", waypoints)} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1 px-3 rounded text-xs transition-colors">İLET (UPLOAD)</button>
              <button onClick={() => {setWaypoints([]); addLog(">> MISSION WIPED");}} className="bg-neutral-800 hover:bg-rose-600 text-neutral-400 hover:text-white font-bold py-1 px-3 rounded text-xs transition-colors">TEMİZLE</button>
            </div>
          )}

          <MapComponent swarm={swarm} onMapRightClick={handleMapRightClick} onWaypointClick={handleWaypointClick} waypoints={waypoints} selectedIha={selectedIha} />
        </div>

        <div className="h-[35%] bg-neutral-900 rounded-xl shadow-lg border border-neutral-800 flex overflow-hidden">
           <div className="w-2/3 bg-black relative border-r border-neutral-800 flex items-center justify-center overflow-hidden">
              <span className="text-neutral-700 text-sm font-mono absolute top-2 left-2 z-10">SCOUT CAM FEED</span>
              {!isConnected ? (
                <span className="text-neutral-800 font-bold tracking-widest absolute z-10">VIDEO SIGNAL LOST</span>
              ) : selectedIha?.isScout ? (
                <img src={`http://${ipAddress.replace(/\.\d+$/, '.11')}:8080/?action=stream`} alt="Scout Feed" className="w-full h-full object-cover opacity-80" />
              ) : (
                <span className="text-neutral-600 font-bold tracking-widest absolute z-10">SELECT SCOUT NODE</span>
              )}
              {(!isConnected || !selectedIha?.isScout) && (
                <div className="w-48 h-48 border border-white/20 absolute rounded flex items-center justify-center">
                   <div className="w-2 h-2 bg-red-500/50 rounded-full animate-pulse"></div>
                </div>
              )}
           </div>
           
           <div className="w-1/3 bg-neutral-900 p-4 flex flex-col">
              <span className="text-amber-400 text-[10px] font-bold tracking-wider uppercase mb-2 border-b border-neutral-700 pb-1">Visual Intelligence Terminal</span>
              <div className="bg-black/50 p-3 rounded border border-neutral-800 flex-1 flex flex-col justify-center items-center text-center">
                 <span className="text-neutral-500 text-xs mb-1">Payload Output:</span>
                 <span className={`font-mono text-sm font-bold ${!isConnected ? 'text-neutral-700' : 'text-neutral-400'}`}>{isConnected ? qrMission : 'OFFLINE'}</span>
              </div>
           </div>
        </div>
      </div>

      {/* RIGHT PANEL: TELEMETRY & PARAMETERS */}
      <div className="w-[320px] bg-neutral-900 rounded-xl p-4 shadow-lg border border-neutral-800 flex flex-col overflow-hidden relative">
        {!isConnected && <div className="absolute inset-0 bg-neutral-900/90 z-50 flex items-center justify-center font-bold tracking-widest text-neutral-600">NO DATA LINK</div>}
        
        <div className="flex justify-between items-center mb-2 border-b border-neutral-700 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-emerald-400">{selectedIha?.name || "N/A"}</h2>
          <div className="flex bg-black/40 p-0.5 rounded border border-neutral-800 text-[10px]">
            <button onClick={() => setActiveTab("telemetry")} className={`px-2 py-1 rounded font-bold transition-colors ${activeTab === 'telemetry' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>TELEMETRY</button>
            <button onClick={() => setActiveTab("parameters")} className={`px-2 py-1 rounded font-bold transition-colors ${activeTab === 'parameters' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>PARAMS</button>
          </div>
        </div>

        {activeTab === "telemetry" ? (
          <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar pr-1">
            <div className="mb-6 relative shrink-0">
              {selectedIha?.isScout && <div className="absolute top-1 left-1 z-20 bg-amber-500 text-black text-[9px] px-1 font-bold rounded">ACTIVE SCOUT NODE</div>}
              <HUD roll={selectedIha?.roll || 0} pitch={selectedIha?.pitch || 0} yaw={selectedIha?.yaw || 0} alt={selectedIha?.alt || 0} speed={selectedIha?.speed || 0} mode={selectedIha?.mode || "OFFLINE"} />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
              <div className="bg-neutral-800 p-3 rounded border border-neutral-700">
                <span className="text-neutral-500 text-[10px] uppercase font-bold block mb-1">Altitude (ASL)</span>
                <span className="text-xl font-mono text-white">{selectedIha?.alt?.toFixed(1) || "0.0"} <span className="text-xs text-neutral-400">m</span></span>
              </div>
              <div className="bg-neutral-800 p-3 rounded border border-neutral-700">
                <span className="text-neutral-500 text-[10px] uppercase font-bold block mb-1">Speed (GS)</span>
                <span className="text-xl font-mono text-white">{selectedIha?.speed?.toFixed(1) || "0.0"} <span className="text-xs text-neutral-400">m/s</span></span>
              </div>
            </div>

            <div className="bg-neutral-800 p-3 rounded border border-neutral-700 mt-auto shrink-0">
              <div className="flex justify-between items-end mb-2">
                <span className="text-neutral-500 text-[10px] uppercase font-bold">Power Management</span>
                <span className={`text-sm font-bold ${!selectedIha ? 'text-neutral-600' : selectedIha.battery > 30 ? 'text-emerald-400' : 'text-rose-500'}`}>%{selectedIha?.battery?.toFixed(1) || "0.0"}</span>
              </div>
              <div className="w-full bg-neutral-900 rounded-full h-2 mb-3 overflow-hidden">
                <div className={`h-2 rounded-full transition-all duration-300 ${!selectedIha ? 'bg-neutral-800' : selectedIha.battery > 30 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, selectedIha?.battery || 0)}%` }}></div>
              </div>
              <div className="flex justify-between border-t border-neutral-700 pt-2 mt-2">
                 <div className="text-xs font-mono text-neutral-300"><span className="text-amber-400">P_OUT:</span> {selectedIha?.power_W?.toFixed(1) || "0.0"} W</div>
                 <div className="text-xs font-mono text-neutral-300"><span className="text-cyan-400">LOAD:</span> {selectedIha?.current_A?.toFixed(1) || "0.0"} A</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <input type="text" placeholder="Parametre Ara..." value={searchParam} onChange={(e) => setSearchParam(e.target.value.toUpperCase())} className="w-full bg-black/50 border border-neutral-700 rounded px-2 py-1.5 text-xs outline-none mb-3 text-cyan-400 placeholder-neutral-600 font-mono shrink-0" />
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2">
              {params
                .filter(p => p.id.includes(searchParam) || p.desc.toUpperCase().includes(searchParam))
                .map((param, idx) => (
                  <div key={param.id} className="bg-neutral-950 p-2 rounded border border-neutral-800 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs text-amber-400 font-bold">{param.id}</span>
                      <div className="flex gap-1 items-center">
                        <input type="number" step="any" value={param.value} onChange={(e) => setParams(prev => prev.map(p => p.id === param.id ? {...p, value: Number(e.target.value)} : p))} className="bg-neutral-850 border border-neutral-700 rounded text-center font-mono text-xs w-16 py-0.5 text-white outline-none focus:border-cyan-500" />
                        <button onClick={() => sendCommand("WRITE_PARAM", { param_id: param.id, param_value: param.value })} className="bg-cyan-700 hover:bg-cyan-600 text-white text-[9px] font-bold px-1.5 py-1 rounded transition-colors">SET</button>
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-500 leading-tight">{param.desc}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}