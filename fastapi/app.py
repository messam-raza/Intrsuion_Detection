import time
from collections import defaultdict
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

# Import model + preprocessing pipeline
from inference_pipeline import (
    predict_from_raw_features,
    model,
    MODEL_FEATURE_NAMES,
)


# =========================
# FastAPI setup
# =========================

app = FastAPI(
    title="TwinGuard AI – Attack Detection API",
    description="FastAPI service that scores oximeter flows for attacks.",
    version="1.0.0",
)


# =========================
# Pydantic model
# =========================

class OximeterPayload(BaseModel):
    type: str
    device_id: str
    ts_unix: float
    seq: int
    spo2: float
    pulse: int
    status: str


# =========================
# Simple flow state
# =========================
# Keyed by device_id so bursts from same device accumulate

flow_state = defaultdict(lambda: {
    "start_time": None,
    "last_time": None,
    "byte_count": 0,
    "pkt_count": 0,
})


def get_network_features(request: Request, payload: OximeterPayload) -> Dict[str, Any]:
    """
    Build a simple flow snapshot from this device's HTTP traffic.
    These features are then mapped to the Bot-IoT model feature space.
    """
    src_ip = request.client.host or "0.0.0.0"
    dst_ip = "127.0.0.1"          # API host (demo)
    sport = request.client.port
    dport = 8000                  # FastAPI port

    key = payload.device_id
    stats = flow_state[key]

    now = time.time()
    if stats["start_time"] is None:
        stats["start_time"] = now

    stats["last_time"] = now
    stats["pkt_count"] += 1

    # rough estimate of payload size in bytes (JSON + HTTP overhead)
    approx_pkt_size = 300
    stats["byte_count"] += approx_pkt_size

    dur = max(stats["last_time"] - stats["start_time"], 1e-5)
    rate = stats["pkt_count"] / dur

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

    print("[App] raw features:", raw_features)
    return raw_features


# =========================
# Vitals anomaly rules
# =========================

def vitals_anomaly_score(payload: OximeterPayload) -> Dict[str, Any]:
    """
    Simple rule-based anomaly detector on vital signs.
    This is combined with the ML model's decision.
    """
    reasons = []
    level = "none"

    # basic thresholds (tune as you like)
    if payload.spo2 < 90:
        reasons.append(f"Low SpO2 ({payload.spo2})")
    if payload.pulse > 130:
        reasons.append(f"Tachycardia ({payload.pulse} bpm)")
    if payload.status != "ok":
        reasons.append(f"Device status={payload.status}")

    if reasons:
        # severity tiers
        if payload.spo2 < 85 or payload.pulse > 150 or payload.status == "error":
            level = "high"
        else:
            level = "medium"

    return {
        "is_anomalous": bool(reasons),
        "level": level,
        "reasons": reasons,
    }


# =========================
# API endpoints
# =========================

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
    Main endpoint:
      - receives vitals from Node-RED
      - builds network-flow-like features
      - runs ML pipeline
      - applies vitals rules
      - returns final ATTACK / NORMAL
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # 1) Derive network features from traffic pattern
        raw_feats = get_network_features(request, payload)

        # 2) Run through trained Bot-IoT pipeline
        pred_class, prob_attack, processed_df = predict_from_raw_features(raw_feats)
        print(
            f"[App] model output: class={pred_class}, "
            f"prob_attack={prob_attack:.4f}"
        )

        # 3) Vitals anomaly layer
        vitals_info = vitals_anomaly_score(payload)
        model_attack = (pred_class == 1)
        vitals_attack = vitals_info["is_anomalous"] and vitals_info["level"] == "high"

        # 4) Final decision: HYBRID (ML OR vitals HIGH)
        is_attack = model_attack or vitals_attack
        if is_attack:
            label = "ATTACK"
            confidence = prob_attack if prob_attack >= 0.5 else 0.9
        else:
            label = "NORMAL"
            confidence = 1.0 - prob_attack if prob_attack <= 0.5 else 0.6

        response = {
            "device_id": payload.device_id,
            "seq": payload.seq,
            "prediction": label,
            "confidence": round(float(confidence), 4),
            "model_output": {
                "raw_pred_class": int(pred_class),
                "prob_attack_class1": round(float(prob_attack), 4),
            },
            "vitals_anomaly": vitals_info,
            "flow_stats": {
                "TotPkts": raw_feats["TotPkts"],
                "TotBytes": raw_feats["TotBytes"],
                "duration_sec": round(float(raw_feats["Dur"]), 4),
                "rate_pkts_per_sec": round(float(raw_feats["Rate"]), 4),
            },
            "server_timestamp": time.time(),
        }

        if is_attack:
            print(
                f"[App] !!! ATTACK DETECTED !!! "
                f"device={payload.device_id} | "
                f"prob_model={prob_attack:.4f} | "
                f"vitals_level={vitals_info['level']}"
            )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"[App] Inference Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Example: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
    uvicorn.run(app, host="0.0.0.0", port=8000)
