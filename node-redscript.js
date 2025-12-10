// Accepts ticks (Date payload) AND control JSON {cmd, duration, spoof_id, burst}
// Output1: data  → edge/pi-01/in/oxi-001
// Output2: status → edge/pi-01/in/oxi-001/status (retained)

const nowSec = Date.now() / 1000;

// -------- CONTROL MESSAGES (attack mode switching) ----------
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

  // Set burst count based on attack type
  let burstCount = Number(burst) || 0;
  if (mode === "flood" && burstCount === 0) {
    burstCount = 50; // Default high burst for flood attacks
  } else if ((mode === "desat" || mode === "spike") && burstCount === 0) {
    burstCount = 20; // Moderate burst for other attacks
  }
  flow.set("burst", burstCount);

  node.status({
    fill: mode === "normal" ? "green" : "red",
    shape: "dot",
    text: `mode=${mode} dur=${duration || "-"} burst=${burstCount}`,
  });

  // announce status on output 2
  const statusPayload = mode === "normal" ? "online" : `attack:${mode}`;

  return [null, { payload: statusPayload }];
}

// -------- NORMAL TICK (Date input) ----------
let seq = flow.get("seq") || 0;
let spo2 = flow.get("spo2");
let pulse = flow.get("pulse");

if (spo2 === undefined) spo2 = 98.0;
if (pulse === undefined) pulse = 75.0;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

// current mode
let mode = flow.get("mode") || "normal";
const until = flow.get("mode_until") || 0;

// auto-reset mode when duration expires
if (until && nowSec > until) {
  mode = "normal";
  flow.set("mode", "normal");
  flow.set("mode_until", 0);
  flow.set("spoof_id", null);
  flow.set("burst", 0);
  node.status({ fill: "green", shape: "dot", text: "mode=normal dur=-" });
}

// baseline jitter (unless frozen)
if (mode !== "freeze") {
  spo2 = clamp(spo2 + (Math.random() - 0.5) * 0.4, 90, 100);
  pulse = clamp(pulse + (Math.random() - 0.5) * 3.0, 45, 130);
}

// -------- APPLY ATTACK MODES ----------
// NOTE: For ML model to detect attacks, we need network-level anomalies
// This is primarily achieved through BURST (rapid message sending)
switch (mode) {
  case "desat": // oxygen desaturation attack
    spo2 = clamp(spo2 - (2 + Math.random() * 6), 75, 100); // drop 2–8% (lower min for detection)
    break;

  case "spike": // heart rate spike attack
    pulse = clamp(pulse + (20 + Math.random() * 40), 45, 200); // +20..60 bpm (higher for detection)
    break;

  case "freeze": // freeze vitals (no change) – already handled
    // Send rapid duplicate messages to create network anomaly
    break;

  case "impersonate": // device spoofing – will change device_id below
    // Creates new flow with different device_id
    break;

  case "flood": // high-rate flooding – handled after payload generation
    // Creates very high packet rate
    break;

  default:
    // 'normal'
    break;
}

// persist new state
seq += 1;
flow.set("seq", seq);
flow.set("spo2", spo2);
flow.set("pulse", pulse);

// base + spoofed IDs
const baseDevice = "oxi-001";
const spoofId = flow.get("spoof_id");
const deviceId = mode === "impersonate" && spoofId ? spoofId : baseDevice;

// set status field depending on mode
let statusText = "ok";
if (mode === "desat" || mode === "spike" || mode === "impersonate") {
  statusText = "alert";
}
if (mode === "flood") {
  statusText = "error";
}

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

// Send burst for attack modes (creates network-level anomalies for ML detection)
const burst = flow.get("burst") || 0;

if (burst > 0 && mode !== "normal") {
  // For attacks: send burst of messages rapidly
  // This creates high packet rate that the ML model can detect
  for (let i = 0; i < burst; i++) {
    node.send([{ payload: makePayload(seq + i) }, null]);
  }
  // advance seq after burst
  flow.set("seq", seq + burst - 1);

  // Also send status update for this tick
  return [null, { payload: `attack:${mode}:burst=${burst}` }];
}

// normal single packet (or after attack duration expires)
return [{ payload: makePayload() }, null];
