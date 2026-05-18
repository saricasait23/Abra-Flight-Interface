"use client";
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import HUD from '../components/HUD';

const MapComponent = dynamic(() => import('../components/MapComponent'), { ssr: false });

export default function Home() {
  // Başlangıçta boş bir liste (Sistem tamamen kapalı)
  const [swarm, setSwarm] = useState<any[]>([]);

  const [selectedIhaId, setSelectedIhaId] = useState<number | null>(null);
  const selectedIha = swarm.find((i) => i.id === selectedIhaId) || null;
  const [lastCommand, setLastCommand] = useState("SYSTEM STANDBY. AWAITING TELEMETRY LINK..."); 
  
  const [ipAddress, setIpAddress] = useState("192.168.30.11");
  const [port, setPort] = useState("5760");
  const [isConnected, setIsConnected] = useState(false);
  const [waypoints, setWaypoints] = useState<{lat: number, lon: number, alt: number, speed: number}[]>([]);
  const [qrMission, setQrMission] = useState("AWAITING QR SCAN...");

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws");
    wsRef.current = ws;

    ws.onopen = () => {
      setLastCommand(">> WEBSOCKET READY. BACKEND CONNECTED.");
    };

    ws.onmessage = (event) => {
      try {
        const incomingData = JSON.parse(event.data);

        setSwarm(incomingData);

        setSelectedIhaId((currentId) => {
          if (!currentId && incomingData.length > 0) {
            return incomingData[0].id;
          }
          return currentId;
        });
      } catch {
        setLastCommand("⚠️ INVALID TELEMETRY DATA RECEIVED");
      }
    };

    ws.onerror = () => {
      setLastCommand("⚠️ BACKEND NOT FOUND. START PYTHON SERVER FIRST.");
    };

    ws.onclose = () => {
      setLastCommand(">> WEBSOCKET CLOSED.");
    };

    return () => ws.close();
  }, []);

  const sendCommand = (actionType: string, targetParam: any = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // CONNECT komutunda IP adresini arka plana gönder
      const payloadTarget =
        actionType === "CONNECT"
          ? { host: ipAddress, port: Number(port) }
          : targetParam;

      wsRef.current.send(
        JSON.stringify({
          action: actionType,
          target: payloadTarget,
        })
      );
      setLastCommand(`>> UPLINK: ${actionType}`);
    } else {
      setLastCommand("⚠️ ERROR: NO ACTIVE WEBSOCKET LINK!");
    }
  };

  const handleConnect = () => {
    if (isConnected) {
      sendCommand("DISCONNECT");
      setIsConnected(false);
      setSwarm([]); // Bağlantı kesilince arayüzü sıfırla
      setSelectedIhaId(null);
      setLastCommand(">> NETWORK DISCONNECTED. SYSTEM OFFLINE.");
    } else {
      sendCommand("CONNECT");
      setIsConnected(true);
      setLastCommand(`>> ESTABLISHING TCP LINK AT ${ipAddress}:${port}...`);
    }
  };

  const setScoutDrone = (id: number) => {
    // Sadece arayüz tarafındaki scout bayrağını değiştiririz
    setSwarm(prev => prev.map(iha => ({...iha, isScout: iha.id === id})));
    setLastCommand(`>> SCOUT ROLE ASSIGNED TO UAV-${id}`);
  };

  const handleMapClick = (lat: number, lon: number) => {
    if (!isConnected) {
      setLastCommand("⚠️ CONNECT SYSTEM TO ADD WAYPOINTS");
      return;
    }
    setWaypoints((prev) => [...prev, { lat, lon, alt: 20, speed: 15 }]);
    setLastCommand(`>> WP${waypoints.length + 1} LINKED AT GEO-COORDINATES`);
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white p-2 gap-2 font-sans text-sm select-none">
      
      {/* LEFT PANEL */}
      <div className="w-[320px] bg-neutral-900 rounded-xl p-4 shadow-lg border border-neutral-800 flex flex-col overflow-y-auto">
        
        {/* NETWORK CONNECTOR */}
        <div className="bg-neutral-800 p-2 rounded-lg border border-neutral-700 mb-4">
          <span className="text-neutral-400 text-[10px] font-bold tracking-wider uppercase mb-2 block border-b border-neutral-700 pb-1">Telemetry Link (TCP)</span>
          <div className="flex gap-2 mb-2">
            <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} disabled={isConnected} className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1 text-xs w-2/3 outline-none disabled:opacity-50" placeholder="192.168.30.x" />
            <input type="text" value={port} onChange={(e) => setPort(e.target.value)} disabled={isConnected} className="bg-neutral-900 border border-neutral-600 rounded px-2 py-1 text-xs w-1/3 outline-none disabled:opacity-50" placeholder="5760" />
          </div>
          <button onClick={handleConnect} className={`w-full py-2 rounded text-xs font-bold transition-colors ${isConnected ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {isConnected ? "DISCONNECT LINK" : "CONNECT TO FLEET"}
          </button>
        </div>

        {/* FLIGHT CONTROLS */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button onClick={() => sendCommand("ARM")} disabled={!isConnected} className="bg-amber-600 hover:bg-amber-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">ARM</button>
          <button onClick={() => sendCommand("DISARM")} disabled={!isConnected} className="bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">DISARM</button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => sendCommand("TAKEOFF")} disabled={!isConnected} className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">TAKE-OFF</button>
          <button onClick={() => sendCommand("RTL")} disabled={!isConnected} className="bg-rose-600 hover:bg-rose-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-1.5 rounded text-xs font-bold transition-colors">RTL (HOME)</button>
        </div>

        {/* MISSION EDITOR */}
        <div className={`bg-neutral-800 p-2 rounded-lg border border-neutral-700 mb-4 flex flex-col max-h-[280px] ${!isConnected ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex justify-between items-center mb-2 border-b border-neutral-700 pb-1">
             <span className="text-neutral-400 text-[10px] font-bold tracking-wider uppercase">Mission Editor (WP: {waypoints.length})</span>
             <button onClick={() => {setWaypoints([]); setLastCommand(">> MISSION WIPED");}} className="text-rose-400 text-[10px] hover:text-rose-300">Clear</button>
          </div>
          <div className="overflow-y-auto flex-1 flex flex-col gap-1.5 mb-2 pr-1 custom-scrollbar">
            {waypoints.length === 0 && <span className="text-xs text-neutral-600 italic text-center py-4">No waypoints set.</span>}
            {waypoints.map((wp, idx) => (
              <div key={idx} className="bg-neutral-950 p-2 rounded border border-neutral-700 text-[11px] flex flex-col gap-1.5">
                <div className="flex justify-between text-cyan-400 font-bold">
                  <span>Waypoint #{idx + 1}</span>
                  <span className="text-neutral-500 font-mono">{wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-col gap-1">
                    <span className="text-neutral-500 text-[9px]">Alt:</span>
                    <input type="number" value={wp.alt} onChange={(e) => setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, alt: Number(e.target.value) } : w))} className="bg-neutral-800 rounded px-1 text-white w-full outline-none" />
                  </div>
                  <div className="flex items-col gap-1">
                    <span className="text-neutral-500 text-[9px]">Spd:</span>
                    <input type="number" value={wp.speed} onChange={(e) => setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, speed: Number(e.target.value) } : w))} className="bg-neutral-800 rounded px-1 text-white w-full outline-none" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => sendCommand("UPLOAD_MISSION", waypoints)} disabled={waypoints.length === 0} className={`w-full py-2 rounded text-xs font-bold transition-colors ${waypoints.length > 0 ? 'bg-cyan-600 text-white' : 'bg-neutral-700 text-neutral-500'}`}>
            {waypoints.length > 0 ? `Transmit Mission` : `Waiting for Data`}
          </button>
        </div>

        {/* NODE REGISTRY (Araç Listesi) */}
        <span className="text-neutral-500 text-[10px] font-bold tracking-wider uppercase mb-1 mt-auto">Node Registry</span>
        <div className="flex flex-col gap-1 overflow-y-auto mb-2 min-h-[100px] bg-neutral-950/50 rounded p-1 border border-neutral-800">
          {!isConnected || swarm.length === 0 ? (
             <div className="flex items-center justify-center h-full text-neutral-600 text-xs italic">No nodes detected...</div>
          ) : (
            swarm.map((iha) => (
              <div key={iha.id} onClick={() => setSelectedIhaId(iha.id)} className={`p-2 rounded cursor-pointer border transition-all ${selectedIhaId === iha.id ? 'bg-cyan-900/30 border-cyan-500' : 'bg-neutral-800/50 border-neutral-700'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-xs flex items-center gap-1">
                    {iha.name} {iha.isScout && <span title="Payload Tracker Active" className="text-amber-400 text-[10px]">📷</span>}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${iha.status === 'ARMED' ? 'bg-red-500/20 text-red-400' : iha.status === 'OFFLINE' ? 'bg-neutral-600 text-neutral-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{iha.status}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-2 bg-black/50 rounded border border-neutral-800">
          <p className="text-emerald-400 text-[11px] font-mono break-all">{lastCommand}</p>
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
          <MapComponent swarm={swarm} onMapClick={handleMapClick} waypoints={waypoints} />
        </div>

        <div className="h-[35%] bg-neutral-900 rounded-xl shadow-lg border border-neutral-800 flex overflow-hidden">
           <div className="w-2/3 bg-black relative border-r border-neutral-800 flex items-center justify-center">
              <span className="text-neutral-700 text-sm font-mono absolute top-2 left-2">SCOUT CAM FEED</span>
              {!isConnected && <span className="text-neutral-800 font-bold tracking-widest absolute">VIDEO SIGNAL LOST</span>}
              <div className="w-48 h-48 border border-white/20 absolute rounded flex items-center justify-center">
                 <div className="w-2 h-2 bg-red-500/50 rounded-full"></div>
              </div>
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

      {/* RIGHT PANEL: TELEMETRY (Boş Durum Yönetimli) */}
      <div className="w-[320px] bg-neutral-900 rounded-xl p-4 shadow-lg border border-neutral-800 flex flex-col overflow-y-auto relative">
        {!isConnected && <div className="absolute inset-0 bg-neutral-900/90 z-50 flex items-center justify-center font-bold tracking-widest text-neutral-600">NO TELEMETRY DATA</div>}
        
        <h2 className="text-lg font-bold mb-4 text-emerald-400 border-b border-neutral-700 pb-2">{selectedIha?.name || "N/A"}</h2>
        
        <div className="mb-6 relative">
          {selectedIha?.isScout && <div className="absolute top-1 left-1 z-20 bg-amber-500 text-black text-[9px] px-1 font-bold rounded">ACTIVE SCOUT NODE</div>}
          <HUD roll={selectedIha?.roll || 0} pitch={selectedIha?.pitch || 0} yaw={selectedIha?.yaw || 0} alt={selectedIha?.alt || 0} speed={selectedIha?.speed || 0} mode={selectedIha?.mode || "OFFLINE"} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-neutral-800 p-3 rounded border border-neutral-700">
            <span className="text-neutral-500 text-[10px] uppercase font-bold block mb-1">Altitude (ASL)</span>
            <span className="text-xl font-mono text-white">{selectedIha?.alt?.toFixed(1) || "0.0"} <span className="text-xs text-neutral-400">m</span></span>
          </div>
          <div className="bg-neutral-800 p-3 rounded border border-neutral-700">
            <span className="text-neutral-500 text-[10px] uppercase font-bold block mb-1">Speed (GS)</span>
            <span className="text-xl font-mono text-white">{selectedIha?.speed?.toFixed(1) || "0.0"} <span className="text-xs text-neutral-400">m/s</span></span>
          </div>
        </div>

        <div className="bg-neutral-800 p-3 rounded border border-neutral-700 mt-auto">
          <div className="flex justify-between items-end mb-2">
            <span className="text-neutral-500 text-[10px] uppercase font-bold">Power Management</span>
            <span className={`text-sm font-bold ${!selectedIha ? 'text-neutral-600' : selectedIha.battery > 30 ? 'text-emerald-400' : 'text-rose-500'}`}>%{selectedIha?.battery?.toFixed(1) || "0.0"}</span>
          </div>
          <div className="w-full bg-neutral-900 rounded-full h-2 mb-3 overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-300 ${!selectedIha ? 'bg-neutral-800' : selectedIha.battery > 30 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${Math.max(0, selectedIha?.battery || 0)}%` }}></div>
          </div>
          <div className="flex justify-between border-t border-neutral-700 pt-2 mt-2">
             <div className="text-xs font-mono text-neutral-300"><span className="text-amber-400">P:</span> {selectedIha?.power_W?.toFixed(1) || "0.0"} W</div>
             <div className="text-xs font-mono text-neutral-300">{selectedIha?.current_A?.toFixed(1) || "0.0"} A</div>
          </div>
        </div>
      </div>
    </div>
  );
}