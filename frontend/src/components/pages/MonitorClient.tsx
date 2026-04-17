"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { EventRecord } from "@/lib/types";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

type StatusFilter = "all" | "normal" | "attack";

export default function MonitorClient() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [currentVitals, setCurrentVitals] = useState<{
    spo2: number;
    pulse: number;
    status: string;
    confidence: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!SOCKET_URL) {
      console.warn("[Monitor] NEXT_PUBLIC_SOCKET_URL is not set");
      return;
    }

    console.log("[Monitor] Connecting to Socket.IO at:", SOCKET_URL);

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      console.log("[Monitor] Connected");
      setConnected(true);
    });

    socket.on("connection_status", (data) => {
      console.log("[Monitor] connection_status:", data);
    });

    socket.on("vitals_update", (data: EventRecord) => {
      console.log("[Monitor] vitals_update", data);
      try {
        setCurrentVitals({
          spo2: data.spo2 || 0,
          pulse: data.pulse || 0,
          status: (data.prediction || "NORMAL").toString().toUpperCase(),
          confidence: data.confidence || 0,
        });
        setEvents((prev) => [data, ...prev].slice(0, 200));
      } catch (error) {
        console.error("[Monitor] vitals_update error:", error);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("[Monitor] connection error:", error);
      setConnected(false);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Monitor] disconnected:", reason);
      setConnected(false);
    });

    socket.on("reconnect_attempt", (attempt) =>
      console.log(`[Monitor] reconnect_attempt ${attempt}`),
    );
    socket.on("reconnect", (n) => {
      console.log(`[Monitor] reconnected after ${n} attempts`);
      setConnected(true);
    });

    return () => {
      console.log("[Monitor] Disconnecting Socket.IO");
      socket.disconnect();
    };
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return events;
    if (statusFilter === "attack")
      return events.filter(
        (e) => (e.prediction || "").toString().toUpperCase() === "ATTACK",
      );
    return events.filter(
      (e) => (e.prediction || "").toString().toUpperCase() !== "ATTACK",
    );
  }, [events, statusFilter]);

  const activeDevices = useMemo(() => {
    const s = new Set(events.map((e) => e.device_id));
    return s.size;
  }, [events]);

  return (
    <div className="pt-8 px-8 pb-12 max-w-[1600px] mx-auto">
      {/* Hero */}
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[2rem] font-bold tracking-tight text-on-surface leading-tight">
            Live Telemetry Stream
          </h2>
          <p className="text-secondary text-sm mt-1 flex items-center gap-2">
            <span
              className={[
                "w-2 h-2 rounded-full",
                connected
                  ? "bg-green-500 shadow-[0_0_6px_#22c55e]"
                  : "bg-red-500 shadow-[0_0_6px_#ba1a1a]",
              ].join(" ")}
            />
            {connected ? "WebSocket Connected" : "Disconnected"} •{" "}
            {activeDevices} Active Devices
          </p>
        </div>
        <div className="flex gap-3">
          <FilterButton
            label="Status: All"
            icon="filter_list"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <FilterButton
            label="Normal"
            icon="check_circle"
            active={statusFilter === "normal"}
            onClick={() => setStatusFilter("normal")}
          />
          <FilterButton
            label="Attacks"
            icon="warning"
            active={statusFilter === "attack"}
            onClick={() => setStatusFilter("attack")}
          />
        </div>
      </div>

      {/* Current vitals strip */}
      {currentVitals && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <VitalPill
            icon="water_drop"
            label="SpO₂"
            value={`${currentVitals.spo2}%`}
            danger={currentVitals.spo2 > 0 && currentVitals.spo2 < 92}
          />
          <VitalPill
            icon="favorite"
            label="Pulse"
            value={`${currentVitals.pulse} bpm`}
            danger={currentVitals.pulse >= 110 || currentVitals.pulse < 50}
          />
          <VitalPill
            icon={
              currentVitals.status === "ATTACK" ? "warning" : "verified"
            }
            label="Prediction"
            value={currentVitals.status}
            danger={currentVitals.status === "ATTACK"}
          />
          <VitalPill
            icon="auto_awesome"
            label="Confidence"
            value={`${(currentVitals.confidence * 100).toFixed(1)}%`}
          />
        </div>
      )}

      {/* Table */}
      <div className="bg-surface-container-low rounded-xl p-1">
        <div className="bg-surface-container-lowest rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface border-b-0 text-secondary text-xs uppercase tracking-wider font-medium">
                <th className="py-4 px-6 font-medium">Timestamp</th>
                <th className="py-4 px-6 font-medium">Device ID</th>
                <th className="py-4 px-6 font-medium">SpO₂</th>
                <th className="py-4 px-6 font-medium">Pulse Rate</th>
                <th className="py-4 px-6 font-medium">Prediction</th>
                <th className="py-4 px-6 font-medium">AI Confidence</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-16 text-center text-secondary text-sm"
                  >
                    Waiting for telemetry…
                  </td>
                </tr>
              )}
              {filtered.map((row, idx) => {
                const pred = (row.prediction || "").toString().toUpperCase();
                const isAttack = pred === "ATTACK";
                return (
                  <tr
                    key={`${row.device_id}-${row.ts_unix}-${idx}`}
                    className={[
                      "group hover:bg-surface-container-low/50 transition-colors border-b border-surface-container-low last:border-0 animate-fade-in-row",
                      isAttack ? "bg-error-container/10" : "",
                    ].join(" ")}
                  >
                    <td className="py-4 px-6 text-on-surface-variant font-mono text-xs">
                      {formatClock(row.timestamp)}
                    </td>
                    <td className="py-4 px-6 font-medium text-on-surface">
                      {row.device_id}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={
                          "font-semibold " +
                          (row.spo2 < 92
                            ? "text-error"
                            : "text-on-surface")
                        }
                      >
                        {row.spo2}%
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "font-semibold " +
                            (row.pulse >= 110 || row.pulse < 50
                              ? "text-error"
                              : "text-on-surface")
                          }
                        >
                          {row.pulse} bpm
                        </span>
                        {row.pulse >= 100 && (
                          <span className="material-symbols-outlined text-error text-[16px]">
                            trending_up
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                          isAttack
                            ? "bg-error-container/60 text-error border border-error/20"
                            : "bg-surface-container text-on-surface",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "w-1.5 h-1.5 rounded-full",
                            isAttack
                              ? "bg-error shadow-[0_0_4px_#ba1a1a]"
                              : "bg-green-500 shadow-[0_0_4px_#22c55e]",
                          ].join(" ")}
                        />
                        {isAttack ? "Attack Risk" : "Normal"}
                      </span>
                    </td>
                    <td
                      className={
                        "py-4 px-6 " +
                        (isAttack ? "font-semibold text-error" : "text-secondary")
                      }
                    >
                      {(row.confidence * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors",
        active
          ? "primary-gradient text-on-primary shadow-sm"
          : "bg-surface-container-lowest ghost-border text-primary hover:bg-surface-container-low",
      ].join(" ")}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {label}
    </button>
  );
}

function VitalPill({
  icon,
  label,
  value,
  danger,
}: {
  icon: string;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl p-4 flex items-center gap-3 ambient-shadow",
        danger
          ? "bg-error-container/40 border border-error/20"
          : "bg-surface-container-lowest ghost-border",
      ].join(" ")}
    >
      <div
        className={[
          "w-10 h-10 rounded-md flex items-center justify-center",
          danger ? "bg-error/10 text-error" : "bg-secondary-container text-primary",
        ].join(" ")}
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-secondary font-semibold">
          {label}
        </p>
        <p
          className={[
            "text-xl font-bold tracking-tight",
            danger ? "text-error" : "text-on-surface",
          ].join(" ")}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function formatClock(input?: string) {
  if (!input) return "--:--:--";
  try {
    const d = new Date(input);
    return (
      d.toISOString().slice(11, 19) +
      "." +
      String(d.getUTCMilliseconds()).padStart(3, "0")
    );
  } catch {
    return input;
  }
}
