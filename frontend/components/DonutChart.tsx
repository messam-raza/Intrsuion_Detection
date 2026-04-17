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
        backgroundColor: [
          "rgba(16, 185, 129, 0.85)",
          "rgba(244, 63, 94, 0.85)",
        ],
        borderColor: ["#10b981", "#f43f5e"],
        borderWidth: 2,
        hoverOffset: 10,
        hoverBorderColor: ["#34d399", "#fb7185"],
        hoverBorderWidth: 3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 800,
      easing: "easeInOutQuart" as const,
    },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          color: "#94a3b8",
          font: { size: 12, weight: 600 as const, family: "Inter" },
          padding: 20,
          boxWidth: 12,
          boxHeight: 12,
          borderRadius: 4,
          usePointStyle: true,
          pointStyle: "circle",
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
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw
            const pct = ((val / total) * 100).toFixed(1)
            return ` ${ctx.label}: ${val} events (${pct}%)`
          },
        },
      },
    },
    cutout: "72%",
  }

  // Center text plugin rendered via CSS overlay
  const normalPct = ((normal / total) * 100).toFixed(0)

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <Doughnut data={data} options={options} />
      {/* Center overlay */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: "#34d399",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {normalPct}%
        </div>
        <div
          style={{
            fontSize: "0.6rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#475569",
            marginTop: "2px",
          }}
        >
          Normal
        </div>
      </div>
    </div>
  )
}
