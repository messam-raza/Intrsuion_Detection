"use client"

import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { Line } from "react-chartjs-2"

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend, Filler)

export default function LineChart({
  labels,
  spo2Series,
  pulseSeries,
}: {
  labels: string[]
  spo2Series: (number | null)[]
  pulseSeries: (number | null)[]
}) {
  const data = {
    labels,
    datasets: [
      {
        label: "SpO₂ (%)",
        data: spo2Series,
        borderColor: "#60a5fa",
        backgroundColor: (ctx: any) => {
          const canvas = ctx.chart.ctx
          const { top, bottom } = ctx.chart.chartArea || { top: 0, bottom: 300 }
          const grad = canvas.createLinearGradient(0, top, 0, bottom)
          grad.addColorStop(0, "rgba(59, 130, 246, 0.25)")
          grad.addColorStop(0.6, "rgba(59, 130, 246, 0.06)")
          grad.addColorStop(1, "rgba(59, 130, 246, 0)")
          return grad
        },
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: "#60a5fa",
        pointBorderColor: "#1e293b",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: "#93c5fd",
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
      },
      {
        label: "Pulse (bpm)",
        data: pulseSeries,
        borderColor: "#f43f5e",
        backgroundColor: (ctx: any) => {
          const canvas = ctx.chart.ctx
          const { top, bottom } = ctx.chart.chartArea || { top: 0, bottom: 300 }
          const grad = canvas.createLinearGradient(0, top, 0, bottom)
          grad.addColorStop(0, "rgba(244, 63, 94, 0.18)")
          grad.addColorStop(1, "rgba(244, 63, 94, 0)")
          return grad
        },
        borderWidth: 2.5,
        borderDash: [5, 4],
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: "#f43f5e",
        pointBorderColor: "#1e293b",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: "#fb7185",
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: "easeInOutQuart" as const,
    },
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        labels: {
          color: "#94a3b8",
          boxWidth: 14,
          boxHeight: 3,
          borderRadius: 3,
          font: { size: 12, weight: "600" as const, family: "Inter" },
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: "rgba(10, 15, 30, 0.96)",
        titleColor: "#e0f2fe",
        bodyColor: "#94a3b8",
        borderColor: "rgba(59, 130, 246, 0.25)",
        borderWidth: 1,
        padding: 14,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 6,
        callbacks: {
          title: (items: any[]) => `⏱ ${items[0]?.label || ""}`,
          label: (item: any) => ` ${item.dataset.label}: ${item.raw ?? "—"}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#475569",
          font: { size: 10, family: "JetBrains Mono" },
          maxRotation: 0,
          maxTicksLimit: 8,
        },
        grid: {
          color: "rgba(255, 255, 255, 0.03)",
          drawBorder: false,
        },
        border: { display: false },
      },
      y: {
        ticks: {
          color: "#475569",
          font: { size: 10, family: "JetBrains Mono" },
          padding: 8,
        },
        grid: {
          color: "rgba(255, 255, 255, 0.04)",
          drawBorder: false,
        },
        border: { display: false },
      },
    },
  }

  return <Line data={data} options={options as any} />
}
