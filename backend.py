import asyncio
import json
import math
from fastapi import FastAPI, WebSocket
import uvicorn
from pymavlink import mavutil

app = FastAPI()

# Başlangıçta sistem tamamen kapalı ve sıfırlanmış durumda (Simülasyon YOK)
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

async def mavlink_listener():
    """Gerçek araçlardan gelen MAVLink verilerini okur (Blocking olmadan)"""
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

                    # Gerçek telemetri atamaları
                    if msg_type == 'GLOBAL_POSITION_INT':
                        swarm_data[idx]["lat"] = msg.lat / 1e7
                        swarm_data[idx]["lon"] = msg.lon / 1e7
                        swarm_data[idx]["alt"] = msg.alt / 1000.0
                        
                        # Anlık hız (X, Y, Z vektörlerinden bileşke hız)
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
                            
                        # Custom Mode ayrıştırması eklenebilir (ArduPilot vs PX4)
                        swarm_data[idx]["mode"] = "ONLINE" 

                except Exception as e:
                    print(f"Telemetry Read Error on UAV-{drone_id}: {e}")
        
        await asyncio.sleep(0.01) # Yüksek frekanslı donanım okuma döngüsü

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    global is_connected
    
    async def send_telemetry():
        try:
            while True:
                # Sadece bağlıysa ve araç aktifse veriyi gönder, yoksa boş gönder
                formatted_data = [{**iha, "battery": round(iha["battery"], 1), "alt": round(iha["alt"], 1), "speed": round(iha["speed"], 1), "power_W": round(iha["power_W"], 1), "hdop": round(iha["hdop"], 2)} for iha in swarm_data]
                
                await websocket.send_text(json.dumps(formatted_data))
                await asyncio.sleep(0.2) # 5Hz Arayüz Yenileme
        except Exception:
            pass

    async def receive_commands():
        global is_connected
        try:
            while True:
                data = await websocket.receive_text()
                cmd = json.loads(data)
                action = cmd['action']
                target = cmd.get('target')

                print(f"UI COMMAND RECEIVED: {action}")

                if action == "CONNECT":
                    print("Connecting to Real UAVs via TCP...")

                    # Frontend CONNECT target olarak artık { host, port } gönderiyor.
                    # Eski string formatı gelirse de bozulmasın diye iki formatı da destekliyoruz.
                    if isinstance(target, dict):
                        base_ip = target.get("host") or "192.168.30.11"
                        port = int(target.get("port") or 5760)
                    else:
                        base_ip = target if target else "192.168.30.11"
                        port = 5760

                   # base_ip_prefix = base_ip.rsplit('.', 1)[0] # "192.168.30" kısmını alır

                    #for i in range(1, 4): # 3 araç için bağlantı denemesi
                     #   ip = f"{base_ip_prefix}.{10 + i}" # 192.168.30.11, .12, .13 mantığı
                      #  try:
                       #     conn = mavutil.mavlink_connection(f'tcp:{ip}:{port}', autoreconnect=True)
                        #    conn.wait_heartbeat(timeout=3)
                         #   connections[i] = conn
                          #  swarm_data[i-1]["status"] = "CONNECTED"
                           # print(f"Connected to UAV-{i} at {ip}:{port}")
                       # except Exception as e:
                        #    print(f"Failed to connect UAV-{i} at {ip}:{port}: {e}")
                         #   swarm_data[i-1]["status"] = "OFFLINE"
                    # SITL localhost ise portları 5760, 5770, 5780 olarak dener.
# Gerçek drone IP ise 192.168.30.11, .12, .13 mantığıyla çalışır.
                    if base_ip in ["127.0.0.1", "localhost"]:
                        connection_targets = [
                            ("udpin:127.0.0.1:14550", 1),
                            ("udpin:127.0.0.1:14560", 2),
                            ("udpin:127.0.0.1:14570", 3),
                        ]
                    else:
                        base_ip_prefix = base_ip.rsplit(".", 1)[0]
                        connection_targets = [
                            (f"tcp:{base_ip_prefix}.11:{port}", 1),
                            (f"tcp:{base_ip_prefix}.12:{port}", 2),
                            (f"tcp:{base_ip_prefix}.13:{port}", 3),
                        ]

                    for conn_str, drone_id in connection_targets:
                        try:
                            conn = mavutil.mavlink_connection(conn_str, autoreconnect=True)
                            conn.wait_heartbeat(timeout=5)

                            connections[drone_id] = conn
                            swarm_data[drone_id - 1]["status"] = "CONNECTED"

                            print(f"Connected to UAV-{drone_id} via {conn_str}")

                        except Exception as e:
                            print(f"Failed to connect UAV-{drone_id} via {conn_str}: {e}")
                            swarm_data[drone_id - 1]["status"] = "OFFLINE"

                    is_connected = True
                
                elif action == "DISCONNECT":
                    connections.clear()
                    is_connected = False
                    for iha in swarm_data:
                        iha["status"] = "OFFLINE"
                    print("Disconnected from all UAVs.")

                # GERÇEK UÇUŞ KOMUTLARI (UPLINK)
                elif action == "ARM" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
                
                elif action == "DISARM" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
                
                elif action == "TAKEOFF" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 20)
                
                elif action == "RTL" and is_connected:
                    for conn in connections.values():
                        conn.mav.command_long_send(conn.target_system, conn.target_component, mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH, 0, 0, 0, 0, 0, 0, 0, 0)

        except Exception as e:
            print(f"WebSocket Error: {e}")

    task1 = asyncio.create_task(send_telemetry())
    task2 = asyncio.create_task(receive_commands())
    task3 = asyncio.create_task(mavlink_listener())
    await asyncio.gather(task1, task2, task3)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)