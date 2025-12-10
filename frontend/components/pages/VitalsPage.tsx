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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000";

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

  // 👉 Socket.IO client for real-time updates
  useEffect(() => {
    console.log("[VitalsPage] Connecting to Socket.IO server at:", SOCKET_URL);

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    // Connection established
    socket.on("connect", () => {
      console.log("[VitalsPage] Connected to Socket.IO server");
      setConnected(true);
    });

    // Connection status event
    socket.on("connection_status", (data) => {
      console.log("[VitalsPage] Connection status:", data);
    });

    // Vitals update event from backend
    socket.on("vitals_update", (data: EventRecord) => {
      console.log("[VitalsPage] Received vitals_update:", data);

      try {
        // Update current vitals display
        setCurrentVitals({
          spo2: data.spo2 || 0,
          pulse: data.pulse || 0,
          status: (data.prediction || "NORMAL").toUpperCase(),
          confidence: data.confidence || 0,
        });

        // Add to events list
        setEvents((prev) => [data, ...prev].slice(0, 200));

        // Update stats
        const pred = (data.prediction || "").toUpperCase();
        setStats((prev) => ({
          normal: prev.normal + (pred === "NORMAL" ? 1 : 0),
          attack: prev.attack + (pred === "ATTACK" ? 1 : 0),
        }));
      } catch (error) {
        console.error("[VitalsPage] Error processing vitals_update:", error);
      }
    });

    // Connection error
    socket.on("connect_error", (error) => {
      console.error("[VitalsPage] Connection error:", error);
      setConnected(false);
    });

    // Disconnection
    socket.on("disconnect", (reason) => {
      console.log("[VitalsPage] Disconnected:", reason);
      setConnected(false);
    });

    // Reconnection attempt
    socket.on("reconnect_attempt", (attempt) => {
      console.log(`[VitalsPage] Reconnection attempt ${attempt}`);
    });

    // Reconnection success
    socket.on("reconnect", (attemptNumber) => {
      console.log(`[VitalsPage] Reconnected after ${attemptNumber} attempts`);
      setConnected(true);
    });

    // Cleanup on unmount
    return () => {
      console.log("[VitalsPage] Disconnecting Socket.IO client");
      socket.disconnect();
    };
  }, []);

  const total = stats.normal + stats.attack;
  const normalRate = total ? ((stats.normal / total) * 100).toFixed(1) : "0";
  const attackRate = total ? ((stats.attack / total) * 100).toFixed(1) : "0";
  const isAlert = currentVitals.status !== "NORMAL";

  return (
    <div>
      <div style={{ marginBottom: "3rem" }}>
        <h1
          className="card-title"
          style={{ fontSize: "2rem", marginBottom: "0.5rem" }}
        >
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
          <div
            className="stat-change"
            style={{ color: isAlert ? "#f87171" : "#34d399" }}
          >
            {isAlert ? "⚠ Active" : "✓ None"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: "1.5rem" }}>
            {connected ? "🟢" : "🔴"}
          </div>
          <div className="stat-change">
            {connected ? "Connected" : "Offline"}
          </div>
        </div>
      </div>

      {/* VITALS CARDS */}
      <div className="vitals-grid">
        <div
          className={`vital-card ${
            currentVitals.status === "NORMAL" ? "" : "alert"
          }`}
        >
          <div className="vital-label">Oxygen Saturation</div>
          <div className="vital-value">{currentVitals.spo2}%</div>
          <div className="vital-unit">SpO₂ Level</div>
          <div className="vital-status">
            <div
              className={`status-indicator ${
                currentVitals.status === "NORMAL" ? "" : "alert"
              }`}
            ></div>
            <span>
              {currentVitals.status === "NORMAL" ? "Normal" : "Alert"}
            </span>
          </div>
        </div>

        <div
          className={`vital-card ${
            currentVitals.status === "NORMAL" ? "" : "alert"
          }`}
        >
          <div className="vital-label">Heart Rate</div>
          <div className="vital-value">
            {currentVitals.pulse}{" "}
            <span style={{ fontSize: "1.2rem" }}>bpm</span>
          </div>
          <div className="vital-unit">Beats Per Minute</div>
          <div className="vital-status">
            <div
              className={`status-indicator ${
                currentVitals.status === "NORMAL" ? "" : "alert"
              }`}
            ></div>
            <span>
              {currentVitals.status === "NORMAL" ? "Normal Range" : "Abnormal"}
            </span>
          </div>
        </div>

        <div
          className={`vital-card ${
            currentVitals.status === "NORMAL" ? "" : "alert"
          }`}
        >
          <div className="vital-label">Detection Confidence</div>
          <div className="vital-value">
            {(currentVitals.confidence * 100).toFixed(1)}%
          </div>
          <div className="vital-unit">Classification Confidence</div>
          <div className="vital-status">
            <div
              className={`status-indicator ${
                currentVitals.confidence > 0.7 ? "" : "alert"
              }`}
            ></div>
            <span>
              {currentVitals.confidence > 0.7
                ? "High Confidence"
                : "Low Confidence"}
            </span>
          </div>
        </div>

        <div
          className={`vital-card ${
            currentVitals.status === "NORMAL" ? "" : "alert"
          }`}
        >
          <div className="vital-label">Classification</div>
          <div className="vital-value" style={{ fontSize: "1.8rem" }}>
            {currentVitals.status}
          </div>
          <div className="vital-unit">Current Status</div>
          <div className="vital-status">
            <div
              className={`status-indicator ${
                currentVitals.status === "NORMAL" ? "" : "alert"
              }`}
            ></div>
            <span>
              {currentVitals.status === "NORMAL" ? "Secure" : "Threat Detected"}
            </span>
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
  );
}
