"use client"

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js"
import { Doughnut } from "react-chartjs-2"

ChartJS.register(ArcElement, Tooltip, Legend)

export default function DonutChart({
  normal,
  attack,
}: {
  normal: number
  attack: number
}) {
  const total = normal + attack || 1

  const data = {
    labels: ["Normal", "Attack"],
    datasets: [
      {
        data: [normal, attack],
        backgroundColor: ["rgba(16, 185, 129, 0.8)", "rgba(239, 68, 68, 0.8)"],
        borderColor: ["#10b981", "#ef4444"],
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: "#d1d5db",
          font: { size: 13, weight: "600" },
          padding: 20,
          boxWidth: 16,
        },
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleColor: "#fff",
        bodyColor: "#d1d5db",
        borderColor: "rgba(59, 130, 246, 0.3)",
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw
            const pct = ((val / total) * 100).toFixed(1)
            return `${ctx.label}: ${val} (${pct}%)`
          },
        },
      },
    },
    cutout: "70%",
  }

  return <Doughnut data={data} options={options} />
}
