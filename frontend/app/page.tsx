"use client"

import { useState, useEffect } from "react"
import VitalsPage from "@/components/pages/VitalsPage"
import AnalyticsPage from "@/components/pages/AnalyticsPage"

type PageType = "vitals" | "analytics"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<PageType>("vitals")
  const [currentTime, setCurrentTime] = useState("")

  // Live clock
  useEffect(() => {
    const update = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="dashboard-wrapper">
      {/* ── HEADER ── */}
      <header className="dashboard-header">
        <div className="header-left">
          {/* Logo */}
          <div className="logo">
            <div className="logo-icon">🛡️</div>
            <div className="logo-text">
              <span className="logo-title">TwinGuard AI</span>
              <span className="logo-sub">IoT Security Monitor</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="nav-tabs" aria-label="Main navigation">
            <button
              id="nav-vitals"
              className={`nav-tab ${currentPage === "vitals" ? "active" : ""}`}
              onClick={() => setCurrentPage("vitals")}
            >
              <span aria-hidden>❤️</span>
              Vitals
            </button>
            <button
              id="nav-analytics"
              className={`nav-tab ${currentPage === "analytics" ? "active" : ""}`}
              onClick={() => setCurrentPage("analytics")}
            >
              <span aria-hidden>📊</span>
              Analytics
            </button>
          </nav>
        </div>

        {/* Right side */}
        <div className="header-status">
          <span className="header-time" aria-label="Current time">{currentTime}</span>
          <div className="status-badge" aria-label="System status: live monitoring">
            <div className="status-dot" />
            Live
          </div>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar" aria-label="System information panel">
        {/* System Score */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-label">System Health</div>
          <div className="sidebar-brand-value">99.9%</div>
        </div>

        {/* Connection */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Connection</div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">🌐</span> Status
            </span>
            <span className="sidebar-metric-value success">Online</span>
          </div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">⚡</span> Uptime
            </span>
            <span className="sidebar-metric-value">99.9%</span>
          </div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">📡</span> Protocol
            </span>
            <span className="sidebar-metric-value">WebSocket</span>
          </div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">📶</span> Latency
            </span>
            <span className="sidebar-metric-value">24ms</span>
          </div>
        </div>

        {/* Model Info */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">AI Model</div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">🤖</span> Engine
            </span>
            <span className="sidebar-metric-value">TwinGuard v2</span>
          </div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">🎯</span> Accuracy
            </span>
            <span className="sidebar-metric-value success">97.2%</span>
          </div>

          <div className="sidebar-metric-row">
            <span className="sidebar-metric-label">
              <span className="icon">🔍</span> Mode
            </span>
            <span className="sidebar-metric-value">Real-time</span>
          </div>
        </div>

        {/* Health bars */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Resources</div>

          <div className="sys-health">
            <div className="sys-health-header">
              <span className="sys-health-label">CPU Usage</span>
              <span className="sys-health-pct">18%</span>
            </div>
            <div className="health-bar">
              <div className="health-bar-fill" style={{ width: "18%" }} />
            </div>
          </div>

          <div className="sys-health">
            <div className="sys-health-header">
              <span className="sys-health-label">Memory</span>
              <span className="sys-health-pct">42%</span>
            </div>
            <div className="health-bar">
              <div className="health-bar-fill" style={{ width: "42%" }} />
            </div>
          </div>

          <div className="sys-health">
            <div className="sys-health-header">
              <span className="sys-health-label">Model Confidence</span>
              <span className="sys-health-pct">97%</span>
            </div>
            <div className="health-bar">
              <div className="health-bar-fill" style={{ width: "97%" }} />
            </div>
          </div>
        </div>

        {/* Version tag */}
        <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <div style={{
            fontSize: "0.65rem",
            color: "var(--text-muted)",
            textAlign: "center",
            letterSpacing: "0.05em",
          }}>
            TwinGuard AI · FYP 2025 · v2.0.0
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="main-content" id="main-content">
        {currentPage === "vitals"    && <VitalsPage />}
        {currentPage === "analytics" && <AnalyticsPage />}
      </main>
    </div>
  )
}
