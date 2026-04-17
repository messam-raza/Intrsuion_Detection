import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "TwinGuard AI — Clinical Sentinel",
  description:
    "Real-time medical IoT telemetry, anomaly detection and patient monitoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-background text-on-surface flex min-h-screen">
        <Sidebar />
        <div className="ml-64 flex-1 flex flex-col min-h-screen">
          <Topbar />
          <main className="flex-1 mt-16 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
