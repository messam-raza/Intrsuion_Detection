import Link from "next/link";
import { connectMongo } from "@/lib/mongoose";
import Patient from "@/models/Patient";
import Device from "@/models/Device";

export const dynamic = "force-dynamic";

type PatientRow = {
  _id: string;
  patientId: string;
  fullName: string;
  primaryDiagnosis?: string;
  admittedAt?: Date;
  deviceCount: number;
};

async function getPatients(): Promise<PatientRow[]> {
  try {
    await connectMongo();
    const patients = await Patient.find().sort({ createdAt: -1 }).lean();
    if (patients.length === 0) return [];
    const ids = patients.map((p) => p._id);
    const counts = await Device.aggregate<{ _id: string; count: number }>([
      { $match: { patient: { $in: ids } } },
      { $group: { _id: "$patient", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return patients.map((p) => ({
      _id: String(p._id),
      patientId: p.patientId,
      fullName: p.fullName,
      primaryDiagnosis: p.primaryDiagnosis,
      admittedAt: p.admittedAt ? new Date(p.admittedAt) : undefined,
      deviceCount: countMap.get(String(p._id)) ?? 0,
    }));
  } catch (err) {
    console.error("[patients page]", err);
    return [];
  }
}

export default async function PatientsListPage() {
  const patients = await getPatients();

  return (
    <div className="pt-8 px-8 pb-12 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-[2rem] font-bold text-on-surface tracking-tight leading-tight">
            Patient Records
          </h2>
          <p className="text-sm font-medium text-secondary mt-1">
            {patients.length} record{patients.length === 1 ? "" : "s"} on file
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/add"
            className="px-4 py-2 rounded-md primary-gradient text-on-primary font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">
              person_add
            </span>
            New Patient
          </Link>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl ghost-border ambient-shadow overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low/50 text-[10px] uppercase tracking-wider text-secondary">
              <th className="p-4 font-semibold">Patient ID</th>
              <th className="p-4 font-semibold">Name</th>
              <th className="p-4 font-semibold">Primary Diagnosis</th>
              <th className="p-4 font-semibold">Devices</th>
              <th className="p-4 font-semibold">Admitted</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-surface-container-low">
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="p-12 text-center text-secondary">
                  No patients yet. Start by{" "}
                  <Link href="/add" className="text-primary hover:underline">
                    registering a patient
                  </Link>
                  .
                </td>
              </tr>
            )}
            {patients.map((p) => (
              <tr
                key={p._id}
                className="hover:bg-surface-container-low/40 transition-colors"
              >
                <td className="p-4 font-mono text-xs text-on-surface-variant">
                  {p.patientId}
                </td>
                <td className="p-4 font-medium text-on-surface">
                  {p.fullName}
                </td>
                <td className="p-4">
                  {p.primaryDiagnosis ? (
                    <span className="text-xs font-medium text-primary bg-primary/10 inline-block px-2 py-1 rounded">
                      {p.primaryDiagnosis}
                    </span>
                  ) : (
                    <span className="text-xs text-secondary">—</span>
                  )}
                </td>
                <td className="p-4 text-on-surface">{p.deviceCount}</td>
                <td className="p-4 text-secondary text-xs">
                  {p.admittedAt
                    ? p.admittedAt.toISOString().slice(0, 10)
                    : "—"}
                </td>
                <td className="p-4 text-right">
                  <Link
                    href={`/patients/${encodeURIComponent(p.patientId)}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View
                    <span className="material-symbols-outlined text-sm">
                      chevron_right
                    </span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
