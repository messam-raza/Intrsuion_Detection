import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const EventSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    spo2: { type: Number, default: 0 },
    pulse: { type: Number, default: 0 },
    prediction: {
      type: String,
      enum: ["NORMAL", "ATTACK", "UNKNOWN"],
      default: "NORMAL",
      index: true,
    },
    confidence: { type: Number, default: 0 },
    timestamp: { type: Date, default: () => new Date(), index: true },
    tsUnix: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Dedupe frames coming from the same device at the same timestamp so the
// server-side socket bridge can safely retry / reconnect without creating
// duplicate rows.
EventSchema.index(
  { deviceId: 1, tsUnix: 1 },
  { unique: true, partialFilterExpression: { tsUnix: { $type: "number" } } },
);

export type EventDoc = InferSchemaType<typeof EventSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const EventModel: Model<EventDoc> =
  (mongoose.models.Event as Model<EventDoc>) ||
  mongoose.model<EventDoc>("Event", EventSchema);

export default EventModel;
