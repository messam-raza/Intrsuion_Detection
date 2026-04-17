"use client"

interface EventRecord {
  device_id?: string
  spo2?: number
  pulse?: number
  prediction?: string
  confidence?: number
  timestamp?: string
  ts_unix?: number
}

function formatTime(ts?: string | number) {
  try {
    if (!ts) return "—"
    const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts)
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  } catch {
    return String(ts)
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    pct >= 80 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          width: 56,
          height: 4,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 99,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 99,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        {pct}%
      </span>
    </div>
  )
}

export default function EventsTable({ events }: { events: EventRecord[] }) {
  if (events.length === 0) {
    return (
      <div className="table-waiting">
        <div className="table-waiting-icon">⟳</div>
        <div className="table-waiting-text">Waiting for live data stream…</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
          Connect to the WebSocket server to begin receiving events
        </div>
      </div>
    )
  }

  return (
    <table className="table" aria-label="Live events stream">
      <thead>
        <tr>
          <th>Time</th>
          <th>Device</th>
          <th>SpO₂</th>
          <th>Pulse</th>
          <th>Status</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e, idx) => {
          const pred = (e.prediction || "").toUpperCase()
          const isNormal = pred === "NORMAL"
          return (
            <tr
              key={idx}
              className={isNormal ? "table-row-normal" : "table-row-attack"}
            >
              <td>{formatTime(e.timestamp || e.ts_unix)}</td>
              <td style={{ color: "var(--text-accent)", fontWeight: 600 }}>
                {e.device_id || "—"}
              </td>
              <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                {e.spo2 != null ? `${e.spo2}%` : "—"}
              </td>
              <td style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                {e.pulse != null ? `${e.pulse} bpm` : "—"}
              </td>
              <td>
                {isNormal ? (
                  <span className="badge badge-normal">✓ Normal</span>
                ) : (
                  <span className="badge badge-attack">⚠ {pred || "Attack"}</span>
                )}
              </td>
              <td>
                {e.confidence != null ? (
                  <ConfidenceBar value={e.confidence} />
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
