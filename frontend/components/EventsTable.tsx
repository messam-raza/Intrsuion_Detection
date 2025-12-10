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
    if (!ts) return "-"
    if (typeof ts === "number") return new Date(ts * 1000).toLocaleTimeString()
    return new Date(ts).toLocaleTimeString()
  } catch {
    return String(ts)
  }
}

export default function EventsTable({ events }: { events: EventRecord[] }) {
  return (
    <table className="table">
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
        {events.length === 0 && (
          <tr>
            <td colSpan={6} style={{ textAlign: "center", padding: "1rem" }}>
              Waiting for live data...
            </td>
          </tr>
        )}

        {events.map((e, idx) => {
          const pred = (e.prediction || "").toUpperCase()
          const normal = pred === "NORMAL"

          return (
            <tr key={idx} className={normal ? "table-row-normal" : "table-row-attack"}>
              <td>{formatTime(e.timestamp || e.ts_unix)}</td>
              <td>{e.device_id || "—"}</td>
              <td>{e.spo2 ?? "—"}%</td>
              <td>{e.pulse ?? "—"} bpm</td>
              <td>
                {normal ? (
                  <span className="badge badge-normal">✓ NORMAL</span>
                ) : (
                  <span className="badge badge-attack">⚠ {pred}</span>
                )}
              </td>
              <td>{e.confidence != null ? `${(e.confidence * 100).toFixed(1)}%` : "—"}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
