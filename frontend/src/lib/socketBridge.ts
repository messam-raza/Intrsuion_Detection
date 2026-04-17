import { io, type Socket } from "socket.io-client";
import { connectMongo } from "./mongoose";
import EventModel from "@/models/Event";
import Device from "@/models/Device";
import type { EventRecord } from "./types";

/**
 * Server-side Socket.IO bridge.
 *
 * Connects once per Next.js server instance (booted from `instrumentation.ts`),
 * listens for `vitals_update` frames emitted by the detector backend, and
 * persists every frame to MongoDB. Also keeps the paired device's
 * `lastSeenAt` / `status` fields fresh.
 *
 * Using an idempotent upsert keyed on `(deviceId, tsUnix)` means reconnects
 * and duplicate emissions never create duplicate rows.
 */

declare global {
  // eslint-disable-next-line no-var
  var __vitalsBridge:
    | {
        socket: Socket | null;
        started: boolean;
        connected: boolean;
        persisted: number;
        skipped: number;
        lastError?: string;
      }
    | undefined;
}

const state =
  globalThis.__vitalsBridge ??
  (globalThis.__vitalsBridge = {
    socket: null,
    started: false,
    connected: false,
    persisted: 0,
    skipped: 0,
  });

export function getBridgeStatus() {
  return {
    started: state.started,
    connected: state.connected,
    persisted: state.persisted,
    skipped: state.skipped,
    lastError: state.lastError,
  };
}

export async function startVitalsBridge() {
  if (state.started) return;
  state.started = true;

  const url = process.env.SOCKET_URL || process.env.NEXT_PUBLIC_SOCKET_URL;
  if (!url) {
    console.warn(
      "[vitals-bridge] No SOCKET_URL / NEXT_PUBLIC_SOCKET_URL configured; bridge disabled.",
    );
    return;
  }

  try {
    await connectMongo();
  } catch (err) {
    console.error("[vitals-bridge] Mongo connect failed:", err);
    state.lastError = (err as Error).message;
    return;
  }

  console.log("[vitals-bridge] connecting to", url);

  const socket: Socket = io(url, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    reconnectionAttempts: Infinity,
  });

  state.socket = socket;

  socket.on("connect", () => {
    state.connected = true;
    console.log("[vitals-bridge] connected:", socket.id);
  });
  socket.on("disconnect", (reason) => {
    state.connected = false;
    console.warn("[vitals-bridge] disconnected:", reason);
  });
  socket.on("connect_error", (err) => {
    state.connected = false;
    state.lastError = err.message;
    console.warn("[vitals-bridge] connect_error:", err.message);
  });

  socket.on("vitals_update", (raw: unknown) => {
    const frame = normalize(raw);
    if (!frame) {
      state.skipped += 1;
      return;
    }
    void persistFrame(frame);
  });
}

function normalize(raw: unknown): EventRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const device_id =
    (r.device_id as string) ||
    (r.deviceId as string) ||
    (r.device as string) ||
    "";
  if (!device_id) return null;

  return {
    device_id,
    spo2: numeric(r.spo2),
    pulse: numeric(r.pulse),
    prediction: ((r.prediction as string) || "NORMAL").toString().toUpperCase(),
    confidence: numeric(r.confidence),
    timestamp:
      (r.timestamp as string) ||
      new Date(numeric(r.ts_unix) * 1000 || Date.now()).toISOString(),
    ts_unix:
      numeric(r.ts_unix) ||
      (r.timestamp ? new Date(r.timestamp as string).getTime() / 1000 : 0) ||
      Date.now() / 1000,
  };
}

function numeric(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function persistFrame(frame: EventRecord) {
  try {
    await EventModel.updateOne(
      { deviceId: frame.device_id, tsUnix: frame.ts_unix },
      {
        $setOnInsert: {
          deviceId: frame.device_id,
          spo2: frame.spo2,
          pulse: frame.pulse,
          prediction: (frame.prediction || "NORMAL").toString().toUpperCase(),
          confidence: frame.confidence,
          timestamp: new Date(frame.timestamp),
          tsUnix: frame.ts_unix,
        },
      },
      { upsert: true },
    );

    state.persisted += 1;

    // Keep device bookkeeping fresh. Ignore errors here so telemetry never
    // blocks on device status updates.
    Device.updateOne(
      { deviceId: frame.device_id },
      {
        $set: {
          status: frame.prediction === "ATTACK" ? "warning" : "online",
          lastSeenAt: new Date(frame.timestamp),
        },
      },
    ).catch(() => undefined);
  } catch (err) {
    // Duplicate-key errors happen naturally on retries; don't log noise.
    if ((err as { code?: number }).code !== 11000) {
      console.error("[vitals-bridge] persist error:", err);
      state.lastError = (err as Error).message;
    }
  }
}
