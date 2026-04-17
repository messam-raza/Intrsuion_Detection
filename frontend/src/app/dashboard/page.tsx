import { connectMongo } from "@/lib/mongoose";
import Patient from "@/models/Patient";
import Device from "@/models/Device";
import EventModel from "@/models/Event";
import DashboardClient from "@/components/pages/DashboardClient";

export const dynamic = "force-dynamic";

async function getStats() {
  try {
    await connectMongo();

    const [totalPatients, totalDevices, onlineDevices, recentAttacks] =
      await Promise.all([
        Patient.countDocuments({}),
        Device.countDocuments({}),
        Device.countDocuments({ status: "online" }),
        EventModel.countDocuments({
          prediction: "ATTACK",
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }),
      ]);

    return {
      totalPatients,
      totalDevices,
      onlineDevices,
      recentAttacks,
    };
  } catch (err) {
    console.error("[dashboard getStats]", err);
    return {
      totalPatients: 0,
      totalDevices: 0,
      onlineDevices: 0,
      recentAttacks: 0,
    };
  }
}

export default async function DashboardPage() {
  const stats = await getStats();
  return <DashboardClient stats={stats} />;
}
