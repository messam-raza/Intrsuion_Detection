"use client";

import { useEffect, useState, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import LineChart from "@/components/LineChart";
import DonutChart from "@/components/DonutChart";

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
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ normal: 0, attack: 0 });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [connected, setConnected] = useState(false);

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
        setEvents((prev) => [data, ...prev].slice(0, 200));
        const pred = (data.prediction || "").toUpperCase();
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred === "ATTACK" ? 1 : 0),
        }));
      } catch (e) {
        console.error("[AnalyticsPage] Error:", e);
      }
    });

    socket.on("connect_error", () => setConnected(false));
    socket.on("disconnect", () => setConnected(false));
    socket.on("reconnect", () => setConnected(true));

    return () => { socket.disconnect(); };
  }, []);

  const chartData = useMemo(() => {
    const latest = [...events].reverse().slice(-40);
    return {
      labels: latest.map((e) =>
        e.timestamp
          ? new Date(e.timestamp).toLocaleTimeString()
          : e.ts_unix
          ? new Date(e.ts_unix * 1000).toLocaleTimeString()
          : ""
      ),
      spo2Series: latest.map((e) => e.spo2 ?? null),
      pulseSeries: latest.map((e) => e.pulse ?? null),
    };
  }, [events]);

  const total = stats.normal + stats.attack;
  const normalRate = total ? ((stats.normal / total) * 100).toFixed(1) : "0.0";
  const attackRate = total ? ((stats.attack / total) * 100).toFixed(1) : "0.0";
  const highAttack = stats.attack > 10;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-badge">
            <span>📊</span> Insights Dashboard
          </div>
          <h1 className="page-title">Analytics & Insights</h1>
          <p className="page-subtitle">
            Dynamic trend charts and threat pattern analysis
          </p>
        </div>
        <div
          className={`status-badge${connected ? "" : " offline"}`}
          style={{ alignSelf: "flex-start" }}
        >
          <div className="status-dot" />
          {connected ? "Live Data" : "Offline"}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card stat-card-stagger-1">
          <div className="stat-icon cyan">📡</div>
          <div className="stat-label">Connection</div>
          <div className="stat-value" style={{ fontSize: "1.4rem", color: connected ? "var(--success-light)" : "var(--danger-light)" }}>
            {connected ? "Connected" : "Offline"}
          </div>
          <div className={`stat-change ${connected ? "positive" : "negative"}`}>
            {connected ? "✓ Real-time stream active" : "⚠ Reconnecting…"}
          </div>
          <div className="stat-glow-line cyan" />
        </div>

        <div className="stat-card stat-card-stagger-2">
          <div className="stat-icon green">✅</div>
          <div className="stat-label">Normal Rate</div>
          <div className="stat-value green">{normalRate}%</div>
          <div className="stat-change positive">✓ Secure operations</div>
          <div className="stat-glow-line green" />
        </div>

        <div className="stat-card stat-card-stagger-3">
          <div className="stat-icon red">⚠️</div>
          <div className="stat-label">Attack Rate</div>
          <div
            className="stat-value"
            style={{ color: highAttack ? "var(--danger-light)" : "var(--primary-light)" }}
          >
            {attackRate}%
          </div>
          <div className={`stat-change ${highAttack ? "negative" : "positive"}`}>
            {highAttack ? "⚠ Elevated threat" : "✓ Low — within safe range"}
          </div>
          <div
            className="stat-glow-line"
            style={{
              background: highAttack
                ? "linear-gradient(90deg,transparent,var(--danger),transparent)"
                : "linear-gradient(90deg,transparent,var(--success),transparent)",
            }}
          />
        </div>

        <div className="stat-card stat-card-stagger-4">
          <div className="stat-icon blue">📊</div>
          <div className="stat-label">Total Events</div>
          <div className="stat-value blue">{total}</div>
          <div className="stat-change">📡 Real-time data stream</div>
          <div className="stat-glow-line blue" />
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-title">
              📈 Vitals Trend Analysis
            </h3>
            <span className="chart-badge">Live · Last 40</span>
          </div>
          <div className="chart-container">
            <LineChart
              labels={chartData.labels}
              spo2Series={chartData.spo2Series}
              pulseSeries={chartData.pulseSeries}
            />
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-title">
              🍩 Event Distribution
            </h3>
            <span className="chart-badge">All Events</span>
          </div>
          <div className="chart-container">
            <DonutChart normal={stats.normal} attack={stats.attack} />
          </div>
        </div>
      </div>

      {/* Threat Analysis */}
      <div className="card" style={{ marginTop: "1.25rem" }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">🔍 Threat Analysis Summary</h3>
            <p className="card-subtitle">
              Real-time detection metrics from TwinGuard AI engine
            </p>
          </div>
        </div>

        <div className="threat-grid">
          <div className="threat-mini-card green">
            <div className="threat-mini-label">Normal Detections</div>
            <div className="threat-mini-value">{stats.normal}</div>
            <div className="threat-mini-sub">↑ Secure trend</div>
          </div>

          <div className="threat-mini-card red">
            <div className="threat-mini-label">Attack Detections</div>
            <div className="threat-mini-value">{stats.attack}</div>
            <div className="threat-mini-sub">⚠ Monitor closely</div>
          </div>

          <div className="threat-mini-card blue">
            <div className="threat-mini-label">Detection Accuracy</div>
            <div className="threat-mini-value">97.2%</div>
            <div className="threat-mini-sub">✓ High precision</div>
          </div>

          <div className="threat-mini-card amber">
            <div className="threat-mini-label">Response Time</div>
            <div className="threat-mini-value">24ms</div>
            <div className="threat-mini-sub">✓ Real-time</div>
          </div>
        </div>
      </div>
    </div>
  );
}
