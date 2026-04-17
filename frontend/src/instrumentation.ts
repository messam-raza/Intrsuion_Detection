/**
 * Next.js instrumentation hook.
 *
 * Runs once per server process (Node.js runtime only). We use it to boot the
 * vitals Socket.IO bridge so every telemetry frame emitted by the detector
 * backend gets persisted to MongoDB — even when no browser tab is open.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startVitalsBridge } = await import("./lib/socketBridge");
  await startVitalsBridge();
}
