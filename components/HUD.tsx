import React from 'react';

interface HUDProps {
  roll: number;
  pitch: number;
  yaw: number;
  alt: number;
  speed: number;
  mode: string;
}

export default function HUD({ roll, pitch, yaw, alt, speed, mode }: HUDProps) {
  return (
    <div className="relative w-full h-48 bg-neutral-800 rounded-lg overflow-hidden border border-neutral-700 shadow-inner select-none">
      {/* Gökyüzü ve Yer (Suni Ufuk Arka Planı) */}
      <div 
        className="absolute inset-0 w-[200%] h-[200%] -top-[50%] -left-[50%] transition-transform duration-100 ease-linear"
        style={{ transform: `rotate(${roll}deg) translateY(${pitch * 2}px)` }}
      >
        <div className="w-full h-1/2 bg-sky-500 border-b-2 border-white"></div>
        <div className="w-full h-1/2 bg-lime-700"></div>
      </div>

      {/* Merkez Gösterge (Sabit Uçak İkonu/Çizgisi) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-16 h-1 bg-red-600 relative">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-2 h-2 border-l-2 border-t-2 border-r-2 border-red-600"></div>
        </div>
      </div>

      {/* Uçuş Modu Overlay */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 font-bold text-red-600 text-lg drop-shadow-md tracking-widest z-10">
        {mode}
      </div>

      {/* Hız Bantı (Sol) */}
      <div className="absolute top-0 left-0 bottom-0 w-12 bg-black/40 border-r border-white/20 flex flex-col justify-center items-center text-white font-mono text-sm z-10">
        <div className="bg-black border border-white px-1 py-0.5">{speed.toFixed(1)}</div>
        <span className="text-[10px] text-neutral-400 mt-1">m/s</span>
      </div>

      {/* İrtifa Bantı (Sağ) */}
      <div className="absolute top-0 right-0 bottom-0 w-12 bg-black/40 border-l border-white/20 flex flex-col justify-center items-center text-white font-mono text-sm z-10">
        <div className="bg-black border border-white px-1 py-0.5">{alt.toFixed(1)}</div>
        <span className="text-[10px] text-neutral-400 mt-1">m</span>
      </div>

      {/* Heading / Yaw (Alt) */}
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-black/60 flex items-center justify-center text-white font-mono text-xs z-10">
        YAW: {yaw.toFixed(0)}°
      </div>
    </div>
  );
}