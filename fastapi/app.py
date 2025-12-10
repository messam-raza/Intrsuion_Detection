import time
from collections import defaultdict
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import model + preprocessing pipeline
from inference_pipeline import (
    predict_from_raw_features,
    model,
    MODEL_FEATURE_NAMES,
)

# --------------------------------------
# FastAPI app setup
# --------------------------------------
app = FastAPI(title="TwinGuard Attack Detection API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------
# Flow state (HTTP fallback)
# --------------------------------------
# Only used when no network_metadata is provided.
flow_state: Dict[str, Dict[str, Any]] = defaultdict(
    lambda: {
        "start_time": None,
        "last_time": None,
        "byte_count": 0,
        "pkt_count": 0,
    }
)

# --------------------------------------
# Pydantic schemas
# --------------------------------------
class OximeterPayload(BaseModel):
    type: str
    device_id: str
    ts_unix: float
    seq: int
    spo2: float
    pulse: int
    status: str
    # optional network info coming from mqttclient.py
    network_metadata: Optional[Dict[str, Any]] = None


# --------------------------------------
# Feature extraction
# --------------------------------------
def get_network_features(request: Request, payload: OximeterPayload) -> Dict[str, Any]:
    """
    Build a one-row feature dict consistent with your training dataset.
    Prefers network_metadata from mqttclient.py if available; otherwise
    falls back to simple HTTP-derived stats.
    """

    # Case 1: use network_metadata from MQTT client (recommended path)
    if payload.network_metadata:
        meta = payload.network_metadata
        print("[App] Using network_metadata from MQTT client")

        src_ip = str(meta.get("src_ip", "0.0.0.0"))
        dst_ip = str(meta.get("dst_ip", "127.0.0.1"))
        sport = int(meta.get("src_port", 1883))
        dport = int(meta.get("dst_port", 8000))

        # Flow-level stats computed in mqttclient.py
        flow_pkts = float(meta.get("flow_pkt_count", 1.0))
        flow_bytes = float(meta.get("flow_byte_count", meta.get("pkt_size", 300)))
        flow_dur = float(meta.get("flow_duration", 1e-5))
        if flow_dur <= 0:
            flow_dur = 1e-5
        rate = flow_pkts / flow_dur

        raw_features = {
            "SrcAddr": src_ip,
            "DstAddr": dst_ip,
            "Sport": str(sport),
            "Dport": str(dport),
            "TotPkts": flow_pkts,
            "TotBytes": flow_bytes,
            "Dur": flow_dur,
            "Rate": rate,
            "SrcBytes": flow_bytes,
            "DstBytes": 0.0,
        }
        print("[App] raw features (from MQTT):", raw_features)
        return raw_features

    # Case 2: fallback – derive approximate flow stats from HTTP traffic
    print("[App] Using HTTP-derived network features (no network_metadata)")
    src_ip = request.client.host or "0.0.0.0"
    dst_ip = "127.0.0.1"
    sport = request.client.port
    dport = 8000

    key = (src_ip, payload.device_id)
    now = time.time()

    state = flow_state[key]
    if state["start_time"] is None:
        state["start_time"] = now
        state["last_time"] = now
        state["byte_count"] = 0
        state["pkt_count"] = 0

    # rough estimate of HTTP+JSON size
    approx_size = 300
    state["pkt_count"] += 1
    state["byte_count"] += approx_size
    state["last_time"] = now

    dur = max(state["last_time"] - state["start_time"], 1e-5)
    rate = state["pkt_count"] / dur

    raw_features = {
        "SrcAddr": src_ip,
        "DstAddr": dst_ip,
        "Sport": str(sport),
        "Dport": str(dport),
        "TotPkts": float(state["pkt_count"]),
        "TotBytes": float(state["byte_count"]),
        "Dur": float(dur),
        "Rate": float(rate),
        "SrcBytes": float(state["byte_count"]),
        "DstBytes": 0.0,
    }
    print("[App] raw features (from HTTP):", raw_features)
    return raw_features


# --------------------------------------
# Vitals anomaly rules (simple, optional)
# --------------------------------------
def vitals_anomaly_score(payload: OximeterPayload) -> Dict[str, Any]:
    reasons = []
    level = "none"

    if payload.spo2 < 90:
        reasons.append(f"Low SpO2 ({payload.spo2})")
    if payload.pulse > 130:
        reasons.append(f"Tachycardia ({payload.pulse} bpm)")
    if payload.status != "ok":
        reasons.append(f"Device status={payload.status}")

    if reasons:
        if payload.spo2 < 85 or payload.pulse > 150 or payload.status == "error":
            level = "high"
        else:
            level = "medium"

    return {
        "is_anomalous": bool(reasons),
        "level": level,
        "reasons": reasons,
    }


# --------------------------------------
# API endpoints
# --------------------------------------
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
      - builds network flow features
      - runs them through the Bot-IoT preprocessor + XGB model
      - optionally combines with vitals anomaly rules
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        raw_feats = get_network_features(request, payload)
        y_pred, prob_attack, X_processed = predict_from_raw_features(raw_feats)

        model_attack = (y_pred == 1)
        vitals_info = vitals_anomaly_score(payload)
        vitals_attack = vitals_info["is_anomalous"] and vitals_info["level"] == "high"

        # Final decision: model OR high-severity vitals anomaly
        is_attack = model_attack or vitals_attack
        label = "ATTACK" if is_attack else "NORMAL"

        # Confidence for final label:
        # - if model says attack → use model probability
        # - if only vitals triggered → fixed high confidence
        # - if final NORMAL → 1 - model attack prob
        if model_attack:
            confidence_final = prob_attack
        elif vitals_attack and not model_attack:
            confidence_final = 0.9
        else:
            confidence_final = 1.0 - prob_attack

        response = {
            "device_id": payload.device_id,
            "seq": payload.seq,
            "prediction": label,
            # model-only probability of attack
            "confidence_model_attack": round(float(prob_attack), 4),
            "model_raw_pred_class": int(y_pred),
            # final combined confidence (model + vitals)
            "confidence_final": round(float(confidence_final), 4),
            # backward-compatible alias (what mqttclient used to expect)
            "confidence": round(float(confidence_final), 4),
            "vitals_anomaly": vitals_info,
            "flow_features_used": {
                "TotPkts": raw_feats.get("TotPkts"),
                "TotBytes": raw_feats.get("TotBytes"),
                "Dur": raw_feats.get("Dur"),
                "Rate": raw_feats.get("Rate"),
            },
            "spo2": payload.spo2,
            "pulse": payload.pulse,
            "status": payload.status,
            "ts_unix": payload.ts_unix,
            "server_timestamp": time.time(),
        }

        print(
            f"[App] model_pred={y_pred}, prob_attack={prob_attack:.4f}, "
            f"vitals_level={vitals_info['level']}, final_label={label}, "
            f"confidence_final={confidence_final:.4f}"
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"[App] Inference Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
