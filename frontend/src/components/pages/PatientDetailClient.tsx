"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { EventRecord } from "@/lib/types";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

type PatientView = {
  _id: string;
  patientId: string;
  fullName: string;
  dateOfBirth?: string | null;
  sex?: string;
  bloodType?: string;
  weightKg?: number;
  heightCm?: number;
  primaryDiagnosis?: string;
  medicalHistory?: string;
  admittedAt?: string;
  createdAt?: string;
};

type DeviceView = {
  _id: string;
  deviceId: string;
  hardwareId: string;
  deviceType: string;
  connectivity: string;
  status: string;
  lastSeenAt?: string;
};

type StoredEvent = {
  _id: string;
  deviceId: string;
  spo2: number;
  pulse: number;
  prediction: string;
  confidence: number;
  timestamp: string;
};

type HistoryResponse = { events: StoredEvent[] };

export default function PatientDetailClient({
  patient,
  devices,
  events: initialEvents,
  totalEvents,
}: {
  patient: PatientView;
  devices: DeviceView[];
  events: StoredEvent[];
  totalEvents: number;
}) {
  const [liveSpo2, setLiveSpo2] = useState<number[]>([]);
  const [livePulse, setLivePulse] = useState<number[]>([]);
  const [liveEvents, setLiveEvents] = useState<EventRecord[]>([]);
  const [history, setHistory] = useState<StoredEvent[]>(initialEvents);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "NORMAL" | "ATTACK"
  >("all");

  const deviceIds = useMemo(() => new Set(devices.map((d) => d.deviceId)), [
    devices,
  ]);

  const refreshHistory = useCallback(async () => {
    if (deviceIds.size === 0) return;
    setRefreshing(true);
    try {
      const results = await Promise.all(
        Array.from(deviceIds).map((id) =>
          fetch(`/api/events?deviceId=${encodeURIComponent(id)}&limit=200`, {
            cache: "no-store",
          })
            .then((r) => (r.ok ? (r.json() as Promise<HistoryResponse>) : null))
            .catch(() => null),
        ),
      );
      const merged = results
        .flatMap((r) => r?.events ?? [])
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, 200);
      setHistory(merged);
    } finally {
      setRefreshing(false);
    }
  }, [deviceIds]);

  useEffect(() => {
    if (!SOCKET_URL || deviceIds.size === 0) return;

    const socket: Socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("vitals_update", (data: EventRecord) => {
      if (!deviceIds.has(data.device_id)) return;
      setLiveSpo2((prev) => [...prev, data.spo2 || 0].slice(-80));
      setLivePulse((prev) => [...prev, data.pulse || 0].slice(-80));
      setLiveEvents((prev) => [data, ...prev].slice(0, 200));
    });

    return () => {
      socket.disconnect();
    };
  }, [deviceIds]);

  // Periodically refresh persisted history so the table catches up with frames
  // that were saved while this tab was closed. Also refresh eagerly when the
  // tab regains focus.
  useEffect(() => {
    if (deviceIds.size === 0) return;
    const interval = window.setInterval(refreshHistory, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshHistory();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deviceIds, refreshHistory]);

  const spo2Avg = average(liveSpo2);
  const pulseAvg = average(livePulse);

  // Merge stored history with incoming live frames, deduping on
  // `(deviceId, ts_unix)`. A live frame is rewritten into history the moment
  // the server-side bridge persists it, so we coalesce by signature.
  const mergedRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{
      key: string;
      timestamp: string;
      sensor: string;
      value: string;
      status: string;
      source: "live" | "history";
      confidence: number;
    }> = [];

    for (const e of liveEvents) {
      const sig = `${e.device_id}|${Math.round(Number(e.ts_unix) || 0)}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({
        key: `live-${sig}`,
        timestamp: e.timestamp,
        sensor: e.device_id,
        value: `SpO₂ ${e.spo2}% • Pulse ${e.pulse} bpm`,
        status: (e.prediction || "").toString().toUpperCase(),
        source: "live",
        confidence: Number(e.confidence) || 0,
      });
    }

    for (const e of history) {
      const ts = Math.round(new Date(e.timestamp).getTime() / 1000);
      const sig = `${e.deviceId}|${ts}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      rows.push({
        key: `hist-${e._id}`,
        timestamp: e.timestamp,
        sensor: e.deviceId,
        value: `SpO₂ ${e.spo2}% • Pulse ${e.pulse} bpm`,
        status: e.prediction,
        source: "history",
        confidence: e.confidence,
      });
    }

    rows.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (statusFilter !== "all") {
      return rows.filter((r) => r.status === statusFilter);
    }
    return rows;
  }, [liveEvents, history, statusFilter]);

  const attackCount = useMemo(
    () => history.filter((e) => e.prediction === "ATTACK").length,
    [history],
  );

  return (
    <div className="pt-8 pb-12 px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-[2rem] font-bold text-on-surface tracking-tight leading-tight">
              {patient.fullName}
            </h2>
            <p className="text-sm font-medium text-secondary mt-1">
              Patient ID: #{patient.patientId}
              {patient.admittedAt &&
                ` • Admitted: ${new Date(patient.admittedAt)
                  .toISOString()
                  .slice(0, 10)}`}
              {" • "}
              <span
                className={
                  connected ? "text-green-600" : "text-secondary"
                }
              >
                {connected ? "Live stream active" : "Awaiting telemetry"}
              </span>
            </p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 rounded-md bg-surface-container-lowest ghost-border text-primary font-medium text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-[18px]">
                download
              </span>
              Export Record
            </button>
            <button className="px-4 py-2 rounded-md primary-gradient text-on-primary font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-[18px]">
                edit
              </span>
              Edit Notes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left column */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">
                  person
                </span>
                Demographics
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Info
                    label="Age / DOB"
                    value={formatDob(patient.dateOfBirth)}
                  />
                  <Info label="Sex" value={patient.sex || "—"} />
                  <Info label="Blood Type" value={patient.bloodType || "—"} />
                  <Info
                    label="Weight / Height"
                    value={`${patient.weightKg ?? "—"}kg / ${
                      patient.heightCm ?? "—"
                    }cm`}
                  />
                </div>
                <div className="pt-4 border-t border-surface-container-low">
                  <p className="text-[10px] text-secondary uppercase tracking-wide mb-1">
                    Primary Diagnosis
                  </p>
                  {patient.primaryDiagnosis ? (
                    <p className="text-sm font-medium text-primary bg-primary/10 inline-block px-2 py-1 rounded">
                      {patient.primaryDiagnosis}
                    </p>
                  ) : (
                    <p className="text-sm text-secondary">Not specified</p>
                  )}
                </div>
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">
                  router
                </span>
                Paired Devices ({devices.length})
              </h3>
              {devices.length === 0 && (
                <p className="text-sm text-secondary">
                  No devices paired with this patient yet.
                </p>
              )}
              <ul className="space-y-3">
                {devices.map((d) => (
                  <li
                    key={d._id}
                    className="p-3 bg-surface border border-outline-variant/15 rounded-md flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-md bg-secondary-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-sm">
                        {d.connectivity === "ble" ? "bluetooth" : "wifi"}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-on-surface">
                        {d.deviceId}
                      </p>
                      <p className="text-[11px] text-secondary">
                        {formatDeviceType(d.deviceType)} • MAC {d.hardwareId}
                      </p>
                    </div>
                    <span
                      className={[
                        "text-[10px] font-semibold px-2 py-0.5 rounded uppercase",
                        d.status === "online"
                          ? "bg-green-50 text-green-700"
                          : d.status === "warning"
                          ? "bg-error-container/60 text-error"
                          : "bg-surface-container-low text-secondary",
                      ].join(" ")}
                    >
                      {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {patient.medicalHistory && (
              <section className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
                <h3 className="text-xs font-bold uppercase tracking-wider text-secondary mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">
                    history
                  </span>
                  Medical History / Notes
                </h3>
                <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
                  {patient.medicalHistory}
                </p>
              </section>
            )}
          </div>

          {/* Right column */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <div className="bg-surface-container-lowest rounded-xl p-6 ghost-border ambient-shadow">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">
                    monitoring
                  </span>
                  Live Vitals Monitor
                </h3>
                <span className="text-xs text-secondary">
                  {liveSpo2.length} live samples
                </span>
              </div>
              <div className="space-y-6">
                <VitalSparkline
                  label="SpO₂"
                  unit="%"
                  color="#00488d"
                  areaColor="rgba(0, 72, 141, 0.05)"
                  series={liveSpo2}
                  avg={`${spo2Avg.toFixed(1)}%`}
                  active={connected}
                  min={85}
                  max={100}
                />
                <VitalSparkline
                  label="Pulse Rate"
                  unit="bpm"
                  color="#7b3200"
                  areaColor="rgba(123, 50, 0, 0.05)"
                  series={livePulse}
                  avg={`${pulseAvg.toFixed(0)} bpm`}
                  active={connected}
                  min={40}
                  max={140}
                  danger
                />
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl ghost-border ambient-shadow overflow-hidden">
              <div className="p-6 border-b border-surface-container-low flex flex-wrap justify-between items-center gap-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                      list_alt
                    </span>
                    Packet History
                  </h3>
                  <p className="text-[11px] text-secondary mt-1">
                    {totalEvents.toLocaleString()} total frames stored •{" "}
                    {attackCount.toLocaleString()} attack{" "}
                    {attackCount === 1 ? "event" : "events"} in window •{" "}
                    {history.length} loaded
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FilterChip
                    active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}
                  >
                    All
                  </FilterChip>
                  <FilterChip
                    active={statusFilter === "NORMAL"}
                    onClick={() => setStatusFilter("NORMAL")}
                  >
                    Normal
                  </FilterChip>
                  <FilterChip
                    active={statusFilter === "ATTACK"}
                    onClick={() => setStatusFilter("ATTACK")}
                    danger
                  >
                    Attack
                  </FilterChip>
                  <button
                    onClick={refreshHistory}
                    disabled={refreshing}
                    className="p-1.5 rounded-md hover:bg-surface-container-low transition-colors disabled:opacity-50"
                    title="Refresh history"
                    type="button"
                  >
                    <span
                      className={[
                        "material-symbols-outlined text-[18px] text-secondary",
                        refreshing ? "animate-spin" : "",
                      ].join(" ")}
                    >
                      {refreshing ? "progress_activity" : "refresh"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-surface-container-lowest z-10">
                    <tr className="bg-surface-container-low/50 text-[10px] uppercase tracking-wider text-secondary">
                      <th className="p-4 font-semibold">Timestamp</th>
                      <th className="p-4 font-semibold">Sensor</th>
                      <th className="p-4 font-semibold">Source</th>
                      <th className="p-4 font-semibold">Value</th>
                      <th className="p-4 font-semibold">Confidence</th>
                      <th className="p-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-surface-container-low">
                    {mergedRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-secondary"
                        >
                          No telemetry recorded yet.
                        </td>
                      </tr>
                    )}
                    {mergedRows.map((row) => {
                      const isAttack = row.status === "ATTACK";
                      const isLive = row.source === "live";
                      return (
                        <tr
                          key={row.key}
                          className={[
                            "hover:bg-surface-container-low/30 transition-colors",
                            isAttack ? "bg-error-container/10" : "",
                          ].join(" ")}
                        >
                          <td className="p-4 text-on-surface text-xs font-mono whitespace-nowrap">
                            {new Date(row.timestamp)
                              .toISOString()
                              .slice(0, 19)
                              .replace("T", " ")}
                          </td>
                          <td className="p-4 text-secondary text-xs font-mono">
                            {row.sensor}
                          </td>
                          <td className="p-4">
                            <span
                              className={[
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                                isLive
                                  ? "bg-primary/10 text-primary"
                                  : "bg-surface-container-low text-secondary",
                              ].join(" ")}
                            >
                              {isLive && (
                                <span className="w-1 h-1 rounded-full bg-primary animate-pulse-dot" />
                              )}
                              {isLive ? "Live" : "Stored"}
                            </span>
                          </td>
                          <td className="p-4 text-on-surface">{row.value}</td>
                          <td className="p-4 text-on-surface text-xs font-mono">
                            {(row.confidence * 100).toFixed(1)}%
                          </td>
                          <td className="p-4">
                            <span
                              className={[
                                "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium",
                                isAttack
                                  ? "bg-error-container/40 text-error border border-error/20"
                                  : "bg-green-50 text-green-700 border border-green-200/50",
                              ].join(" ")}
                            >
                              <span
                                className={[
                                  "w-1.5 h-1.5 rounded-full",
                                  isAttack
                                    ? "bg-error shadow-[0_0_4px_#ba1a1a]"
                                    : "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]",
                                ].join(" ")}
                              />
                              {isAttack ? "Attack" : "Normal"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  danger,
  children,
}: {
  active: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-md transition-colors border",
        active
          ? danger
            ? "bg-error-container/40 text-error border-error/30"
            : "bg-primary text-on-primary border-primary"
          : "bg-surface-container-lowest text-secondary border-outline-variant/30 hover:bg-surface-container-low",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-secondary uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium text-on-surface">{value}</p>
    </div>
  );
}

function VitalSparkline({
  label,
  unit,
  color,
  areaColor,
  series,
  avg,
  active,
  min,
  max,
  danger,
}: {
  label: string;
  unit: string;
  color: string;
  areaColor: string;
  series: number[];
  avg: string;
  active: boolean;
  min: number;
  max: number;
  danger?: boolean;
}) {
  const path = buildSparkPath(series, 200, 100, min, max);
  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <p className="text-sm font-semibold text-on-surface flex items-center gap-2">
          {label}{" "}
          <span className="text-[10px] text-secondary font-normal">{unit}</span>
          <span
            className={[
              "w-1.5 h-1.5 rounded-full animate-pulse-dot",
              active
                ? danger
                  ? "bg-error shadow-[0_0_4px_rgba(186,26,26,0.6)]"
                  : "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]"
                : "bg-slate-300",
            ].join(" ")}
          />
        </p>
        <p className="text-xs text-secondary">
          Avg: <span className="font-medium text-on-surface">{avg}</span>
        </p>
      </div>
      <div className="h-24 bg-surface-container-low/50 rounded-lg relative overflow-hidden">
        <svg
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <path d={path.area} fill={areaColor} />
          <path
            d={path.line}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 px-2">
          <div className="border-b border-secondary w-full h-px" />
          <div className="border-b border-secondary w-full h-px" />
          <div className="border-b border-secondary w-full h-px" />
        </div>
      </div>
    </div>
  );
}

function buildSparkPath(
  series: number[],
  width: number,
  height: number,
  min: number,
  max: number,
) {
  if (series.length === 0) {
    return {
      line: `M0,${height / 2} L${width},${height / 2}`,
      area: `M0,${height / 2} L${width},${height / 2} L${width},${height} L0,${height} Z`,
    };
  }
  const step = width / Math.max(1, series.length - 1);
  const points = series.map((v, i) => {
    const clamped = Math.max(min, Math.min(max, v));
    const y = height - ((clamped - min) / (max - min)) * height;
    return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

function average(arr: number[]) {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function formatDob(dob?: string | null) {
  if (!dob) return "—";
  try {
    const d = new Date(dob);
    const age = Math.floor(
      (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
    );
    return `${age} (${d.toISOString().slice(0, 10)})`;
  } catch {
    return "—";
  }
}

function formatDeviceType(t: string) {
  switch (t) {
    case "pulse_ox":
      return "Pulse Oximeter";
    case "ecg":
      return "ECG Monitor";
    case "bp":
      return "BP Cuff";
    case "glucose":
      return "CGM Sensor";
    default:
      return t;
  }
}
