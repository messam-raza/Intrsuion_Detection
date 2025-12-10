# app.py

from __future__ import annotations
from typing import Dict, Any
from collections import defaultdict, deque
import time

import uvicorn
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List

from inference_pipeline import (
    predict_from_raw_features,
    model,
    MODEL_FEATURE_NAMES,
)


app = FastAPI(title="TwinGuard IIoT Attack Detection API")

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


class OximeterPayload(BaseModel):
    type: str
    device_id: str
    ts_unix: float
    seq: int
    spo2: float
    pulse: int
    status: str


def get_network_features(request: Request, payload: OximeterPayload) -> Dict[str, Any]:
    """
    Build a single 'flow snapshot' feature vector from the HTTP request.
    This simulates what your gateway/DT would normally compute from mirrored traffic.
    """
    src_ip = request.client.host or "0.0.0.0"
    dst_ip = "127.0.0.1"  # your API host (demo)
    sport = request.client.port
    dport = 8000

    flow_key = (src_ip, payload.device_id)
    current_time = time.time()

    # approximate packet size for this request
    pkt_size = 300  # bytes
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
            "flow_stats": {
                "rate": f"{raw_feats['Rate']:.2f} pkts/sec",
                "duration": f"{raw_feats['Dur']:.2f} sec",
                "tot_pkts": raw_feats["TotPkts"],
                "tot_bytes": raw_feats["TotBytes"],
            },
            "server_timestamp": time.time(),
        }

        if is_attack:
            print(f"[App] !!! ATTACK DETECTED !!! device={payload.device_id} "
                  f"prob={prob_attack:.4f}")

        response["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
        await manager.broadcast(response)
        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"[App] Inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# -------- WEBSOCKET MANAGER ----------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead_clients = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except WebSocketDisconnect:
                dead_clients.append(conn)
        for c in dead_clients:
            self.disconnect(c)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # optional ping/pong
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    # Run locally with:  uvicorn app:app --host 0.0.0.0 --port 8000 --reload
    uvicorn.run(app, host="0.0.0.0", port=8000)
