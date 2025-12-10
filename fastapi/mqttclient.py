#!/usr/bin/env python3
import json
import argparse
import sys
import time
import paho.mqtt.client as mqtt
import requests  # to call FastAPI over HTTP

def main():
    ap = argparse.ArgumentParser(description="Forward IoT ingress → FastAPI → Unity (conditional pass-through)")
    ap.add_argument("--host", default="127.0.0.1", help="Pi's MQTT broker host")
    ap.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    ap.add_argument("--gateway-id", default="pi-01", help="Gateway (Pi) ID")
    ap.add_argument("--gateway-ip", default="192.168.1.1", help="Gateway (Pi) IP address")
    ap.add_argument("--device-ip", default="192.168.1.100", help="Default IoT device IP (if not in payload)")
    ap.add_argument("--ingress-prefix", default="edge", help="Ingress root (edge/<gw>/in/<dev>)")
    ap.add_argument("--unity-prefix",   default="plx/reading", help="Unity topic root (plx/reading/<dev>)")
    ap.add_argument("--qos", type=int, default=1, choices=[0, 1, 2])

    ap.add_argument(
        "--api-url",
        default="http://127.0.0.1:8000/analyze_vitals",
        help="FastAPI inference endpoint (POST JSON here first)",
    )

    args = ap.parse_args()

    device_stats = {}
    ingress_prefix = args.ingress_prefix
    unity_prefix   = args.unity_prefix
    api_url        = args.api_url

    topic_ingress = f"{ingress_prefix}/{args.gateway_id}/in/#"
    client = mqtt.Client(client_id=f"pi-forward-{args.gateway_id}", clean_session=True)

    # -----------------------------
    # Helper: Build network metadata
    # -----------------------------
    def build_network_metadata(device_id: str, mqtt_topic: str, payload_size: int):
        current_time = time.time()

        if device_id not in device_stats:
            device_stats[device_id] = {
                "first_seen": current_time,
                "last_seen": current_time,
                "pkt_count": 0,
                "byte_count": 0,
                "last_window_time": current_time,
                "window_pkt_count": 0,
            }

        stats = device_stats[device_id]

        time_since_last = current_time - stats["last_seen"]

        stats["last_seen"] = current_time
        stats["pkt_count"] += 1
        stats["byte_count"] += payload_size

        if current_time - stats["last_window_time"] > 1.0:
            stats["window_pkt_count"] = 1
            stats["last_window_time"] = current_time
        else:
            stats["window_pkt_count"] += 1

        window_duration = current_time - stats["last_window_time"]
        current_rate = stats["window_pkt_count"] / max(window_duration, 0.001)

        device_ip = args.device_ip

        flow_duration = current_time - stats["first_seen"]
        avg_rate = stats["pkt_count"] / max(flow_duration, 0.001)

        network_metadata = {
            "src_ip": device_ip,
            "dst_ip": args.gateway_ip,
            "src_port": 1883,
            "dst_port": 8000,
            "pkt_size": payload_size,
            "mqtt_topic": mqtt_topic,
            "mqtt_broker": args.host,
            "gateway_id": args.gateway_id,
            "flow_pkt_count": stats["pkt_count"],
            "flow_byte_count": stats["byte_count"],
            "flow_duration": flow_duration,
            "time_since_last_pkt": time_since_last,
            "current_rate": current_rate,
            "avg_rate": avg_rate,
            "timestamp": current_time,
        }

        return network_metadata

    # -----------------------------
    # Helper: Call FastAPI model
    # -----------------------------
    def call_fastapi_inference(data: dict, network_metadata: dict):
        data["network_metadata"] = network_metadata

        try:
            resp = requests.post(api_url, json=data, timeout=2.0)
        except Exception as e:
            print(f"[FWD] ERROR calling FastAPI: {e}", file=sys.stderr)
            return None

        if resp.status_code != 200:
            print(f"[FWD] FastAPI returned {resp.status_code}: {resp.text}", file=sys.stderr)
            return None

        try:
            return resp.json()
        except Exception as e:
            print(f"[FWD] ERROR decoding FastAPI JSON: {e}", file=sys.stderr)
            return None

    # -----------------------------
    # MQTT callbacks
    # -----------------------------
    def on_connect(cli, _u, _f, rc):
        if rc == 0:
            cli.subscribe(topic_ingress, qos=args.qos)
            print(f"[FWD] Connected. Subscribed: {topic_ingress}")
            print(f"[FWD] Using FastAPI endpoint: {api_url}")
        else:
            print(f"[FWD] Connect failed rc={rc}", file=sys.stderr)

    def mirror_status(cli, src_topic: str, payload: bytes):
        parts = src_topic.split("/")
        device_id = parts[-2] if len(parts) >= 5 else "unknown"
        out_topic = f"{unity_prefix}/{device_id}/status"
        cli.publish(out_topic, payload, qos=1, retain=True)
        print(f"[FWD] Mirrored status → {out_topic}")

    def republish_data(cli, mqtt_topic: str, payload: bytes):
        try:
            data = json.loads(payload.decode("utf-8", "ignore"))
        except Exception as e:
            print(f"[FWD] Non-JSON payload dropped: {e}")
            return

        device_id = data.get("device_id", "unknown")
        payload_size = len(payload)

        # ---- Step 1: Build network metadata ----
        network_metadata = build_network_metadata(device_id, mqtt_topic, payload_size)
        print(f"[FWD] Network metadata for {device_id}:")
        print(f"      Source: {network_metadata['src_ip']}:{network_metadata['src_port']}")
        print(
            f"      Flow stats: {network_metadata['flow_pkt_count']} pkts, "
            f"{network_metadata['flow_byte_count']} bytes, "
            f"{network_metadata['flow_duration']:.2f}s duration"
        )
        print(
            f"      Rates: Current={network_metadata['current_rate']:.1f} pkt/s, "
            f"Avg={network_metadata['avg_rate']:.1f} pkt/s, "
            f"Last interval={network_metadata['time_since_last_pkt']:.3f}s"
        )

        # ---- Step 2: Call FastAPI inference with network metadata ----
        ai_response = call_fastapi_inference(data, network_metadata)
        if ai_response is None:
            print(f"[FWD] Dropping message from {device_id} because FastAPI call failed.")
            return

        prediction = ai_response.get("prediction", "UNKNOWN")
        # Use the new fields from app.py:
        prob_attack = ai_response.get("confidence_model_attack", None)
        conf_final = ai_response.get("confidence_final", ai_response.get("confidence", None))

        print(
            f"[FWD] AI prediction for device {device_id}: "
            f"{prediction} (prob_attack={prob_attack}, conf_final={conf_final})"
        )

        # ---- Step 3: Decide if we forward ----
        if prediction != "NORMAL":
            print(f"[FWD] ⚠️  BLOCKING message from {device_id} due to prediction={prediction}")
            # Optional: publish alert topic with AI response
            # alert_topic = f"{unity_prefix}/{device_id}/alert"
            # cli.publish(alert_topic, json.dumps(ai_response), qos=1, retain=False)
            return

        # ---- Step 4: Forward to Unity (pass-through) ----
        out_topic = f"{unity_prefix}/{device_id}"
        # Attach AI info for Unity / debugging if you want:
        data["ai_prediction"] = prediction
        data["ai_prob_attack"] = prob_attack
        data["ai_confidence"] = conf_final

        cli.publish(out_topic, json.dumps(data), qos=args.qos, retain=False)
        print(f"[FWD] ✓ Forwarded NORMAL message → {out_topic}")

    def on_message(cli, _u, msg):
        print(f"[FWD] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"[FWD] Message received on: {msg.topic}")
        if msg.topic.endswith("/status"):
            mirror_status(cli, msg.topic, msg.payload)
        else:
            republish_data(cli, msg.topic, msg.payload)
        print(f"[FWD] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(args.host, args.port, keepalive=30)
    client.loop_forever()

if __name__ == "__main__":
    main()
