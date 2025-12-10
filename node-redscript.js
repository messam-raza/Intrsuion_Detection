// Node-RED Function: Vital generator + attack simulator
// INPUT:
//   - Date (tick) from Inject nodes
//   - OR control JSON on same input:
//
//     {
//       "cmd": "<normal|desat|spike|freeze|impersonate|flood>",
//       "duration": <seconds>,
//       "spoof_id": "oxi-evil-01",   // for impersonate
//       "burst": <optional override>
//     }
//
// OUTPUT 1: vitals payload -> MQTT "edge/pi-01/in/<device>"
// OUTPUT 2: status string   -> MQTT "edge/pi-01/in/<device>/status" (retained)

const nowSec = Date.now() / 1000;

// ---------- CONTROL MESSAGES (mode switching) ----------
if (
  typeof msg.payload === "object" &&
  msg.payload !== null &&
  msg.payload.cmd
) {
  const { cmd, duration, spoof_id, burst } = msg.payload;

  const mode = cmd || "normal";
  const until = duration ? nowSec + Number(duration) : 0;

  flow.set("mode", mode);
  flow.set("mode_until", until);
  flow.set("spoof_id", spoof_id || null);

  // Default burst values tuned for ML network behaviour
  let burstCount = Number(burst) || 0;
  if (mode === "flood" && burstCount === 0) {
    burstCount = 60; // heavy burst → high Rate, TotPkts
  } else if ((mode === "desat" || mode === "spike") && burstCount === 0) {
    burstCount = 10; // moderate "stress" pattern
  } else if (mode === "freeze" && burstCount === 0) {
    burstCount = 5; // repeated identical packets
  } else if (mode === "impersonate" && burstCount === 0) {
    burstCount = 15; // new flow with spoofed ID
  }
  flow.set("burst", burstCount);

  node.status({
    fill: mode === "normal" ? "green" : "red",
    shape: "dot",
    text: `mode=${mode} dur=${duration || "-"} burst=${burstCount}`,
  });

  const statusPayload = mode === "normal" ? "online" : `attack:${mode}`;
  return [null, { payload: statusPayload }];
}

// ---------- TICK: generate vitals ----------
let seq = flow.get("seq") || 0;
let spo2 = flow.get("spo2");
let pulse = flow.get("pulse");
if (spo2 === undefined) spo2 = 98.0;
if (pulse === undefined) pulse = 75.0;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

let mode = flow.get("mode") || "normal";
const until = flow.get("mode_until") || 0;

// Auto-reset when attack duration expires
if (until && nowSec > until) {
  mode = "normal";
  flow.set("mode", "normal");
  flow.set("mode_until", 0);
  flow.set("spoof_id", null);
  flow.set("burst", 0);
  node.status({ fill: "green", shape: "dot", text: "mode=normal dur=-" });
}

// Baseline jitter (unless freeze)
if (mode !== "freeze") {
  spo2 = clamp(spo2 + (Math.random() - 0.5) * 0.4, 90, 100);
  pulse = clamp(pulse + (Math.random() - 0.5) * 3.0, 45, 130);
}

// ---------- APPLY ATTACK MODES ----------
switch (mode) {
  case "desat": // oxygen desaturation
    spo2 = clamp(spo2 - (2 + Math.random() * 6), 75, 100);
    break;

  case "spike": // heart-rate spike
    pulse = clamp(pulse + (20 + Math.random() * 40), 45, 200);
    break;

  case "freeze": // freeze: vitals stop changing, but we still burst
    // (no extra change here; baseline jitter already skipped)
    break;

  case "impersonate": // handled via device_id spoof below
    break;

  case "flood": // heavy network flooding; vitals may look normal-ish
    // (network anomaly created below via large burst)
    break;

  default:
    // normal
    break;
}

// Persist state
seq += 1;
flow.set("seq", seq);
flow.set("spo2", spo2);
flow.set("pulse", pulse);

// Base + spoofed IDs
const baseDevice = "oxi-001";
const spoofId = flow.get("spoof_id");
const deviceId = mode === "impersonate" && spoofId ? spoofId : baseDevice;

// Status field for FastAPI's vitals_anomaly_score (if enabled)
let statusText = "ok";
if (mode === "desat" || mode === "spike" || mode === "impersonate") {
  statusText = "alert";
}
if (mode === "flood") {
  statusText = "error";
}

// Build one payload
function makePayload(seqOverride) {
  return {
    type: "plx",
    device_id: deviceId,
    ts_unix: nowSec,
    seq: seqOverride !== undefined ? seqOverride : seq,
    spo2: Number(spo2.toFixed(1)),
    pulse: Math.round(pulse),
    status: statusText,
  };
}

const burst = flow.get("burst") || 0;

// ---------- ATTACK BURSTS (network anomalies) ----------
if (burst > 0 && mode !== "normal") {
  for (let i = 0; i < burst; i++) {
    node.send([{ payload: makePayload(seq + i) }, null]);
  }
  flow.set("seq", seq + burst - 1);

  // Status update on second output
  return [null, { payload: `attack:${mode}:burst=${burst}` }];
}

// ---------- SINGLE NORMAL PACKET ----------
return [{ payload: makePayload() }, null];
