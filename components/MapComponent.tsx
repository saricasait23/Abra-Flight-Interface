import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconShadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});

// WP Noktaları için Kırmızı İkon
const targetIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
});

const trailColors = ["#22d3ee", "#34d399", "#f43f5e", "#fbbf24", "#a855f7"];

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function MapComponent({ swarm, onMapClick, waypoints }: { swarm: any[], onMapClick: (lat: number, lon: number) => void, waypoints: {lat: number, lon: number}[] }) {
  const center = [40.7654, 29.9408];

  return (
    <MapContainer center={[center[0], center[1]] as any} zoom={14} style={{ height: '100%', width: '100%', borderRadius: '0.5rem', zIndex: 10 }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
      <ClickHandler onMapClick={onMapClick} />

      {/* İHA Rota İzleri */}
      {swarm.map((iha, index) => (
        iha.trail && iha.trail.length > 1 && (
          <Polyline key={`line-${iha.id}`} positions={iha.trail} pathOptions={{ color: trailColors[index % trailColors.length], weight: 3, opacity: 0.8, dashArray: "5, 7" }} />
        )
      ))}

      {/* PLANLANAN GÖREV (MISSION) ÇİZGİSİ */}
      {waypoints.length > 1 && (
         <Polyline positions={waypoints.map(w => [w.lat, w.lon])} pathOptions={{ color: '#facc15', weight: 2, dashArray: "4 4" }} />
      )}

      {/* PLANLANAN GÖREV NOKTALARI (PİNLER) */}
      {waypoints.map((wp, i) => (
        <Marker key={`wp-${i}`} position={[wp.lat, wp.lon]} icon={targetIcon}>
          <Popup><b className="text-red-600">Waypoint {i + 1}</b></Popup>
        </Marker>
      ))}

      {/* İHA PİNLERİ */}
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