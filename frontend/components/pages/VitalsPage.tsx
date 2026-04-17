"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import EventsTable from "@/components/EventsTable";

interface EventRecord {
  device_id?: string;
  spo2?: number;
  pulse?: number;
  prediction?: string;
  confidence?: number;
  timestamp?: string;
  ts_unix?: number;
}

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "https://cf13cb41311e.ngrok-free.app";

export default function VitalsPage() {
  const [stats, setStats] = useState({ normal: 0, attack: 0 });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentVitals, setCurrentVitals] = useState({
    spo2: 0,
    pulse: 0,
    status: "NORMAL",
    confidence: 0,
  });

  useEffect(() => {
    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => setConnected(true));

    socket.on("vitals_update", (data: EventRecord) => {
      try {
        setCurrentVitals({
          spo2: data.spo2 || 0,
          pulse: data.pulse || 0,
          status: (data.prediction || "NORMAL").toUpperCase(),
          confidence: data.confidence || 0,
        });
        setEvents((prev) => [data, ...prev].slice(0, 200));
        const pred = (data.prediction || "").toUpperCase();
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred === "ATTACK" ? 1 : 0),
        }));
      } catch (e) {
        console.error("[VitalsPage] Error:", e);
      }
    });

    socket.on("connect_error", () => setConnected(false));
    socket.on("disconnect", () => setConnected(false));
    socket.on("reconnect", () => setConnected(true));

    return () => { socket.disconnect(); };
  }, []);

  const total = stats.normal + stats.attack;
  const normalRate = total ? ((stats.normal / total) * 100).toFixed(1) : "0.0";
  const attackRate = total ? ((stats.attack / total) * 100).toFixed(1) : "0.0";
  const isAlert = currentVitals.status !== "NORMAL";
  const confidencePct = (currentVitals.confidence * 100).toFixed(1);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-badge">
            <span>●</span> Real-Time Monitoring
          </div>
          <h1 className="page-title">Patient Vitals</h1>
          <p className="page-subtitle">
            Live physiological data with ML-powered anomaly detection
          </p>
        </div>
        <div
          className={`status-badge${connected ? "" : " offline"}`}
          style={{ alignSelf: "flex-start" }}
          aria-label={connected ? "Connected" : "Disconnected"}
        >
          <div className="status-dot" />
          {connected ? "Live" : "Offline"}
        </div>
      </div>

      {/* STATS GRID */}
      <div className="stats-grid">
        {/* Total Events */}
        <div className="stat-card stat-card-stagger-1">
          <div className="stat-icon cyan">📡</div>
          <div className="stat-label">Total Events</div>
          <div className="stat-value cyan">{total}</div>
          <div className="stat-change positive">
            ✓ All systems operational
          </div>
          <div className="stat-glow-line cyan" />
        </div>

        {/* Normal Events */}
        <div className="stat-card stat-card-stagger-2">
          <div className="stat-icon green">✅</div>
          <div className="stat-label">Normal Events</div>
          <div className="stat-value green">{stats.normal}</div>
          <div className="stat-change positive">
            ↑ {normalRate}% of total
          </div>
          <div className="stat-glow-line green" />
        </div>

        {/* Attack Events */}
        <div className="stat-card stat-card-stagger-3">
          <div className="stat-icon red">⚠️</div>
          <div className="stat-label">Attack Events</div>
          <div
            className="stat-value"
            style={{ color: isAlert ? "var(--danger-light)" : "var(--success-light)" }}
          >
            {stats.attack}
          </div>
          <div className={`stat-change ${isAlert ? "negative" : "positive"}`}>
            {isAlert ? "⚠ Threat Active" : "✓ None Detected"}
          </div>
          <div
            className="stat-glow-line"
            style={{
              background: isAlert
                ? "linear-gradient(90deg, transparent, var(--danger), transparent)"
                : "linear-gradient(90deg, transparent, var(--success), transparent)",
            }}
          />
        </div>

        {/* Attack Rate */}
        <div className="stat-card stat-card-stagger-4">
          <div className="stat-icon blue">📊</div>
          <div className="stat-label">Attack Rate</div>
          <div
            className="stat-value"
            style={{ color: parseFloat(attackRate) > 10 ? "var(--danger-light)" : "var(--primary-light)" }}
          >
            {attackRate}%
          </div>
          <div className={`stat-change ${parseFloat(attackRate) > 10 ? "negative" : "positive"}`}>
            {parseFloat(attackRate) > 10 ? "⚠ Elevated risk" : "✓ Within range"}
          </div>
          <div className="stat-glow-line blue" />
        </div>
      </div>

      {/* VITALS GRID */}
      <div className="vitals-grid">
        {/* SpO2 */}
        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-card-top">
            <div>
              <div className="vital-label">Oxygen Saturation</div>
              <div className="vital-value">{currentVitals.spo2}%</div>
              <div className="vital-unit">SpO₂ Level</div>
            </div>
            <div className="vital-icon">🫁</div>
          </div>
          <div className="vital-status">
            <div className={`status-indicator${isAlert ? " alert" : ""}`} />
            <span>{isAlert ? "Out of Range" : "Normal Range"}</span>
          </div>
          <div className="vital-accent-bar" />
        </div>

        {/* Pulse */}
        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-card-top">
            <div>
              <div className="vital-label">Heart Rate</div>
              <div className="vital-value">
                {currentVitals.pulse}
                <span style={{ fontSize: "1rem", fontWeight: 600 }}> bpm</span>
              </div>
              <div className="vital-unit">Beats Per Minute</div>
            </div>
            <div className="vital-icon">❤️</div>
          </div>
          <div className="vital-status">
            <div className={`status-indicator${isAlert ? " alert" : ""}`} />
            <span>{isAlert ? "Abnormal Rhythm" : "Normal Rhythm"}</span>
          </div>
          <div className="vital-accent-bar" />
        </div>

        {/* Confidence */}
        <div className={`vital-card ${total > 0 && currentVitals.confidence > 0 && currentVitals.confidence < 0.7 ? "alert" : ""}`}>
          <div className="vital-card-top">
            <div>
              <div className="vital-label">Detection Confidence</div>
              <div className="vital-value">{confidencePct}%</div>
              <div className="vital-unit">Classification Score</div>
            </div>
            <div className="vital-icon">🧠</div>
          </div>
          <div className="vital-status">
            <div className={`status-indicator${currentVitals.confidence < 0.7 ? " alert" : ""}`} />
            <span>{currentVitals.confidence > 0.7 ? "High Confidence" : "Low Confidence"}</span>
          </div>
          <div className="vital-accent-bar" />
        </div>

        {/* Classification */}
        <div className={`vital-card ${isAlert ? "alert" : ""}`}>
          <div className="vital-card-top">
            <div>
              <div className="vital-label">Classification</div>
              <div className="vital-value" style={{ fontSize: "1.7rem", letterSpacing: "-0.03em" }}>
                {currentVitals.status}
              </div>
              <div className="vital-unit">Current Status</div>
            </div>
            <div className="vital-icon">{isAlert ? "🚨" : "🛡️"}</div>
          </div>
          <div className="vital-status">
            <div className={`status-indicator${isAlert ? " alert" : ""}`} />
            <span>{isAlert ? "Threat Detected" : "System Secure"}</span>
          </div>
          <div className="vital-accent-bar" />
        </div>
      </div>

      {/* EVENTS TABLE */}
      <div className="table-wrapper">
        <div className="table-header-row">
          <h2 className="table-header">
            Live Event Stream
            <span className="table-count-badge">{events.length}</span>
          </h2>
        </div>
        <div className="table-scroll">
          <EventsTable events={events} />
        </div>
      </div>
    </div>
  );
}
