"use client"

import { useState } from "react"
import VitalsPage from "@/components/pages/VitalsPage"
import AnalyticsPage from "@/components/pages/AnalyticsPage"

type PageType = "vitals" | "analytics"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<PageType>("vitals")

  return (
    <div className="dashboard-wrapper">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <span>🛡️</span>
            TwinGuardAI
          </div>
          <nav className="nav-tabs">
            <button
              className={`nav-tab ${currentPage === "vitals" ? "active" : ""}`}
              onClick={() => setCurrentPage("vitals")}
            >
              Vitals
            </button>
            <button
              className={`nav-tab ${currentPage === "analytics" ? "active" : ""}`}
              onClick={() => setCurrentPage("analytics")}
            >
              Analytics
            </button>
          </nav>
        </div>
        <div className="header-status">
          <div className="status-badge">
            <div className="status-dot"></div>
            Live Monitoring
          </div>
        </div>
      </header>

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-title">System Status</div>
          <div className="sidebar-metric">
            <span className="sidebar-metric-label">Connection</span>
            <span className="sidebar-metric-value" style={{ fontSize: "1rem" }}>
              ✓
            </span>
          </div>
          <div className="sidebar-metric">
            <span className="sidebar-metric-label">Uptime</span>
            <span className="sidebar-metric-value" style={{ fontSize: "0.9rem" }}>
              99.9%
            </span>
          </div>
        </div>
{/* 
        <div className="sidebar-section">
          <div className="sidebar-title">Quick Links</div>
          <div className="sidebar-item active">
            <span>📊</span> Dashboard
          </div>
          <div className="sidebar-item">
            <span>⚙️</span> Settings
          </div>
          <div className="sidebar-item">
            <span>📋</span> Reports
          </div>
        </div> */}
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {currentPage === "vitals" && <VitalsPage />}
        {currentPage === "analytics" && <AnalyticsPage />}
      </main>
    </div>
  )
}
