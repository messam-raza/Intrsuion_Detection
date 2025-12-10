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
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: "#3b82f6",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      },
      {
        label: "Pulse (bpm)",
        data: pulseSeries,
        borderColor: "#60a5fa",
        backgroundColor: "rgba(96, 165, 250, 0.05)",
        borderWidth: 2.5,
        borderDash: [5, 5],
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: "#60a5fa",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#d1d5db",
          boxWidth: 18,
          font: { size: 13, weight: "600" },
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#fff",
        bodyColor: "#d1d5db",
        borderColor: "rgba(59, 130, 246, 0.3)",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        boxPadding: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: "#9ca3af" },
        grid: { color: "rgba(59, 130, 246, 0.05)" },
      },
      y: {
        ticks: { color: "#9ca3af" },
        grid: { color: "rgba(59, 130, 246, 0.05)" },
      },
    },
  }

  return <Line data={data} options={options} />
}
