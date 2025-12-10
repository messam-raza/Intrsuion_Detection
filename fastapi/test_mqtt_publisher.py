#!/usr/bin/env python3
"""
Test script for MQTT integration.
Simulates IoT device publishing vitals data via MQTT.
"""
import paho.mqtt.client as mqtt
import json
import time
import random
import argparse
from datetime import datetime


def generate_vitals_data(device_id: str, seq: int, attack_mode: bool = False):
    """Generate realistic vitals data."""
    if attack_mode:
        # Simulate attack with abnormal values or rapid sending
        spo2 = round(70 + random.random() * 20, 1)  # Lower oxygen
        pulse = random.randint(110, 180)  # High heart rate
    else:
        spo2 = round(92 + random.random() * 8, 1)  # Normal: 92-100%
        pulse = random.randint(60, 100)  # Normal: 60-100 bpm
    
    return {
        "type": "vitals",
        "device_id": device_id,
        "ts_unix": time.time(),
        "seq": seq,
        "spo2": spo2,
        "pulse": pulse,
        "status": "normal"
    }


def on_connect(client, userdata, flags, rc):
    """Callback when connected to MQTT broker."""
    if rc == 0:
        print("[Publisher] ✓ Connected to MQTT broker")
    else:
        print(f"[Publisher] ✗ Connection failed with code {rc}")


def on_publish(client, userdata, mid):
    """Callback when message is published."""
    print(f"[Publisher] Message {mid} published successfully")


def main():
    parser = argparse.ArgumentParser(description="Test MQTT integration by publishing vitals data")
    parser.add_argument("--host", default="127.0.0.1", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--device-id", default="oximeter-001", help="Device ID")
    parser.add_argument("--gateway-id", default="pi-01", help="Gateway ID")
    parser.add_argument("--count", type=int, default=5, help="Number of messages to send")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between messages")
    parser.add_argument("--attack", action="store_true", help="Simulate attack scenario")
    parser.add_argument("--rapid", action="store_true", help="Send messages rapidly (0.1s interval)")
    
    args = parser.parse_args()
    
    # Construct MQTT topic: edge/<gateway>/in/<device>
    topic = f"edge/{args.gateway_id}/in/{args.device_id}"
    
    print("=" * 70)
    print("MQTT Test Publisher")
    print("=" * 70)
    print(f"Broker: {args.host}:{args.port}")
    print(f"Topic: {topic}")
    print(f"Device: {args.device_id}")
    print(f"Messages: {args.count}")
    print(f"Interval: {args.interval}s")
    print(f"Attack mode: {args.attack}")
    print(f"Rapid mode: {args.rapid}")
    print("=" * 70)
    print()
    
    # Create MQTT client
    client = mqtt.Client(client_id=f"test-publisher-{args.device_id}")
    client.on_connect = on_connect
    client.on_publish = on_publish
    
    try:
        # Connect to broker
        print(f"[Publisher] Connecting to {args.host}:{args.port}...")
        client.connect(args.host, args.port, 60)
        client.loop_start()
        
        # Wait for connection
        time.sleep(1)
        
        # Determine interval
        interval = 0.1 if args.rapid else args.interval
        
        # Publish messages
        print(f"\n[Publisher] Starting to publish {args.count} messages...")
        print()
        
        for i in range(1, args.count + 1):
            # Generate vitals data
            data = generate_vitals_data(args.device_id, i, args.attack)
            
            # Publish to MQTT
            result = client.publish(topic, json.dumps(data), qos=1)
            
            # Display info
            timestamp = datetime.now().strftime("%H:%M:%S")
            status_icon = "⚠️ " if args.attack else "✓"
            print(f"[{timestamp}] {status_icon} Message {i}/{args.count}:")
            print(f"  Device: {data['device_id']}")
            print(f"  SpO2: {data['spo2']}%")
            print(f"  Pulse: {data['pulse']} bpm")
            print(f"  Seq: {data['seq']}")
            
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                print(f"  ✗ Publish failed with code {result.rc}")
            else:
                print(f"  ✓ Published to {topic}")
            
            print()
            
            # Wait before next message
            if i < args.count:
                time.sleep(interval)
        
        print("=" * 70)
        print(f"[Publisher] Completed sending {args.count} messages")
        print("=" * 70)
        print()
        print("Next steps:")
        print("1. Check MQTT client logs for message processing")
        print("2. Check FastAPI backend logs for ML inference")
        print("3. Check frontend (VitalsPage) for real-time updates")
        print("4. Check Unity for forwarded messages (if NORMAL)")
        print()
        
        # Keep connection alive briefly
        time.sleep(2)
        
    except KeyboardInterrupt:
        print("\n[Publisher] Interrupted by user")
    except Exception as e:
        print(f"\n[Publisher] Error: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[Publisher] Disconnected from MQTT broker")


if __name__ == "__main__":
    main()

