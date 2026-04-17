"use client";

export default function Topbar() {
  return (
    <header className="fixed top-0 right-0 left-64 h-16 z-40 glass-panel border-b border-outline-variant/15 flex items-center justify-between px-8">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold tracking-tight text-on-surface">
          TwinGuard AI
        </h2>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search patients, devices..."
            className="pl-9 pr-4 py-1.5 bg-surface-container-low text-on-surface text-sm rounded-md border border-outline-variant/15 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all w-64 placeholder:text-secondary/70"
          />
        </div>
        <div className="flex items-center gap-3 text-blue-700">
          <button
            type="button"
            className="relative text-slate-500 hover:text-blue-600 transition-colors p-1"
          >
            <span className="material-symbols-outlined text-xl">
              notifications
            </span>
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-error rounded-full ring-2 ring-surface" />
          </button>
          <button
            type="button"
            className="text-slate-500 hover:text-blue-600 transition-colors p-1"
          >
            <span className="material-symbols-outlined text-xl">
              account_circle
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
