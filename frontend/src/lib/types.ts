export type Prediction = "NORMAL" | "ATTACK" | "UNKNOWN";

/**
 * Telemetry frame pushed by the detector over Socket.IO:
 * {
 *   device_id, spo2, pulse, prediction, confidence, timestamp, ts_unix
 * }
 */
export interface EventRecord {
  device_id: string;
  spo2: number;
  pulse: number;
  prediction: Prediction | string;
  confidence: number;
  timestamp: string;
  ts_unix: number;
}

export interface PatientDTO {
  _id: string;
  patientId: string;
  fullName: string;
  dateOfBirth?: string | null;
  sex?: string;
  bloodType?: string;
  weightKg?: number;
  heightCm?: number;
  primaryDiagnosis?: string;
  medicalHistory?: string;
  admittedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceDTO {
  _id: string;
  deviceId: string;
  hardwareId: string;
  deviceType: "pulse_ox" | "ecg" | "bp" | "glucose" | "other";
  connectivity: "wifi" | "ble";
  patient?: string | null;
  status: "online" | "offline" | "warning";
  lastSeenAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
