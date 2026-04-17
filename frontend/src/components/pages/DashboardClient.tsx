"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { EventRecord } from "@/lib/types";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

type Stats = {
  totalPatients: number;
  totalDevices: number;
  onlineDevices: number;
  recentAttacks: number;
};

type HourBucket = { hour: string; count: number };

export default function DashboardClient({ stats }: { stats: Stats }) {
  const [liveAttacks, setLiveAttacks] = useState(stats.recentAttacks);
  const [connected, setConnected] = useState(false);
  const [spo2Series, setSpo2Series] = useState<number[]>([]);
  const [pulseBuckets, setPulseBuckets] = useState<HourBucket[]>(() =>
    Array.from({ length: 8 }, (_, i) => ({
      hour: `${String((new Date().getHours() - 7 + i + 24) % 24).padStart(2, "0")}:00`,
      count: 0,
    })),
  );
  const [recentAlerts, setRecentAlerts] = useState<EventRecord[]>([]);

  useEffect(() => {
    if (!SOCKET_URL) return;

    console.log("[Dashboard] Connecting to Socket.IO at:", SOCKET_URL);

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => {
      console.log("[Dashboard] Connected");
      setConnected(true);
    });

    socket.on("vitals_update", (data: EventRecord) => {
      try {
        if (typeof data.spo2 === "number") {
          setSpo2Series((prev) => [...prev, data.spo2].slice(-60));
        }

        const pred = (data.prediction || "").toUpperCase();
        if (pred === "ATTACK") {
          setLiveAttacks((v) => v + 1);
          setRecentAlerts((prev) => [data, ...prev].slice(0, 8));
          const currentHour = new Date().getHours();
          setPulseBuckets((prev) => {
            const hourLabel = `${String(currentHour).padStart(2, "0")}:00`;
            const idx = prev.findIndex((b) => b.hour === hourLabel);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], count: next[idx].count + 1 };
              return next;
            }
            return [...prev.slice(1), { hour: hourLabel, count: 1 }];
          });
        }
      } catch (error) {
        console.error("[Dashboard] vitals_update error:", error);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("[Dashboard] connection error:", error);
      setConnected(false);
    });

    socket.on("disconnect", () => setConnected(false));

    return () => {
      console.log("[Dashboard] Disconnecting Socket.IO");
      socket.disconnect();
    };
  }, []);

  const utilization = stats.totalDevices
    ? Math.round((stats.onlineDevices / stats.totalDevices) * 100)
    : 0;

  const maxBucket = Math.max(1, ...pulseBuckets.map((b) => b.count));
  const spo2Path = useMemo(() => buildSparkPath(spo2Series, 100, 100), [spo2Series]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-[2rem] font-bold tracking-tight text-on-surface leading-tight">
            Global Dashboard
          </h2>
          <p className="text-sm text-secondary mt-1 flex items-center gap-2">
            <span
              className={
                "w-2 h-2 rounded-full " +
                (connected
                  ? "bg-green-500 shadow-[0_0_6px_#22c55e]"
                  : "bg-red-500 shadow-[0_0_6px_#ba1a1a]")
              }
            />
            {connected
              ? "Sentinel stream online"
              : "Awaiting telemetry connection"}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon="group"
          label="Total Patients"
          value={stats.totalPatients}
          hint="Registered records"
        />
        <StatCard
          icon="devices"
          label="Registered Devices"
          value={stats.totalDevices}
          hint="Hardware inventory"
        />
        <StatCard
          icon="sensors"
          label="Currently Connected"
          value={stats.onlineDevices}
          hintAccent
          hint={`${utilization}% Utilization`}
          showPulse
          utilization={utilization}
        />
        <StatCard
          icon="warning"
          label="Attacks (24h)"
          value={liveAttacks}
          hint="Detected anomalies"
          danger
        />
      </div>

      {/* Charts + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* SpO2 panel */}
          <div className="bg-surface-container-lowest rounded-xl p-6 relative ambient-shadow">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-base font-semibold text-on-surface flex items-center">
                  <span className="material-symbols-outlined text-primary mr-2 text-lg">
                    water_drop
                  </span>
                  SpO2 Aggregate Trends
                </h4>
                <p className="text-xs text-secondary mt-1">
                  Live moving window across all connected telemetry
                </p>
              </div>
              <div className="flex gap-2 bg-surface-container-low p-1 rounded-md">
                <button className="px-3 py-1 text-xs font-medium bg-surface-container-lowest text-primary rounded shadow-sm">
                  Live
                </button>
                <button className="px-3 py-1 text-xs font-medium text-secondary hover:text-on-surface transition-colors">
                  24h
                </button>
                <button className="px-3 py-1 text-xs font-medium text-secondary hover:text-on-surface transition-colors">
                  7d
                </button>
              </div>
            </div>
            <div className="h-48 w-full relative flex items-end mb-2">
              <div className="absolute inset-0 flex flex-col justify-between border-l border-b border-outline-variant/20 pb-4 pl-4">
                <div className="w-full border-t border-outline-variant/10 relative">
                  <span className="absolute -left-7 -top-2 text-[10px] text-secondary">
                    100%
                  </span>
                </div>
                <div className="w-full border-t border-outline-variant/10 relative">
                  <span className="absolute -left-6 -top-2 text-[10px] text-secondary">
                    95%
                  </span>
                </div>
                <div className="w-full border-t border-error/20 relative">
                  <span className="absolute -left-6 -top-2 text-[10px] text-error font-medium">
                    90%
                  </span>
                </div>
                <div className="w-full border-t border-outline-variant/10 relative">
                  <span className="absolute -left-6 -top-2 text-[10px] text-secondary">
                    85%
                  </span>
                </div>
              </div>
              <svg
                className="absolute inset-0 w-full h-full pb-4 pl-4"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <defs>
                  <linearGradient id="blue-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                    <stop offset="0%" stopColor="#00488d" />
                    <stop offset="100%" stopColor="#005fb8" />
                  </linearGradient>
                  <linearGradient id="blue-fade" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#00488d" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d={spo2Path.area}
                  fill="url(#blue-fade)"
                  opacity="0.15"
                />
                <path
                  d={spo2Path.line}
                  fill="none"
                  stroke="url(#blue-gradient)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                />
              </svg>
            </div>
          </div>

          {/* Pulse anomalies panel */}
          <div className="bg-surface-container-lowest rounded-xl p-6 relative ambient-shadow">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-base font-semibold text-on-surface flex items-center">
                  <span className="material-symbols-outlined text-primary mr-2 text-lg">
                    favorite
                  </span>
                  Anomaly Events per Hour
                </h4>
                <p className="text-xs text-secondary mt-1">
                  Live count of ATTACK predictions by hour
                </p>
              </div>
            </div>
            <div className="h-40 w-full flex items-end justify-between gap-2 pl-4 border-l border-b border-outline-variant/20 pb-2 relative">
              {pulseBuckets.map((bucket, idx) => {
                const h = Math.max(6, (bucket.count / maxBucket) * 100);
                const danger = bucket.count >= Math.max(2, maxBucket * 0.6);
                return (
                  <div
                    key={`${bucket.hour}-${idx}`}
                    className={[
                      "w-full rounded-t-sm relative z-10 transition-colors cursor-pointer group",
                      danger
                        ? "bg-error/80 hover:bg-error"
                        : "bg-secondary-container hover:bg-primary",
                    ].join(" ")}
                    style={{ height: `${h}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-surface-container-highest text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {bucket.count}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-secondary mt-2 pl-4">
              {pulseBuckets.map((b, i) => (
                <span key={`${b.hour}-lbl-${i}`}>{b.hour}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <div className="bg-surface-container-low rounded-xl p-1">
            <div className="bg-surface-container-lowest rounded-lg p-5">
              <h4 className="text-sm font-semibold text-on-surface mb-4 flex items-center uppercase tracking-wider">
                <span className="material-symbols-outlined text-primary mr-2 text-base">
                  psychology
                </span>
                Sentinel Insights
              </h4>
              <div className="space-y-3">
                <InsightRow
                  icon="lightbulb"
                  title="Stream Heartbeat"
                  body={
                    connected
                      ? "Socket.IO telemetry pipeline is healthy and receiving frames."
                      : "No live frames received yet. Verify the detector service is running."
                  }
                />
                <InsightRow
                  icon="trending_down"
                  title="Attack Pressure"
                  body={`Detected ${liveAttacks} anomaly events in the last 24h across all sentinel nodes.`}
                />
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-5 ambient-shadow">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-on-surface uppercase tracking-wider">
                Active Alerts
              </h4>
              {recentAlerts.length > 0 && (
                <span className="bg-error-container text-on-error-container text-[10px] font-bold px-2 py-0.5 rounded">
                  {recentAlerts.length} LIVE
                </span>
              )}
            </div>
            <div className="space-y-1">
              {recentAlerts.length === 0 && (
                <div className="py-6 text-center text-sm text-secondary">
                  No active alerts
                </div>
              )}
              {recentAlerts.map((alert, idx) => (
                <div
                  key={`${alert.device_id}-${alert.ts_unix}-${idx}`}
                  className="py-3 px-2 -mx-2 hover:bg-surface-container-low transition-colors rounded-md flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <span className="material-symbols-outlined text-error text-[18px]">
                        monitor_heart
                      </span>
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-error rounded-full animate-pulse" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">
                        {alert.device_id}
                      </p>
                      <p className="text-[10px] text-secondary">
                        SpO₂ {alert.spo2}% • Pulse {alert.pulse} bpm •{" "}
                        {(alert.confidence * 100).toFixed(1)}% conf
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-secondary text-sm">
                    chevron_right
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  hintAccent,
  showPulse,
  danger,
  utilization,
}: {
  icon: string;
  label: string;
  value: number;
  hint?: string;
  hintAccent?: boolean;
  showPulse?: boolean;
  danger?: boolean;
  utilization?: number;
}) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl relative overflow-hidden group ambient-shadow">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="flex items-center gap-2 mb-3 relative z-10">
        <div
          className={[
            "w-8 h-8 rounded-md flex items-center justify-center relative",
            danger ? "bg-error-container" : "bg-secondary-container",
          ].join(" ")}
        >
          <span
            className={[
              "material-symbols-outlined text-sm",
              danger ? "text-error" : "text-primary",
            ].join(" ")}
          >
            {icon}
          </span>
          {showPulse && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_4px_rgba(34,197,94,0.8)]" />
          )}
        </div>
        <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="relative z-10">
        <h3 className="text-4xl font-bold tracking-tight text-on-surface mb-1">
          {value}
        </h3>
        {typeof utilization === "number" && (
          <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${utilization}%` }}
            />
          </div>
        )}
        {hint && (
          <p
            className={[
              "text-[11px] mt-1",
              hintAccent ? "text-right text-secondary" : "text-secondary",
            ].join(" ")}
          >
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function InsightRow({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="p-3 bg-surface border border-outline-variant/15 rounded-md flex items-start gap-3 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-surface-tint opacity-50" />
      <span className="material-symbols-outlined filled text-surface-tint mt-0.5 text-sm">
        {icon}
      </span>
      <div>
        <p className="text-xs text-on-surface font-medium mb-1">{title}</p>
        <p className="text-[11px] text-secondary leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function buildSparkPath(series: number[], width: number, height: number) {
  if (series.length === 0) {
    return {
      line: `M0,${height * 0.5} L${width},${height * 0.5}`,
      area: `M0,${height * 0.5} L${width},${height * 0.5} L${width},${height} L0,${height} Z`,
    };
  }
  const min = 85;
  const max = 100;
  const stepX = width / Math.max(1, series.length - 1);
  const points = series.map((v, i) => {
    const clamped = Math.max(min, Math.min(max, v));
    const y = height - ((clamped - min) / (max - min)) * height;
    return `${(i * stepX).toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}
