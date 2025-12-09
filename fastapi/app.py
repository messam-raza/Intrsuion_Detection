import uvicorn
from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import xgboost as xgb
import time
from collections import defaultdict, deque

from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.impute import SimpleImputer
from imblearn.over_sampling import SMOTE

# ==========================================
# CONFIGURATION & MODEL LOADING
# ==========================================

# This was your original list (10 features incl. TotPkts, Rate)
# We'll keep it for reference / debugging, but the REAL truth
# comes from the model's booster.feature_names.
MODEL_FEATURES = [
    "SrcAddr",
    "DstAddr",
    "Sport",
    "Dport",
    "TotPkts",
    "TotBytes",
    "Dur",
    "Rate",
    "SrcBytes",
    "DstBytes",
]

app = FastAPI(title="IIoT Attack Detection API")

# Global state to track flow statistics (for calculating Rate, Dur, etc.)
# Key: (src_ip, device_id), Value: {start_time, last_time, byte_count, pkt_count}
flow_state = defaultdict(
    lambda: {
        "start_time": time.time(),
        "last_time": time.time(),
        "byte_count": 0,
        "pkt_count": 0,
        "history": deque(maxlen=100),  # Keep last 100 packets for sliding window stats
    }
)


class BotIoTDataPreprocessor:
    def __init__(self):
        self.imputer = SimpleImputer(strategy="mean")
        self.scaler = MinMaxScaler()
        self.smote = SMOTE(random_state=42)
        self.encoders = defaultdict(LabelEncoder)
        self.categorical_cols = []
        self.numerical_cols = []
        self.valid_numerical_cols = []

    def fit_transform(self, X, y):
        X = X.copy()

        self.categorical_cols = X.select_dtypes(include=["object"]).columns.tolist()
        self.numerical_cols = X.select_dtypes(exclude=["object"]).columns.tolist()

        print(
            f"Processing {len(self.categorical_cols)} categorical and {len(self.numerical_cols)} numerical features..."
        )

        for col in self.categorical_cols:
            X[col] = X[col].astype(str)
            X[col] = self.encoders[col].fit_transform(X[col])

        if self.numerical_cols:
            imputed_data = self.imputer.fit_transform(X[self.numerical_cols])

            # Handle potential dropped columns
            self.valid_numerical_cols = list(self.numerical_cols)
            if len(self.valid_numerical_cols) != imputed_data.shape[1]:
                # If mismatch, adjust columns to match imputed shape
                self.valid_numerical_cols = [
                    col
                    for i, col in enumerate(self.numerical_cols)
                    if i < imputed_data.shape[1]
                ]

            X_imputed = pd.DataFrame(
                imputed_data, columns=self.valid_numerical_cols, index=X.index
            )

            # Drop original columns and add imputed
            X = X.drop(columns=self.numerical_cols, errors="ignore")
            X = pd.concat([X, X_imputed], axis=1)

        # Fit scaler
        self.scaler.fit(X)
        X_scaled_array = self.scaler.transform(X)
        X_scaled = pd.DataFrame(X_scaled_array, columns=X.columns)

        # SMOTE - only if needed and memory allows
        print(f"Original class distribution: {dict(pd.Series(y).value_counts())}")
        if len(X_scaled) < 500000:
            try:
                print("Applying SMOTE...")
                X_res, y_res = self.smote.fit_resample(X_scaled, y)
                print(f"Balanced class distribution: {dict(pd.Series(y_res).value_counts())}")
                return X_res, y_res
            except ValueError:
                return X_scaled, y
        else:
            return X_scaled, y

    def transform(self, X):
        X = X.copy()

        for col in self.categorical_cols:
            if col in X.columns:
                le = self.encoders[col]
                X[col] = X[col].astype(str).map(
                    lambda s: le.transform([s])[0] if s in le.classes_ else -1
                )

        if self.numerical_cols:
            present = [c for c in self.numerical_cols if c in X.columns]
            if present:
                imputed_data = self.imputer.transform(X[present])
                X_imputed = pd.DataFrame(
                    imputed_data, columns=self.valid_numerical_cols, index=X.index
                )
                X = X.drop(columns=present)
                X = pd.concat([X, X_imputed], axis=1)

        # Realign to scaler
        try:
            X = X[self.scaler.feature_names_in_]
        except Exception:
            pass

        X_scaled_array = self.scaler.transform(X)
        X_scaled = pd.DataFrame(X_scaled_array, columns=X.columns)
        return X_scaled


# ==========================================
# LOAD ARTIFACTS (MODEL + PREPROCESSOR)
# ==========================================

print("Loading model and preprocessors...")
MODEL_FEATURE_NAMES = None  # will be populated from booster

try:
    # Load the UBJ model (Universal Binary JSON)
    model = xgb.XGBClassifier()
    model.load_model("model_training/models/xgb_bot_iot_finetuned.ubj")

    # Load the fitted preprocessor (LabelEncoders, Scaler, Imputer)
    # Ensure this pickle file exists from your training step!
    preprocessor: BotIoTDataPreprocessor = joblib.load(
        "model_training/models/bot_iot_preprocessor.pkl"
    )

    # 🔥 Get the actual feature names the model was trained on
    booster = model.get_booster()
    MODEL_FEATURE_NAMES = booster.feature_names
    print(f"[DEBUG] Model booster feature_names: {MODEL_FEATURE_NAMES}")

    print("Artifacts loaded successfully.")
except Exception as e:
    print(f"CRITICAL ERROR: Failed to load model/preprocessor. {e}")
    # In production, you might want to exit here, but we'll let it run to show the API docs
    model = None
    preprocessor = None
    MODEL_FEATURE_NAMES = None


# Input Schema (Matches your Node-RED payload)
class OximeterPayload(BaseModel):
    type: str
    device_id: str
    ts_unix: float
    seq: int
    spo2: float
    pulse: int
    status: str


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_network_features(request: Request, payload: OximeterPayload):
    """
    Extracts and calculates network flow features from the single API request.
    This bridges the gap between 'biometric data' and 'network flow model'.
    """
    # 1. Basic Identity
    src_ip = request.client.host
    dst_ip = "127.0.0.1"  # The API server itself
    sport = request.client.port
    dport = 8000  # Default FastAPI port

    # 2. Update Flow State
    flow_key = (src_ip, payload.device_id)
    current_time = time.time()

    # Estimate packet size (JSON payload len + HTTP headers overhead estimate)
    # A realistic small packet size for MQTT/HTTP IoT
    pkt_size = 300  # bytes (approximation)

    stats = flow_state[flow_key]

    # Update stats
    stats["last_time"] = current_time
    stats["byte_count"] += pkt_size
    stats["pkt_count"] += 1

    # 3. Calculate Derived Features
    # Duration of flow so far
    duration = max(stats["last_time"] - stats["start_time"], 0.00001)  # Avoid div/0

    # Rate (packets per second)
    rate = stats["pkt_count"] / duration

    # Reset state if idle for too long (e.g., 5 seconds) to simulate new flows
    if (current_time - stats["last_time"]) > 5.0:
        flow_state[flow_key] = {
            "start_time": current_time,
            "last_time": current_time,
            "byte_count": pkt_size,
            "pkt_count": 1,
            "history": deque(maxlen=100),
        }
        duration = 0.00001
        rate = 0.0

    # 4. Construct Feature Dictionary
    # We assume 'SrcBytes' roughly equals 'DstBytes' for simple req/res, or just assign total
    raw_features = {
        "SrcAddr": src_ip,
        "DstAddr": dst_ip,
        "Sport": str(sport),
        "Dport": str(dport),
        "TotPkts": stats["pkt_count"],
        "TotBytes": stats["byte_count"],
        "Dur": duration,
        "Rate": rate,
        "SrcBytes": stats["byte_count"],  # Simplification
        "DstBytes": 0,  # API is receiving, not sending back in this context calculation
    }
    print(f"Extracted raw features: {raw_features}")
    return raw_features


def preprocess_input(raw_features):
    """
    Applies the exact same transformations as the training pipeline,
    then aligns to the feature set the XGBoost model actually expects.
    """
    global MODEL_FEATURE_NAMES

    # Convert to DataFrame
    df = pd.DataFrame([raw_features])

    # 1. Encode Categoricals (IPs, Ports) using the saved LabelEncoders
    # Handle unseen labels by mapping to -1
    if preprocessor is None:
        raise RuntimeError("Preprocessor not loaded")

    for col in preprocessor.categorical_cols:
        if col in df.columns:
            le = preprocessor.encoders[col]
            df[col] = df[col].astype(str).map(
                lambda s: le.transform([s])[0] if s in le.classes_ else -1
            )
            df[col] = df[col].fillna(-1)

    # 2. Impute Numericals
    if preprocessor.numerical_cols:
        valid_cols = [c for c in preprocessor.numerical_cols if c in df.columns]
        if valid_cols:
            imputed_data = preprocessor.imputer.transform(df[valid_cols])
            df[valid_cols] = imputed_data

    # 3. Align Columns for Scaler
    # The scaler expects columns in a specific order.
    try:
        df = df[preprocessor.scaler.feature_names_in_]
    except AttributeError:
        # Older sklearn; nothing to align by
        pass
    except KeyError:
        # If columns are missing, add them as 0 then reorder
        for col in preprocessor.scaler.feature_names_in_:
            if col not in df.columns:
                df[col] = 0.0
        df = df[preprocessor.scaler.feature_names_in_]

    # 4. Scale
    scaled_array = preprocessor.scaler.transform(df)
    scaled_df = pd.DataFrame(scaled_array, columns=df.columns)

    # 5. 🔥 Final alignment to model feature names
    # This is the critical fix for your error:
    # training data did not have the following fields: TotPkts, Rate
    if MODEL_FEATURE_NAMES:
        print(f"[DEBUG] Aligning to model feature names: {MODEL_FEATURE_NAMES}")

        # Add missing expected features as 0.0
        for col in MODEL_FEATURE_NAMES:
            if col not in scaled_df.columns:
                print(f"[DEBUG] Adding missing feature '{col}' with 0.0")
                scaled_df[col] = 0.0

        # Drop extra features that the model was NOT trained on
        extra_cols = [c for c in scaled_df.columns if c not in MODEL_FEATURE_NAMES]
        if extra_cols:
            print(f"[DEBUG] Dropping extra features not used by model: {extra_cols}")
            scaled_df = scaled_df.drop(columns=extra_cols)

        # Reorder to exactly match the model's training order
        scaled_df = scaled_df[MODEL_FEATURE_NAMES]

    print("[DEBUG] Final DF passed to model:")
    print(scaled_df)
    return scaled_df


# ==========================================
# API ENDPOINTS
# ==========================================

@app.get("/")
def home():
    return {
        "status": "online",
        "model_loaded": model is not None,
        "model_features": MODEL_FEATURE_NAMES,
    }


@app.post("/analyze_vitals")
async def analyze_vitals(request: Request, payload: OximeterPayload):
    """
    Receives IoT data, calculates flow features, and predicts attack status.
    """
    if not model or not preprocessor:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        # 1. Feature Engineering (Bridge biometrics -> network flow)
        raw_feats = get_network_features(request, payload)

        # 2. Preprocessing (Scale/Encode)
        processed_input = preprocess_input(raw_feats)
        print("preprocessed")

        # 3. Prediction
        # XGBoost returns 0 (Normal) or 1 (Attack)
        prediction = model.predict(processed_input)[0]
        prob = model.predict_proba(processed_input)[0][1]  # Probability of Attack

        # 4. Logic for "Is this an attack?"
        is_attack = bool(prediction == 1)

        # 5. Construct Response
        response = {
            "device_id": payload.device_id,
            "seq": payload.seq,
            "prediction": "ATTACK" if is_attack else "NORMAL",
            "confidence": float(prob),
            "flow_stats": {
                "rate": f"{raw_feats['Rate']:.2f} pkts/sec",
                "duration": f"{raw_feats['Dur']:.2f} sec",
            },
            "server_timestamp": time.time(),
        }

        # Optional: Log attacks to console
        if is_attack:
            print(
                f"!!! ATTACK DETECTED !!! Device: {payload.device_id} | Prob: {prob:.4f}"
            )

        return response

    except Exception as e:
        print(f"Inference Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Run with: uvicorn app:app --reload
    uvicorn.run(app, host="0.0.0.0", port=8000)
