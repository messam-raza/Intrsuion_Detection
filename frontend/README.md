# TwinGuard AI — Clinical Sentinel (Frontend)

A Next.js 16 dashboard that visualizes real-time vitals telemetry from paired
medical devices, flags anomaly / attack packets in the stream, and persists
patient and device records in MongoDB.

The UI is a faithful implementation of the Stitch "TwinGuard AI Medical
Dashboard" project (Dashboard, Live Monitor, Live Analytics, Patient Records,
Add Patient & Device).

## Stack

- **Next.js 16** (App Router, Server Components, Route Handlers)
- **React 19**
- **Tailwind CSS v4** via `@tailwindcss/postcss`
- **Mongoose** for MongoDB access (server-side only)
- **socket.io-client** for real-time vitals streaming
- **Material Symbols Outlined** for iconography, **Inter** for typography

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and adjust as needed:

```bash
cp .env.example .env.local
```

| Variable                 | Scope       | Purpose                                                 |
| ------------------------ | ----------- | ------------------------------------------------------- |
| `MONGODB_URI`            | server only | Mongoose connection string                              |
| `NEXT_PUBLIC_SOCKET_URL` | browser     | Socket.IO server emitting `vitals_update` events        |

`MONGODB_URI` is never exposed to the browser — all DB access happens in
Route Handlers (`src/app/api/**`) and Server Components.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to
`/dashboard`.

### 4. Build for production

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/
│   ├── layout.tsx            # Root layout (Sidebar + Topbar + main)
│   ├── page.tsx              # Redirects to /dashboard
│   ├── globals.css           # Tailwind v4 theme tokens + helpers
│   ├── dashboard/            # Command center overview
│   ├── monitor/              # Live telemetry stream
│   ├── analytics/            # Real-time attack/normal analytics
│   ├── patients/             # Patient records list + detail view
│   ├── add/                  # Add Patient & Device form
│   └── api/
│       ├── patients/         # REST for patients (+ /[id])
│       ├── devices/          # REST for devices
│       └── events/           # REST for telemetry events
├── components/
│   ├── layout/               # Sidebar, Topbar
│   └── pages/                # Client components per page
├── lib/
│   ├── mongoose.ts           # Cached Mongoose connection
│   └── types.ts              # Shared DTO / event types
└── models/
    ├── Patient.ts
    ├── Device.ts
    └── Event.ts
```

## Persistence (server-side Socket.IO bridge)

`src/instrumentation.ts` boots a single Socket.IO **server-side** client per
Next.js process (via the Node runtime instrumentation hook). It subscribes to
the `vitals_update` event on the detector backend and persists every frame to
MongoDB using an idempotent upsert keyed on `(deviceId, tsUnix)` — so
reconnects / duplicate emissions never create duplicate rows, and telemetry is
captured even when no browser tab is open.

The bridge also refreshes each device's `status` (`online` / `warning`) and
`lastSeenAt` field as frames arrive.

- Server-side endpoint: `SOCKET_URL` (falls back to `NEXT_PUBLIC_SOCKET_URL`).
- Health check: `GET /api/bridge` returns `{ started, connected, persisted, skipped, lastError }`.
- Event-model dedupe: unique compound index on `{ deviceId, tsUnix }`.

## Real-time data flow

Each interactive page opens a Socket.IO connection to
`NEXT_PUBLIC_SOCKET_URL` and subscribes to the `vitals_update` event.
The payload shape is:

```json
{
  "device_id": "sim-001",
  "spo2": 98,
  "pulse": 73,
  "prediction": "NORMAL",
  "confidence": 0.97,
  "timestamp": "2025-04-17T12:34:56Z",
  "ts_unix": 1713354896.12
}
```

- **Dashboard** — aggregates live counts, SpO₂ sparkline, pulse anomaly
  buckets, recent alerts feed.
- **Live Monitor** — continuous packet stream table + per-frame status badges
  (Normal / Attack) with SpO₂ / Pulse pill readouts.
- **Live Analytics** — classification topology chart, packet distribution
  donut, predictive confidence bar matrix (all computed from the live stream).
- **Patient Detail** — filters the live stream to the patient's paired
  devices, loads the 200 most recent persisted frames from MongoDB, and
  renders a unified Packet History table (live + stored, deduped on
  `deviceId+tsUnix`). Auto-refreshes history every 15s and on tab focus;
  supports filtering by `Normal` / `Attack` status.

## REST API (Route Handlers)

| Method | Path                     | Description                              |
| ------ | ------------------------ | ---------------------------------------- |
| GET    | `/api/patients`          | List all patients                        |
| POST   | `/api/patients`          | Create patient (+ optional paired device)|
| GET    | `/api/patients/[id]`     | Patient + devices (by `_id` or `patientId`) |
| PATCH  | `/api/patients/[id]`     | Update patient                           |
| DELETE | `/api/patients/[id]`     | Delete patient (and unbind devices)      |
| GET    | `/api/devices`           | List devices populated with patients     |
| POST   | `/api/devices`           | Register a new device                    |
| GET    | `/api/events?deviceId=`  | Recent telemetry events                  |
| POST   | `/api/events`            | Persist a telemetry frame                |

All handlers use `export const dynamic = "force-dynamic"` so data is always
fresh per request.

## Design system

Tailwind v4 theme tokens are declared in `src/app/globals.css` under
`@theme { … }`, mirroring the Stitch Material color roles (`primary`,
`surface-container-lowest`, `error-container`, etc.). Reusable helpers
(`.primary-gradient`, `.ghost-border`, `.ambient-shadow`, `.form-input`,
animation keyframes) are defined in the same file.
