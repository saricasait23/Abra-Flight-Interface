import asyncio
import json
import math
from fastapi import FastAPI, WebSocket
import uvicorn
from pymavlink import mavutil

app = FastAPI()

def create_blank_drone(id, name):
    return {
        "id": id, "name": name, "isScout": id == 1, "status": "OFFLINE", "mode": "UNKNOWN",
        "battery": 0.0, "current_A": 0.0, "power_W": 0.0,
        "alt": 0.0, "speed": 0.0, "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
        "lat": 40.7654, "lon": 29.9408, "sats": 0, "hdop": 99.9, "trail": []
    }

swarm_data = [
    create_blank_drone(1, "UAV-1"),
    create_blank_drone(2, "UAV-2"),
    create_blank_drone(3, "UAV-3"),
]

connections = {}
is_connected = False
console_queue = [] # Arayüzdeki MAVLink Terminali için mesaj kuyruğu

async def mavlink_listener():
    """Uçuş kontrolcülerinden gelen MAVLink paketlerini dinler"""
    global is_connected
    while True:
        if is_connected and connections:
            for drone_id, conn in list(connections.items()):
                try:
                    msg = conn.recv_match(blocking=False)
                    if not msg:
                        continue
                    
                    msg_type = msg.get_type()
                    idx = drone_id - 1

                    if msg_type == 'GLOBAL_POSITION_INT':
                        swarm_data[idx]["lat"] = msg.lat / 1e7
                        swarm_data[idx]["lon"] = msg.lon / 1e7
                        swarm_data[idx]["alt"] = msg.alt / 1000.0
                        vx, vy, vz = msg.vx / 100.0, msg.vy / 100.0, msg.vz / 100.0
                        swarm_data[idx]["speed"] = math.sqrt(vx**2 + vy**2 + vz**2)
                    
                    elif msg_type == 'ATTITUDE':
                        swarm_data[idx]["roll"] = math.degrees(msg.roll)
                        swarm_data[idx]["pitch"] = math.degrees(msg.pitch)
                        swarm_data[idx]["yaw"] = math.degrees(msg.yaw)

                    elif msg_type == 'SYS_STATUS':
                        swarm_data[idx]["battery"] = msg.battery_remaining
                        swarm_data[idx]["current_A"] = msg.current_battery / 100.0
                        swarm_data[idx]["power_W"] = swarm_data[idx]["current_A"] * (msg.voltage_battery / 1000.0)

                    elif msg_type == 'GPS_RAW_INT':
                        swarm_data[idx]["sats"] = msg.satellites_visible
                        swarm_data[idx]["hdop"] = msg.eph / 100.0

                    elif msg_type == 'HEARTBEAT':
                        if msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED:
                            swarm_data[idx]["status"] = "ARMED"
                        else:
                            swarm_data[idx]["status"] = "DISARMED"
                        swarm_data[idx]["mode"] = "ONLINE" 
                        
                    elif msg_type == 'STATUSTEXT':
                        text = msg.text
                        console_queue.append(f"[UAV-{drone_id}] {text}")

                except Exception:
                    pass
        await asyncio.sleep(0.01)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    global is_connected
    
    async def send_telemetry():
        """Arayüze hem araç verilerini hem de terminal loglarını yollar"""
        try:
            while True:
                formatted_data = [{**iha, "battery": round(iha["battery"], 1), "alt": round(iha["alt"], 1), "speed": round(iha["speed"], 1), "power_W": round(iha["power_W"], 1), "hdop": round(iha["hdop"], 2)} for iha in swarm_data]
                
                payload = {
                    "type": "telemetry",
                    "data": formatted_data
                }
                
                if console_queue:
                    payload["console"] = list(console_queue)
                    console_queue.clear()

                await websocket.send_text(json.dumps(payload))
                await asyncio.sleep(0.2)
        except Exception:
            pass

    async def receive_commands():
        """Arayüzden gelen komutları işler"""
        global is_connected
        try:
            while True:
                data = await websocket.receive_text()
                cmd = json.loads(data)
                action = cmd['action']
                target = cmd.get('target')

                if action == "CONNECT":
                    if isinstance(target, dict):
                        base_ip = target.get("host", "192.168.30.11")
                        port = target.get("port", 5760)
                    else:
                        base_ip = target if target else "192.168.30.11"
                        port = 5760

                    if base_ip in ["127.0.0.1", "localhost"]:
                        # SIMÜLASYON (SITL) BAĞLANTISI
                        console_queue.append(">> SITL SIMULATION LINK INITIALIZED")
                        successful_conns = 0
                        ports = [14550, 14560, 14570]
                        for i in range(1, 4):
                            try:
                                connections[i] = mavutil.mavlink_connection(f'udpin:0.0.0.0:{ports[i-1]}')
                                swarm_data[i-1]["status"] = "CONNECTED"
                                successful_conns += 1
                            except Exception:
                                swarm_data[i-1]["status"] = "OFFLINE"
                        if successful_conns > 0:
                            is_connected = True
                    else:
                        # GERÇEK SAHA BAĞLANTISI
                        console_queue.append(f">> HEDEF ARANIYOR: {base_ip}:{port}")
                        try:
                            # 1. Aşama: Sadece arayüze yazdığın hedefe TCP kapısı aç
                            conn = mavutil.mavlink_connection(f'tcp:{base_ip}:{port}')
                            
                            # 2. Aşama: Otopilottan MAVLink Heartbeat (Kalp Atışı) gelene kadar bekle
                            console_queue.append(">> HEARTBEAT (KALP ATIŞI) BEKLENİYOR...")
                            msg = conn.wait_heartbeat(timeout=3.0)
                            
                            if msg:
                                # Bağlantı başarılı! IP'yi UAV-1'e ata ve sistemi başlat.
                                connections[1] = conn
                                swarm_data[0]["status"] = "CONNECTED"
                                is_connected = True
                                console_queue.append(f"✓ BAĞLANTI KESİN OLARAK ONAYLANDI: {base_ip}")
                            else:
                                # Kapı açıldı ama içeride dron yok veya cevap vermiyor
                                is_connected = False
                                swarm_data[0]["status"] = "OFFLINE"
                                console_queue.append(f"❌ HATA: CİHAZ BULUNAMADI VEYA CEVAP VERMİYOR")
                                await websocket.send_text(json.dumps({"type": "connection_failed"}))
                                
                        except Exception as e:
                            # Ağda cihaza ulaşılamadı (Örn: Yanlış IP veya Güvenlik Duvarı engeli)
                            is_connected = False
                            console_queue.append(f"⚠️ AĞ HATASI: {e}")
                            await websocket.send_text(json.dumps({"type": "connection_failed"}))
                
                elif action == "DISCONNECT":
                    connections.clear()
                    is_connected = False
                    for iha in swarm_data:
                        iha["status"] = "OFFLINE"
                    console_queue.append(">> ALL CONNECTIONS TERMINATED")

                elif action == "ARM" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
                
                elif action == "DISARM" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
                
                elif action == "TAKEOFF" and is_connected:
                    for conn in connections.values():
                        conn.mav.set_mode_send(conn.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4) 
                        asyncio.sleep(0.5)
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 20)
                
                elif action == "SMART_RTL" and is_connected:
                    for conn in connections.values():
                        conn.mav.set_mode_send(conn.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 21)

                elif action == "WRITE_PARAM" and is_connected:
                    param_id = target.get("param_id")
                    param_value = float(target.get("param_value"))
                    console_queue.append(f">> SWARM PARAM WRITE INITIATED: {param_id} -> {param_value}")
                    for drone_id, conn in connections.items():
                        try:
                            conn.mav.param_set_send(conn.target_system, conn.target_component, param_id.encode('utf-8'), param_value, mavutil.mavlink.MAV_PARAM_TYPE_REAL32)
                        except Exception:
                            pass

                elif action == "FLY_TO" and is_connected:
                    lat = target.get("lat")
                    lon = target.get("lon")
                    alt = target.get("alt")
                    console_queue.append(f">> COMMAND: GUIDED FLY-TO TARGET: {lat:.4f}, {lon:.4f}")
                    for conn in connections.values():
                        try:
                            conn.mav.set_mode_send(conn.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 15)
                            conn.mav.mission_item_int_send(conn.target_system, conn.target_component, 0, mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT, mavutil.mavlink.MAV_CMD_NAV_WAYPOINT, 2, 0, 0, 0, 0, 0, int(lat * 1e7), int(lon * 1e7), alt)
                        except Exception:
                            pass

        except Exception as e:
            pass

    task1 = asyncio.create_task(send_telemetry())
    task2 = asyncio.create_task(receive_commands())
    task3 = asyncio.create_task(mavlink_listener())
    await asyncio.gather(task1, task2, task3)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)