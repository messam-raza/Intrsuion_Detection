import { NextResponse, type NextRequest } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import EventModel from "@/models/Event";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await connectMongo();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const deviceId = searchParams.get("deviceId");

    const query: Record<string, unknown> = {};
    if (deviceId) query.deviceId = deviceId;

    const events = await EventModel.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ events });
  } catch (err) {
    console.error("[api/events GET]", err);
    return NextResponse.json(
      { error: "Failed to load events" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await connectMongo();

    const event = await EventModel.create({
      deviceId: body.device_id || body.deviceId,
      spo2: Number(body.spo2) || 0,
      pulse: Number(body.pulse) || 0,
      prediction: (body.prediction || "NORMAL").toString().toUpperCase(),
      confidence: Number(body.confidence) || 0,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      tsUnix: body.ts_unix ?? body.tsUnix,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("[api/events POST]", err);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }
}
