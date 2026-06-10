import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconShadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});

const targetIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});

const trailColors = ["#22d3ee", "#34d399", "#f43f5e", "#fbbf24", "#a855f7"];

// SAĞ TIK (Context Menu) ALGILAYICI
function ClickEvents({ onMapRightClick }: { onMapRightClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    contextmenu(e) {
      onMapRightClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function MapCenterer({ selectedIha }: { selectedIha: any }) {
  const map = useMap();
  const prevId = useRef<number | null>(null);

  useEffect(() => {
    if (selectedIha && selectedIha.lat !== 0 && selectedIha.lon !== 0) {
      if (prevId.current !== selectedIha.id) {
        map.flyTo([selectedIha.lat, selectedIha.lon], 19, { animate: true, duration: 1.5 });
        prevId.current = selectedIha.id;
      }
    }
  }, [selectedIha, map]);
  return null;
}

export default function MapComponent({ swarm, onMapRightClick, onWaypointClick, waypoints, selectedIha }: { swarm: any[], onMapRightClick: (lat: number, lon: number) => void, onWaypointClick: (index: number) => void, waypoints: {lat: number, lon: number}[], selectedIha: any }) {
  const center = [40.7654, 29.9408];

  return (
    <MapContainer center={[center[0], center[1]] as any} zoom={14} maxZoom={24} style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 10 }}>
      <TileLayer 
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
        attribution='&copy; CARTO' 
        maxNativeZoom={19} 
        maxZoom={24}       
      />
      
      {/* Sağ Tık Olayını Haritaya Bağlıyoruz */}
      <ClickEvents onMapRightClick={onMapRightClick} />
      <MapCenterer selectedIha={selectedIha} />

      {swarm.map((iha, index) => (
        iha.trail && iha.trail.length > 1 && (
          <Polyline key={`line-${iha.id}`} positions={iha.trail} pathOptions={{ color: trailColors[index % trailColors.length], weight: 3, opacity: 0.8, dashArray: "5, 7" }} />
        )
      ))}

      {waypoints.length > 1 && (
         <Polyline positions={waypoints.map(w => [w.lat, w.lon])} pathOptions={{ color: '#facc15', weight: 2, dashArray: "4 4" }} />
      )}

      {/* PİNE TIKLAYINCA SİLME OLAYI */}
      {waypoints.map((wp, i) => (
        <Marker 
          key={`wp-${i}`} 
          position={[wp.lat, wp.lon]} 
          icon={targetIcon}
          eventHandlers={{
            click: () => onWaypointClick(i) // Pine sol tıklanınca tetiklenir
          }}
        >
          <Popup><b className="text-red-600">Waypoint {i + 1}</b><br/><span className="text-xs text-gray-500">Silmek için tıkladınız.</span></Popup>
        </Marker>
      ))}

      {swarm.map((iha) => (
        <Marker key={`marker-${iha.id}`} position={[iha.lat, iha.lon] as any} icon={customIcon}>
          <Popup>
            <div className="text-gray-900 font-sans"><b className="text-cyan-600">{iha.name}</b><br/>Durum: {iha.status}</div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}