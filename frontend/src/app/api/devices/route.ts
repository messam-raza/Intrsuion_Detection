import { NextResponse, type NextRequest } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import Device from "@/models/Device";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectMongo();
    const devices = await Device.find()
      .populate("patient", "fullName patientId")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ devices });
  } catch (err) {
    console.error("[api/devices GET]", err);
    return NextResponse.json(
      { error: "Failed to load devices" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await connectMongo();

    const deviceId =
      body.deviceId ||
      `DEV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const device = await Device.create({
      deviceId,
      hardwareId: body.hardwareId,
      deviceType: body.deviceType || "pulse_ox",
      connectivity: body.connectivity || "wifi",
      patient: body.patient || null,
      status: body.status || "offline",
    });

    return NextResponse.json({ device }, { status: 201 });
  } catch (err) {
    console.error("[api/devices POST]", err);
    return NextResponse.json(
      { error: "Failed to create device" },
      { status: 500 },
    );
  }
}
