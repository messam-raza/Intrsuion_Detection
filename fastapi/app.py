# app.py

from __future__ import annotations
from typing import Dict, Any
from collections import defaultdict, deque
import time

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import socketio

from inference_pipeline import (
    predict_from_raw_features,
    model,
    MODEL_FEATURE_NAMES,
)


# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',  # Configure this for production
    logger=True,
    engineio_logger=False
)

# Create FastAPI app
app = FastAPI(title="TwinGuard IIoT Attack Detection API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wrap FastAPI app with Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Flow state for simple traffic features
flow_state = defaultdict(
    lambda: {
        "start_time": time.time(),
        "last_time": time.time(),
        "byte_count": 0,
        "pkt_count": 0,
        "history": deque(maxlen=100),
    }
)


# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    print(f"[SocketIO] Client connected: {sid}")
    await sio.emit('connection_status', {'status': 'connected', 'message': 'Successfully connected to server'}, room=sid)


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    print(f"[SocketIO] Client disconnected: {sid}")


class OximeterPayload(BaseModel):
    type: str
    device_id: str
    ts_unix: float
    seq: int
    spo2: float
    pulse: int
    status: str
    # Optional network metadata from MQTT client
    network_metadata: dict | None = None  # Can include: src_ip, src_port, pkt_size, mqtt_topic, etc.


def get_network_features(request: Request, payload: OximeterPayload) -> Dict[str, Any]:
    """
    Build a single 'flow snapshot' feature vector from the HTTP request or provided network metadata.
    If network_metadata is provided in payload, use that; otherwise extract from HTTP request.
    """
    # Check if network metadata is provided from MQTT client
    if payload.network_metadata:
        print("[App] Using network metadata from MQTT client")
        metadata = payload.network_metadata
        src_ip = metadata.get("src_ip", "0.0.0.0")
        dst_ip = metadata.get("dst_ip", "127.0.0.1")
        sport = metadata.get("src_port", 0)
        dport = metadata.get("dst_port", 8000)
        pkt_size = metadata.get("pkt_size", 300)
        
        # Use MQTT-provided flow statistics (more accurate for attack detection)
        flow_pkt_count = metadata.get("flow_pkt_count", 1)
        flow_byte_count = metadata.get("flow_byte_count", pkt_size)
        flow_duration = metadata.get("flow_duration", 0.001)
        
        # Use the current rate from MQTT client (captures burst behavior)
        current_rate = metadata.get("current_rate", 1.0)
        
        # Use MQTT topic info if available for more context
        mqtt_topic = metadata.get("mqtt_topic", "")
        print(f"[App] MQTT Topic: {mqtt_topic}")
        print(f"[App] MQTT Rate: {current_rate:.1f} pkt/s (flow: {flow_pkt_count} pkts in {flow_duration:.2f}s)")
        
        # Use provided values directly (don't recalculate)
        raw_features = {
            "SrcAddr": src_ip,
            "DstAddr": dst_ip,
            "Sport": str(sport),
            "Dport": str(dport),
            "TotPkts": flow_pkt_count,
            "TotBytes": flow_byte_count,
            "Dur": max(flow_duration, 0.001),
            "Rate": max(current_rate, 0.1),  # Use current rate from MQTT (captures bursts!)
            "SrcBytes": flow_byte_count,
            "DstBytes": 0,
        }
    else:
        print("[App] Using network metadata from HTTP request")
        src_ip = request.client.host or "0.0.0.0"
        dst_ip = "127.0.0.1"
        sport = request.client.port
        dport = 8000
        pkt_size = 300

        flow_key = (src_ip, payload.device_id)
        current_time = time.time()

        stats = flow_state[flow_key]

        # update flow stats
        stats["last_time"] = current_time
        stats["byte_count"] += pkt_size
        stats["pkt_count"] += 1

        dur = max(stats["last_time"] - stats["start_time"], 1e-5)
        rate = stats["pkt_count"] / dur

        # (Optional) clamp localhost to more 'normal' values for demo
        if src_ip.startswith("127."):
            dur = max(dur, 1.0)
            rate = min(rate, 50.0)

        raw_features = {
            "SrcAddr": src_ip,
            "DstAddr": dst_ip,
            "Sport": str(sport),
            "Dport": str(dport),
            "TotPkts": stats["pkt_count"],
            "TotBytes": stats["byte_count"],
            "Dur": dur,
            "Rate": rate,
            "SrcBytes": stats["byte_count"],
            "DstBytes": 0,
        }

    print(f"[App] Extracted raw features: {raw_features}")
    return raw_features


@app.get("/")
def root():
    return {
        "status": "online",
        "model_loaded": model is not None,
        "model_feature_names": MODEL_FEATURE_NAMES,
    }


@app.get("/health")
def health():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "ok"}


@app.post("/analyze_vitals")
async def analyze_vitals(request: Request, payload: OximeterPayload):
    """
    Main inference endpoint:
      - receives vitals JSON from Node-RED / Postman
      - derives network-like features
      - passes them to the ML pipeline
      - returns ATTACK / NORMAL + confidence
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # 1) Build raw feature dict from request + payload
        raw_feats = get_network_features(request, payload)

        # 2) Run through ML pipeline
        y_pred, prob_attack, processed_df = predict_from_raw_features(raw_feats)
        print("[App] preprocessed, model output:",
              f"pred={y_pred}, prob_attack={prob_attack:.4f}")

        # 3) Decide label (you can change threshold from 0.5 if you want)
        is_attack = (y_pred == 1)
        label = "ATTACK" if is_attack else "NORMAL"

        # 4) Build response
        response = {
            "device_id": payload.device_id,
            "seq": payload.seq,
            "prediction": label,
            "confidence": prob_attack,  # probability of ATTACK
            "spo2": payload.spo2,
            "pulse": payload.pulse,
            "status": payload.status,
            "flow_stats": {
                "rate": f"{raw_feats['Rate']:.2f} pkts/sec",
                "duration": f"{raw_feats['Dur']:.2f} sec",
                "tot_pkts": raw_feats["TotPkts"],
                "tot_bytes": raw_feats["TotBytes"],
            },
            "timestamp": payload.ts_unix,
            "server_timestamp": time.time(),
        }

        if is_attack:
            print(f"[App] !!! ATTACK DETECTED !!! device={payload.device_id} "
                  f"prob={prob_attack:.4f}")

        # Emit real-time event via Socket.IO before returning
        vitals_event = {
            "device_id": payload.device_id,
            "spo2": payload.spo2,
            "pulse": payload.pulse,
            "prediction": label,
            "confidence": prob_attack,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "ts_unix": payload.ts_unix,
        }
        
        await sio.emit('vitals_update', vitals_event)
        print(f"[SocketIO] Emitted vitals_update: {vitals_event}")

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"[App] Inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Run locally with:  uvicorn app:socket_app --host 0.0.0.0 --port 8000 --reload
    # Note: Use socket_app instead of app to enable Socket.IO support
    uvicorn.run(socket_app, host="0.0.0.0", port=8000)
