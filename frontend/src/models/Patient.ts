import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const PatientSchema = new Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: Date },
    sex: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    bloodType: {
      type: String,
      enum: ["A+", "O+", "B+", "AB+", "A-", "O-", "B-", "AB-", ""],
      default: "",
    },
    weightKg: { type: Number },
    heightCm: { type: Number },
    primaryDiagnosis: { type: String, default: "" },
    medicalHistory: { type: String, default: "" },
    admittedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export type PatientDoc = InferSchemaType<typeof PatientSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Patient: Model<PatientDoc> =
  (mongoose.models.Patient as Model<PatientDoc>) ||
  mongoose.model<PatientDoc>("Patient", PatientSchema);

export default Patient;
