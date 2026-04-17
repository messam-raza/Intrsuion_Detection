"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/monitor", label: "Live Monitor", icon: "sensors" },
  { href: "/analytics", label: "Live Analytics", icon: "query_stats" },
  { href: "/patients", label: "Patient Records", icon: "folder_shared" },
  { href: "/add", label: "Add Patient/Device", icon: "person_add" },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="h-screen w-64 fixed left-0 top-0 bg-slate-100/60 flex flex-col py-6 px-4 z-50">
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl primary-gradient flex items-center justify-center text-on-primary font-bold shadow-sm shrink-0">
          TG
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-blue-900">
            TwinGuard AI
          </h1>
          <p className="text-xs text-secondary font-medium tracking-wide">
            Clinical Sentinel
          </p>
        </div>
      </div>

      <button
        type="button"
        className="w-full mb-8 py-2.5 px-4 rounded-md primary-gradient text-on-primary font-semibold text-sm shadow-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined filled text-lg">warning</span>
        <span>Urgent Review</span>
      </button>

      <div className="space-y-1 flex-1">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 px-3 py-3 rounded-md transition-colors text-sm font-medium",
                active
                  ? "text-blue-700 font-semibold border-r-4 border-blue-700 bg-blue-50/80"
                  : "text-slate-500 hover:text-blue-600 hover:bg-slate-200/50",
              ].join(" ")}
            >
              <span
                className={
                  "material-symbols-outlined text-xl " +
                  (active ? "filled" : "")
                }
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto pt-6 space-y-1 border-t border-outline-variant/20">
        <Link
          href="#"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">settings</span>
          <span className="text-sm">Settings</span>
        </Link>
        <Link
          href="#"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-slate-500 hover:text-blue-600 hover:bg-slate-200/50 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">help</span>
          <span className="text-sm">Support</span>
        </Link>
      </div>
    </nav>
  );
}
