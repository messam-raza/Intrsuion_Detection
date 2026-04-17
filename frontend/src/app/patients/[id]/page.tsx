import { notFound } from "next/navigation";
import type { Types } from "mongoose";
import { connectMongo } from "@/lib/mongoose";
import Patient from "@/models/Patient";
import Device from "@/models/Device";
import EventModel from "@/models/Event";
import PatientDetailClient from "@/components/pages/PatientDetailClient";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 200;

async function getPatient(id: string) {
  await connectMongo();
  const isObjectId = /^[a-f\d]{24}$/i.test(id);
  const query = {
    $or: [{ patientId: id }, ...(isObjectId ? [{ _id: id }] : [])],
  };
  const patient = await Patient.findOne(query).lean();
  if (!patient) return null;
  const patientDoc = patient as { _id: Types.ObjectId };
  const devices = await Device.find({ patient: patientDoc._id }).lean();
  const deviceIds = devices.map((d) => d.deviceId);

  if (!deviceIds.length) {
    return { patient, devices, events: [], totalEvents: 0 };
  }

  const [events, totalEvents] = await Promise.all([
    EventModel.find({ deviceId: { $in: deviceIds } })
      .sort({ timestamp: -1 })
      .limit(HISTORY_LIMIT)
      .lean(),
    EventModel.countDocuments({ deviceId: { $in: deviceIds } }),
  ]);

  return { patient, devices, events, totalEvents };
}

export default async function PatientDetailPage(
  props: PageProps<"/patients/[id]">,
) {
  const { id } = await props.params;
  const data = await getPatient(id);
  if (!data) notFound();

  const patient = JSON.parse(JSON.stringify(data.patient));
  const devices = JSON.parse(JSON.stringify(data.devices));
  const events = JSON.parse(JSON.stringify(data.events));

  return (
    <PatientDetailClient
      patient={patient}
      devices={devices}
      events={events}
      totalEvents={data.totalEvents}
    />
  );
}
