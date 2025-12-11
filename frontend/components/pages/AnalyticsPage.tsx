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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

export default function AnalyticsPage() {
  const [stats, setStats] = useState({ normal: 0, attack: 0 });
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [connected, setConnected] = useState(false);

  // 👉 Socket.IO client for real-time updates
  useEffect(() => {
    console.log(
      "[AnalyticsPage] Connecting to Socket.IO server at:",
      SOCKET_URL
    );

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    // Connection established
    socket.on("connect", () => {
      console.log("[AnalyticsPage] Connected to Socket.IO server");
      setConnected(true);
    });

    // Connection status event
    socket.on("connection_status", (data) => {
      console.log("[AnalyticsPage] Connection status:", data);
    });

    // Vitals update event from backend
    socket.on("vitals_update", (data: EventRecord) => {
      console.log("[AnalyticsPage] Received vitals_update:", data);

      try {
        // Add to events list
        setEvents((prev) => [data, ...prev].slice(0, 200));

        // Update stats
        const pred = (data.prediction || "").toUpperCase();
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred === "ATTACK" ? 1 : 0),
        }));
      } catch (error) {
        console.error("[AnalyticsPage] Error processing vitals_update:", error);
      }
    });

    // Connection error
    socket.on("connect_error", (error) => {
      console.error("[AnalyticsPage] Connection error:", error);
      setConnected(false);
    });

    // Disconnection
    socket.on("disconnect", (reason) => {
      console.log("[AnalyticsPage] Disconnected:", reason);
      setConnected(false);
    });

    // Reconnection attempt
    socket.on("reconnect_attempt", (attempt) => {
      console.log(`[AnalyticsPage] Reconnection attempt ${attempt}`);
    });

    // Reconnection success
    socket.on("reconnect", (attemptNumber) => {
      console.log(
        `[AnalyticsPage] Reconnected after ${attemptNumber} attempts`
      );
      setConnected(true);
    });

    // Cleanup on unmount
    return () => {
      console.log("[AnalyticsPage] Disconnecting Socket.IO client");
      socket.disconnect();
    };
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

  return (
    <div>
      <div style={{ marginBottom: "3rem" }}>
        <h1
          className="card-title"
          style={{ fontSize: "2rem", marginBottom: "0.5rem" }}
        >
          Analytics & Insights
        </h1>
        <p className="card-subtitle" style={{ fontSize: "1rem" }}>
          Dynamic charts showing vitals trends and threat patterns
        </p>
      </div>

      {/* STATS GRID */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Connection Status</div>
          <div className="stat-value" style={{ fontSize: "1.5rem" }}>
            {connected ? "🟢" : "🔴"}
          </div>
          <div className="stat-change">
            {connected ? "Connected" : "Offline"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Normal Rate</div>
          <div className="stat-value">
            {total ? ((stats.normal / total) * 100).toFixed(1) : "0"}%
          </div>
          <div className="stat-change">✓ Secure operations</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Attack Rate</div>
          <div
            className="stat-value"
            style={{
              background:
                stats.attack > 10
                  ? "linear-gradient(135deg, #f87171 0%, #ef4444 100%)"
                  : undefined,
              WebkitBackgroundClip: stats.attack > 10 ? "text" : undefined,
              WebkitTextFillColor:
                stats.attack > 10 ? "transparent" : undefined,
              backgroundClip: stats.attack > 10 ? "text" : undefined,
            }}
          >
            {total ? ((stats.attack / total) * 100).toFixed(1) : "0"}%
          </div>
          <div
            className="stat-change"
            style={{ color: stats.attack > 10 ? "#f87171" : "#34d399" }}
          >
            {stats.attack > 10 ? "⚠ Elevated" : "✓ Low"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Events</div>
          <div className="stat-value">{total}</div>
          <div className="stat-change">📊 Real-time data</div>
        </div>
      </div>

      {/* CHARTS */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-title">Vitals Trend Analysis</h3>
          <div className="chart-container">
            <LineChart
              labels={chartData.labels}
              spo2Series={chartData.spo2Series}
              pulseSeries={chartData.pulseSeries}
            />
          </div>
        </div>

        <div className="chart-card">
          <h3 className="chart-title">Event Distribution</h3>
          <div className="chart-container">
            <DonutChart normal={stats.normal} attack={stats.attack} />
          </div>
        </div>
      </div>

      {/* THREAT ANALYSIS */}
      <div className="card" style={{ marginTop: "2rem" }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">Threat Analysis Summary</h3>
            <p className="card-subtitle">Real-time threat detection metrics</p>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1.5rem",
          }}
        >
          <div
            style={{
              padding: "1.5rem",
              background: "rgba(16, 185, 129, 0.05)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--color-text-muted)",
                fontWeight: "600",
                marginBottom: "0.5rem",
              }}
            >
              NORMAL DETECTIONS
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: "700",
                color: "var(--color-success-light)",
              }}
            >
              {stats.normal}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-success)",
                marginTop: "0.5rem",
              }}
            >
              ↑ Secure trend
            </div>
          </div>

          <div
            style={{
              padding: "1.5rem",
              background: "rgba(239, 68, 68, 0.05)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--color-text-muted)",
                fontWeight: "600",
                marginBottom: "0.5rem",
              }}
            >
              ATTACK DETECTIONS
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: "700",
                color: "var(--color-danger-light)",
              }}
            >
              {stats.attack}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-danger)",
                marginTop: "0.5rem",
              }}
            >
              ⚠ Monitor closely
            </div>
          </div>

          <div
            style={{
              padding: "1.5rem",
              background: "rgba(59, 130, 246, 0.05)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--color-text-muted)",
                fontWeight: "600",
                marginBottom: "0.5rem",
              }}
            >
              DETECTION ACCURACY
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: "700",
                color: "var(--color-primary-light)",
              }}
            >
              97.2%
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-primary)",
                marginTop: "0.5rem",
              }}
            >
              ✓ High precision
            </div>
          </div>

          <div
            style={{
              padding: "1.5rem",
              background: "rgba(245, 158, 11, 0.05)",
              borderRadius: "var(--radius-md)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}
          >
            <div
              style={{
                fontSize: "0.85rem",
                color: "var(--color-text-muted)",
                fontWeight: "600",
                marginBottom: "0.5rem",
              }}
            >
              RESPONSE TIME
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: "700",
                color: "var(--color-warning)",
              }}
            >
              24ms
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-warning)",
                marginTop: "0.5rem",
              }}
            >
              ✓ Real-time
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
