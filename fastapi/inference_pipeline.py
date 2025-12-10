# inference_pipeline.py

from __future__ import annotations
from typing import Dict, Any, Tuple, Optional

import sys
import pandas as pd
import joblib
import xgboost as xgb

from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.impute import SimpleImputer
from imblearn.over_sampling import SMOTE


MODEL_PATH = "model_training/models/xgb_bot_iot_finetuned.ubj"
PREPROC_PATH = "model_training/models/bot_iot_preprocessor.pkl"


class BotIoTDataPreprocessor:
    """
    This must match the class definition used when you trained & saved
    bot_iot_preprocessor.pkl. It encapsulates:
      - label encoders for categorical features (IPs, ports, etc.)
      - imputer for numerical features
      - MinMaxScaler for scaling
      - SMOTE info (only used in training)
    """

    def __init__(self):
        self.imputer = SimpleImputer(strategy="mean")
        self.scaler = MinMaxScaler()
        self.smote = SMOTE(random_state=42)
        self.encoders: Dict[str, LabelEncoder] = {}
        self.categorical_cols: list[str] = []
        self.numerical_cols: list[str] = []
        self.valid_numerical_cols: list[str] = []

    def fit_transform(self, X, y):
        """
        Used during training (kept here for compatibility).
        Not used in inference, but needed so unpickling works.
        """
        X = X.copy()

        self.categorical_cols = X.select_dtypes(include=["object"]).columns.tolist()
        self.numerical_cols = X.select_dtypes(exclude=["object"]).columns.tolist()

        for col in self.categorical_cols:
            self.encoders[col] = LabelEncoder()
            X[col] = X[col].astype(str)
            X[col] = self.encoders[col].fit_transform(X[col])

        if self.numerical_cols:
            imputed_data = self.imputer.fit_transform(X[self.numerical_cols])

            self.valid_numerical_cols = list(self.numerical_cols)
            if len(self.valid_numerical_cols) != imputed_data.shape[1]:
                self.valid_numerical_cols = [
                    col
                    for i, col in enumerate(self.numerical_cols)
                    if i < imputed_data.shape[1]
                ]

            X_imputed = pd.DataFrame(
                imputed_data, columns=self.valid_numerical_cols, index=X.index
            )
            X = X.drop(columns=self.numerical_cols, errors="ignore")
            X = pd.concat([X, X_imputed], axis=1)

        self.scaler.fit(X)
        X_scaled_array = self.scaler.transform(X)
        X_scaled = pd.DataFrame(X_scaled_array, columns=X.columns)
        return X_scaled, y  # SMOTE only used in training script

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        """
        Generic transform used in training; inference-specific logic
        will call this and then align to model feature names.
        """
        X = X.copy()

        # Encode categoricals
        for col in self.categorical_cols:
            if col in X.columns:
                le = self.encoders[col]
                X[col] = X[col].astype(str).map(
                    lambda s: le.transform([s])[0] if s in le.classes_ else -1
                )

        # Impute numericals
        if self.numerical_cols:
            present = [c for c in self.numerical_cols if c in X.columns]
            if present:
                imputed_data = self.imputer.transform(X[present])
                X_imputed = pd.DataFrame(
                    imputed_data, columns=self.valid_numerical_cols, index=X.index
                )
                X = X.drop(columns=present)
                X = pd.concat([X, X_imputed], axis=1)

        # Align to scaler expected columns (if newer sklearn)
        try:
            X = X[self.scaler.feature_names_in_]
        except Exception:
            pass

        X_scaled_array = self.scaler.transform(X)
        X_scaled = pd.DataFrame(X_scaled_array, columns=X.columns)
        return X_scaled


# 🔥 CRITICAL: Register this class on __main__ so pickle can find it
sys.modules['__main__'].BotIoTDataPreprocessor = BotIoTDataPreprocessor


print("[Inference] Loading model and preprocessor...")

model: Optional[xgb.XGBClassifier] = None
preprocessor: Optional[BotIoTDataPreprocessor] = None
MODEL_FEATURE_NAMES: Optional[list[str]] = None

try:
    # 1. Load model
    model = xgb.XGBClassifier()
    model.load_model(MODEL_PATH)

    # 2. Load preprocessor (pickle expects __main__.BotIoTDataPreprocessor)
    preprocessor = joblib.load(PREPROC_PATH)

    # 3. Get actual feature names used during training
    booster = model.get_booster()
    MODEL_FEATURE_NAMES = booster.feature_names
    print(f"[Inference] Model feature_names: {MODEL_FEATURE_NAMES}")

    print("[Inference] Artifacts loaded successfully.")
except Exception as e:
    print(f"[Inference] CRITICAL: Failed to load model/preprocessor: {e}")
    model = None
    preprocessor = None
    MODEL_FEATURE_NAMES = None


def preprocess_input(raw_features: Dict[str, Any]) -> pd.DataFrame:
    """
    1) Build one-row DataFrame from raw_features
    2) Apply categorical encoding, imputation, scaling using saved preprocessor
    3) Align final columns to model.get_booster().feature_names
    """
    if preprocessor is None:
        raise RuntimeError("Preprocessor is not loaded")

    df = pd.DataFrame([raw_features])

    # 1. Encode categoricals (IPs, ports, etc.)
    for col in preprocessor.categorical_cols:
        if col in df.columns:
            le = preprocessor.encoders[col]
            df[col] = df[col].astype(str).map(
                lambda s: le.transform([s])[0] if s in le.classes_ else -1
            ).fillna(-1)

    # 2. Impute numericals
    if preprocessor.numerical_cols:
        present = [c for c in preprocessor.numerical_cols if c in df.columns]
        if present:
            imputed_data = preprocessor.imputer.transform(df[present])
            df[present] = imputed_data

    # 3. Align to scaler input columns (if available)
    try:
        df = df[preprocessor.scaler.feature_names_in_]
    except AttributeError:
        pass
    except KeyError:
        for col in preprocessor.scaler.feature_names_in_:
            if col not in df.columns:
                df[col] = 0.0
        df = df[preprocessor.scaler.feature_names_in_]

    # 4. Scale
    scaled_array = preprocessor.scaler.transform(df)
    scaled_df = pd.DataFrame(scaled_array, columns=df.columns)

    # 5. Final alignment: exactly match the model's training feature names
    global MODEL_FEATURE_NAMES
    if MODEL_FEATURE_NAMES:
        # Add missing model features as 0.0
        for col in MODEL_FEATURE_NAMES:
            if col not in scaled_df.columns:
                scaled_df[col] = 0.0

        # Drop extra cols not used by model (e.g., TotPkts, Rate)
        extra = [c for c in scaled_df.columns if c not in MODEL_FEATURE_NAMES]
        if extra:
            print(f"[Inference] Dropping extra features not used by model: {extra}")
            scaled_df = scaled_df.drop(columns=extra)

        # Reorder to exact expected order
        scaled_df = scaled_df[MODEL_FEATURE_NAMES]

    print("[Inference] Final features to model:")
    print(scaled_df)
    return scaled_df


def predict_from_raw_features(raw_features: Dict[str, Any]) -> Tuple[int, float, pd.DataFrame]:
    """
    High-level helper:
      raw_features -> preprocessed dataframe -> model.predict/proba
    Returns:
      - predicted_class (0 normal / 1 attack)
      - attack_probability (class-1 probability)
      - processed_df (for debugging if needed)
    """
    if model is None:
        raise RuntimeError("Model is not loaded")

    X = preprocess_input(raw_features)
    y_pred = int(model.predict(X)[0])
    prob_attack = float(model.predict_proba(X)[0][1])
    return y_pred, prob_attack, X
