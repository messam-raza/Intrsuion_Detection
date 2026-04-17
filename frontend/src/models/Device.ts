import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    hardwareId: { type: String, required: true },
    deviceType: {
      type: String,
      enum: ["pulse_ox", "ecg", "bp", "glucose", "other"],
      default: "pulse_ox",
    },
    connectivity: {
      type: String,
      enum: ["wifi", "ble"],
      default: "wifi",
    },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", default: null },
    status: {
      type: String,
      enum: ["online", "offline", "warning"],
      default: "offline",
    },
    lastSeenAt: { type: Date },
  },
  { timestamps: true },
);

export type DeviceDoc = InferSchemaType<typeof DeviceSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Device: Model<DeviceDoc> =
  (mongoose.models.Device as Model<DeviceDoc>) ||
  mongoose.model<DeviceDoc>("Device", DeviceSchema);

export default Device;
