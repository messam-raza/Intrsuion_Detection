"use client"

import { useEffect, useState } from "react"
import EventsTable from "@/components/EventsTable"

interface EventRecord {
  device_id?: string
  spo2?: number
  pulse?: number
  prediction?: string
  confidence?: number
  timestamp?: string
  ts_unix?: number
  flow_stats?: {
    rate?: string
    duration?: string
  }
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL as string

export default function VitalsPage() {
  const [stats, setStats] = useState({ normal: 0, attack: 0 })
  const [events, setEvents] = useState<EventRecord[]>([])
  const [connected, setConnected] = useState(false)

  const [currentVitals, setCurrentVitals] = useState({
    spo2: 0,
    pulse: 0,
    status: "NORMAL",
    confidence: 0,
  })

  // 👉 LIVE WEBSOCKET LISTENER
  useEffect(() => {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const record: EventRecord = JSON.parse(event.data)

        // Update vitals
        setCurrentVitals({
          spo2: record.spo2 || 0,
          pulse: record.pulse || 0,
          status: (record.prediction || "NORMAL").toUpperCase(),
          confidence: record.confidence || 0,
        })

        // Push to events list
        setEvents((prev) => [record, ...prev].slice(0, 200))

        // Update stats
        const pred = (record.prediction || "").toUpperCase()
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred !== "NORMAL" ? 1 : 0),
        }))
      } catch (err) {
        console.error("WS message error:", err)
      }
    }

    return () => ws.close()
  }, [])

  const total = stats.normal + stats.attack
  const normalRate = total ? ((stats.normal / total) * 100).toFixed(1) : "0"
  const attackRate = total ? ((stats.attack / total) * 100).toFixed(1) : "0"
  const isAlert = currentVitals.status !== "NORMAL"

  // Latest event object
  const latest = events[0]

  return (
    <div>
      {/* HEADER */}
      <div style={{ marginBottom: "3rem" }}>
        <h1 className="card-title" style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          Vitals Overview
        </h1>
        <p className="card-subtitle" style={{ fontSize: "1rem" }}>
          Real-time monitoring of patient vitals with threat detection
        </p>
      </div>

      {/* STAT CARDS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{total}</div>
          <div className="stat-change">✓ All systems operational</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Normal Events</div>
          <div className="stat-value">{stats.normal}</div>
          <div className="stat-change">↑ {normalRate}% of total</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Attack Events</div>
          <div
            className="stat-value"
            style={{ color: isAlert ? "#ef4444" : "#34d399" }}
          >
            {stats.attack}
          </div>
          <div className="stat-change" style={{ color: isAlert ? "#f87171" : "#34d399" }}>
            {isAlert ? "⚠ Active" : "✓ None"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Connection</div>
          <div className="stat-value" style={{ fontSize: "1.5rem" }}>
            {connected ? "🟢" : "🔴"}
          </div>
          <div className="stat-change">{connected ? "Connected" : "Offline"}</div>
        </div>
      </div>

      {/* VITAL CARDS */}
      <div className="vitals-grid">
        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-label">Oxygen Saturation</div>
          <div className="vital-value">{currentVitals.spo2}%</div>
          <div className="vital-unit">SpO₂ Level</div>
        </div>

        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-label">Heart Rate</div>
          <div className="vital-value">
            {currentVitals.pulse} <span style={{ fontSize: "1.2rem" }}>bpm</span>
          </div>
        </div>

        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-label">Confidence</div>
          <div className="vital-value">{(currentVitals.confidence * 100).toFixed(1)}%</div>
        </div>

        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-label">Classification</div>
          <div className="vital-value" style={{ fontSize: "1.8rem" }}>
            {currentVitals.status}
          </div>
        </div>
      </div>

      {/* NETWORK STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Packets/sec</div>
          <div className="stat-value">{latest?.flow_stats?.rate || "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Duration</div>
          <div className="stat-value">{latest?.flow_stats?.duration || "—"}</div>
        </div>
      </div>

      {/* EVENTS TABLE */}
      <div className="table-wrapper">
        <h2 className="table-header">Recent Events</h2>
        <div className="table-scroll">
          <EventsTable events={events} />
        </div>
      </div>
    </div>
  )
}
