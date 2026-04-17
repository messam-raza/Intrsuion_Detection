import { NextResponse, type NextRequest } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import Patient from "@/models/Patient";
import Device from "@/models/Device";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectMongo();
    const patients = await Patient.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ patients });
  } catch (err) {
    console.error("[api/patients GET]", err);
    return NextResponse.json(
      { error: "Failed to load patients" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await connectMongo();

    const patientId =
      body.patientId || `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const patient = await Patient.create({
      patientId,
      fullName: body.fullName,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      sex: body.sex || "",
      bloodType: body.bloodType || "",
      weightKg: body.weightKg ? Number(body.weightKg) : undefined,
      heightCm: body.heightCm ? Number(body.heightCm) : undefined,
      primaryDiagnosis: body.primaryDiagnosis || "",
      medicalHistory: body.medicalHistory || "",
    });

    // Optionally pair an initial device if provided in the same request.
    if (body.device?.hardwareId) {
      await Device.create({
        deviceId:
          body.device.deviceId ||
          `DEV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        hardwareId: body.device.hardwareId,
        deviceType: body.device.deviceType || "pulse_ox",
        connectivity: body.device.connectivity || "wifi",
        patient: patient._id,
        status: "offline",
      });
    }

    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    console.error("[api/patients POST]", err);
    return NextResponse.json(
      { error: "Failed to create patient" },
      { status: 500 },
    );
  }
}
