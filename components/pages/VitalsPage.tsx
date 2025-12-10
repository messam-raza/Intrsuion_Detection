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
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL as string
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

  // 👉 Dummy live generator (for demo)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date()
      const spo2 = 92 + Math.floor(Math.random() * 8)
      const pulse = 70 + Math.floor(Math.random() * 50)
      const isAttack = Math.random() < 0.15

      const record: EventRecord = {
        device_id: "demo-01",
        spo2,
        pulse,
        prediction: isAttack ? "ATTACK" : "NORMAL",
        confidence: Math.random(),
        timestamp: now.toISOString(),
      }

      setCurrentVitals({
        spo2,
        pulse,
        status: isAttack ? "ATTACK" : "NORMAL",
        confidence: Math.random(),
      })

      setEvents((prev) => [record, ...prev].slice(0, 200))

      setStats((prev) => ({
        normal: prev.normal + (isAttack ? 0 : 1),
        attack: prev.attack + (isAttack ? 1 : 0),
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // 👉 WebSocket for live updates
  useEffect(() => {
    const ws = new WebSocket(WS_URL)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const record: EventRecord = JSON.parse(event.data)
        setCurrentVitals({
          spo2: record.spo2 || 0,
          pulse: record.pulse || 0,
          status: (record.prediction || "NORMAL").toUpperCase(),
          confidence: record.confidence || 0,
        })

        setEvents((prev) => [record, ...prev].slice(0, 200))

        const pred = (record.prediction || "").toUpperCase()
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred !== "NORMAL" ? 1 : 0),
        }))
      } catch {}
    }

    return () => ws.close()
  }, [])

  const total = stats.normal + stats.attack
  const normalRate = total ? ((stats.normal / total) * 100).toFixed(1) : "0"
  const attackRate = total ? ((stats.attack / total) * 100).toFixed(1) : "0"
  const isAlert = currentVitals.status !== "NORMAL"

  return (
    <div>
      <div style={{ marginBottom: "3rem" }}>
        <h1 className="card-title" style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
          Vitals Overview
        </h1>
        <p className="card-subtitle" style={{ fontSize: "1rem" }}>
          Real-time monitoring of patient vitals with threat detection
        </p>
      </div>

      {/* STATS GRID */}
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
            style={{
              color: isAlert ? "#ef4444" : "#34d399",
            }}
          >
            {stats.attack}
          </div>
          <div className="stat-change" style={{ color: isAlert ? "#f87171" : "#34d399" }}>
            {isAlert ? "⚠ Active" : "✓ None"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: "1.5rem" }}>
            {connected ? "🟢" : "🔴"}
          </div>
          <div className="stat-change">{connected ? "Connected" : "Offline"}</div>
        </div>
      </div>

      {/* VITALS CARDS */}
      <div className="vitals-grid">
        <div className={`vital-card ${currentVitals.status === "NORMAL" ? "" : "alert"}`}>
          <div className="vital-label">Oxygen Saturation</div>
          <div className="vital-value">{currentVitals.spo2}%</div>
          <div className="vital-unit">SpO₂ Level</div>
          <div className="vital-status">
            <div className={`status-indicator ${currentVitals.status === "NORMAL" ? "" : "alert"}`}></div>
            <span>{currentVitals.status === "NORMAL" ? "Normal" : "Alert"}</span>
          </div>
        </div>

        <div className={`vital-card ${currentVitals.status === "NORMAL" ? "" : "alert"}`}>
          <div className="vital-label">Heart Rate</div>
          <div className="vital-value">
            {currentVitals.pulse} <span style={{ fontSize: "1.2rem" }}>bpm</span>
          </div>
          <div className="vital-unit">Beats Per Minute</div>
          <div className="vital-status">
            <div className={`status-indicator ${currentVitals.status === "NORMAL" ? "" : "alert"}`}></div>
            <span>{currentVitals.status === "NORMAL" ? "Normal Range" : "Abnormal"}</span>
          </div>
        </div>

        <div className={`vital-card ${currentVitals.status === "NORMAL" ? "" : "alert"}`}>
          <div className="vital-label">Detection Confidence</div>
          <div className="vital-value">{(currentVitals.confidence * 100).toFixed(1)}%</div>
          <div className="vital-unit">Classification Confidence</div>
          <div className="vital-status">
            <div className={`status-indicator ${currentVitals.confidence > 0.7 ? "" : "alert"}`}></div>
            <span>{currentVitals.confidence > 0.7 ? "High Confidence" : "Low Confidence"}</span>
          </div>
        </div>

        <div className={`vital-card ${currentVitals.status === "NORMAL" ? "" : "alert"}`}>
          <div className="vital-label">Classification</div>
          <div className="vital-value" style={{ fontSize: "1.8rem" }}>
            {currentVitals.status}
          </div>
          <div className="vital-unit">Current Status</div>
          <div className="vital-status">
            <div className={`status-indicator ${currentVitals.status === "NORMAL" ? "" : "alert"}`}></div>
            <span>{currentVitals.status === "NORMAL" ? "Secure" : "Threat Detected"}</span>
          </div>
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
