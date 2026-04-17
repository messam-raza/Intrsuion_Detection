"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { EventRecord } from "@/lib/types";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;

type Point = { t: number; normal: number; attack: number };

export default function AnalyticsClient() {
  const [connected, setConnected] = useState(false);
  const [series, setSeries] = useState<Point[]>([]);
  const [totals, setTotals] = useState({ normal: 0, attack: 0 });
  const [confidenceSeries, setConfidenceSeries] = useState<number[]>([]);
  const bucket = useRef({ normal: 0, attack: 0 });

  useEffect(() => {
    if (!SOCKET_URL) return;

    console.log("[Analytics] Connecting to Socket.IO at:", SOCKET_URL);

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
      try {
        const pred = (data.prediction || "").toString().toUpperCase();
        if (pred === "ATTACK") bucket.current.attack += 1;
        else bucket.current.normal += 1;

        setTotals((prev) => ({
          normal: prev.normal + (pred === "ATTACK" ? 0 : 1),
          attack: prev.attack + (pred === "ATTACK" ? 1 : 0),
        }));

        setConfidenceSeries((prev) =>
          [...prev, data.confidence || 0].slice(-40),
        );
      } catch (err) {
        console.error("[Analytics] vitals_update error:", err);
      }
    });

    // Flush into a time bucket every second
    const interval = window.setInterval(() => {
      setSeries((prev) => {
        const point: Point = {
          t: Date.now(),
          normal: bucket.current.normal,
          attack: bucket.current.attack,
        };
        bucket.current = { normal: 0, attack: 0 };
        return [...prev, point].slice(-60);
      });
    }, 1000);

    return () => {
      window.clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const totalFrames = totals.normal + totals.attack;
  const benignPct = totalFrames
    ? Math.round((totals.normal / totalFrames) * 100)
    : 0;
  const avgConfidence = confidenceSeries.length
    ? (
        confidenceSeries.reduce((s, v) => s + v, 0) / confidenceSeries.length
      ).toFixed(3)
    : "0.000";

  const normalPath = useMemo(
    () => buildSeriesPath(series, "normal", 800, 240),
    [series],
  );
  const attackPath = useMemo(
    () => buildSeriesPath(series, "attack", 800, 240),
    [series],
  );
  const donutStroke = useMemo(
    () => computeDonutStroke(totals.normal, totals.attack),
    [totals],
  );

  const maxConfBar = 100;

  return (
    <div className="pt-8 px-8 pb-12 max-w-7xl mx-auto space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-[2rem] leading-tight font-bold tracking-tight text-on-surface mb-1">
            Live Analytics Stream
          </h2>
          <p className="text-secondary text-sm max-w-2xl">
            Real-time packet inspection and predictive confidence metrics across
            active patient sentinel nodes.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 text-sm font-medium border border-outline-variant/20 rounded-md text-primary hover:bg-surface-container-low transition-colors flex items-center gap-2 bg-surface-container-lowest">
            <span className="material-symbols-outlined text-sm">download</span>{" "}
            Export Data
          </button>
          <button
            className={[
              "px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-opacity shadow-[0_4px_12px_rgba(0,72,141,0.15)]",
              connected
                ? "primary-gradient text-on-primary"
                : "bg-slate-300 text-white cursor-not-allowed",
            ].join(" ")}
          >
            <span className="material-symbols-outlined filled text-sm">
              play_arrow
            </span>{" "}
            {connected ? "Live Sync" : "Offline"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Main time series */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 shadow-[0_8px_32px_rgba(25,28,30,0.02)] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50" />
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-semibold text-on-surface">
                Traffic Classification Topology
              </h3>
              <p className="text-xs text-secondary mt-1">
                Normal vs Anomaly packet frequency (last 60s)
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary ring-2 ring-primary/20" />
                Normal
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error ring-2 ring-error/20" />
                Attack
              </div>
            </div>
          </div>
          <div className="h-64 w-full relative flex items-end border-b border-surface-container-high/50 pb-2">
            <div className="absolute left-0 h-full flex flex-col justify-between text-[10px] text-secondary py-2 -ml-2">
              <span>max</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0</span>
            </div>
            <div className="absolute inset-0 flex flex-col justify-between pt-2 pb-2 pl-6 pointer-events-none">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-full border-b border-surface-container-high/30"
                />
              ))}
            </div>
            <svg
              className="absolute inset-0 w-full h-full pl-6 overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 800 240"
            >
              <path
                className="opacity-80"
                d={normalPath}
                fill="none"
                stroke="#00488d"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
              <path
                className="opacity-70"
                d={attackPath}
                fill="none"
                stroke="#ba1a1a"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
              />
            </svg>
            <div className="absolute right-6 top-6 bg-surface/70 backdrop-blur-md border-l-2 border-surface-tint p-3 rounded-r-lg rounded-bl-lg shadow-[0_4px_16px_rgba(25,28,30,0.06)] max-w-[220px]">
              <p className="text-[10px] font-medium text-primary mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">
                  auto_awesome
                </span>
                Sentinel Insight
              </p>
              <p className="text-xs text-on-surface leading-tight">
                {totals.attack === 0
                  ? "All telemetry within baseline. Node integrity stable."
                  : `Detected ${totals.attack} anomaly frame${
                      totals.attack === 1 ? "" : "s"
                    } across current session.`}
              </p>
            </div>
          </div>
          <div className="w-full flex justify-between text-[10px] text-secondary pl-6 pt-2">
            <span>-60s</span>
            <span>-45s</span>
            <span>-30s</span>
            <span>-15s</span>
            <span>Now</span>
          </div>
        </div>

        {/* Distribution */}
        <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-[0_8px_32px_rgba(25,28,30,0.02)] flex flex-col">
          <h3 className="text-lg font-semibold text-on-surface mb-1">
            Packet Distribution
          </h3>
          <p className="text-xs text-secondary mb-6">
            Aggregate totals (Current Session)
          </p>
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <svg viewBox="0 0 120 120" className="w-40 h-40 -rotate-90">
              <circle
                cx="60"
                cy="60"
                r="48"
                stroke="#e6e8ea"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                stroke="#00488d"
                strokeWidth="12"
                fill="none"
                strokeDasharray={donutStroke.normal}
                strokeDashoffset={0}
                strokeLinecap="butt"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                stroke="#ba1a1a"
                strokeWidth="12"
                fill="none"
                strokeDasharray={donutStroke.attack}
                strokeDashoffset={donutStroke.offset}
                strokeLinecap="butt"
              />
            </svg>
            <div className="absolute text-center">
              <span className="block text-2xl font-bold text-on-surface tracking-tight">
                {benignPct}%
              </span>
              <span className="text-[10px] text-secondary uppercase tracking-wider">
                Benign
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <DistRow
              color="bg-primary"
              label="Normal"
              value={totals.normal}
              valueClass="text-primary"
            />
            <DistRow
              color="bg-error"
              label="Anomalous"
              value={totals.attack}
              valueClass="text-error"
            />
          </div>
        </div>

        {/* Confidence Matrix */}
        <div className="col-span-12 bg-surface-container-lowest rounded-xl p-6 shadow-[0_8px_32px_rgba(25,28,30,0.02)]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-semibold text-on-surface">
                Predictive Confidence Matrix
              </h3>
              <p className="text-xs text-secondary mt-1">
                AI certainty rating per incoming frame (rolling window)
              </p>
            </div>
            <span className="px-2.5 py-1 bg-surface-container-low text-primary text-xs font-semibold rounded-md border border-outline-variant/10">
              Avg Certainty: {avgConfidence}
            </span>
          </div>
          <div className="h-32 w-full flex items-end gap-1 relative pl-6 pb-2 border-b border-surface-container-high/50">
            <div className="absolute left-0 h-full flex flex-col justify-between text-[10px] text-secondary py-2 -ml-2">
              <span>1.00</span>
              <span>0.75</span>
              <span>0.50</span>
            </div>
            <div className="absolute w-full top-1/2 border-t border-dashed border-surface-container-high/50 z-0" />
            <div className="w-full flex justify-between items-end h-full z-10 px-2">
              {Array.from({ length: 40 }, (_, i) => {
                const value = confidenceSeries[i] ?? 0;
                const h = Math.max(4, value * maxConfBar);
                const dip = value > 0 && value < 0.75;
                return (
                  <div
                    key={i}
                    className={[
                      "w-2 rounded-t-sm opacity-90 relative group transition-all",
                      dip ? "bg-primary-fixed-dim" : "bg-primary",
                    ].join(" ")}
                    style={{ height: `${h}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      {(value * 100).toFixed(1)}% Conf.
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DistRow({
  color,
  label,
  value,
  valueClass,
}: {
  color: string;
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex justify-between items-center bg-surface px-3 py-2 rounded-md">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-sm font-medium text-on-surface">{label}</span>
      </div>
      <span className={`text-sm font-bold ${valueClass}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function buildSeriesPath(
  series: Point[],
  key: "normal" | "attack",
  width: number,
  height: number,
) {
  if (series.length === 0) return `M0,${height} L${width},${height}`;
  const max = Math.max(
    1,
    ...series.flatMap((p) => [p.normal, p.attack]),
  );
  const step = width / Math.max(1, series.length - 1);
  const points = series.map((p, i) => {
    const v = p[key];
    const y = height - (v / max) * height;
    return `${(i * step).toFixed(2)},${y.toFixed(2)}`;
  });
  return `M${points.join(" L")}`;
}

function computeDonutStroke(normal: number, attack: number) {
  const circumference = 2 * Math.PI * 48;
  const total = normal + attack;
  if (total === 0)
    return { normal: `0 ${circumference}`, attack: `0 ${circumference}`, offset: 0 };
  const normalLen = (normal / total) * circumference;
  const attackLen = (attack / total) * circumference;
  return {
    normal: `${normalLen} ${circumference - normalLen}`,
    attack: `${attackLen} ${circumference - attackLen}`,
    offset: -normalLen,
  };
}
