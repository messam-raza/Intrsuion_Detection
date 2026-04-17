import { NextResponse, type NextRequest } from "next/server";
import type { Types } from "mongoose";
import { connectMongo } from "@/lib/mongoose";
import Patient from "@/models/Patient";
import Device from "@/models/Device";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/patients/[id]">,
) {
  try {
    const { id } = await ctx.params;
    await connectMongo();

    const patient = await Patient.findOne({
      $or: [{ patientId: id }, ...(isObjectId(id) ? [{ _id: id }] : [])],
    }).lean();

    if (!patient) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const patientDoc = patient as { _id: Types.ObjectId };
    const devices = await Device.find({ patient: patientDoc._id }).lean();

    return NextResponse.json({ patient, devices });
  } catch (err) {
    console.error("[api/patients/:id GET]", err);
    return NextResponse.json(
      { error: "Failed to load patient" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/patients/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    await connectMongo();

    const query = {
      $or: [{ patientId: id }, ...(isObjectId(id) ? [{ _id: id }] : [])],
    };

    const patient = await Patient.findOneAndUpdate(query, body, { new: true });
    if (!patient) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ patient });
  } catch (err) {
    console.error("[api/patients/:id PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update patient" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/patients/[id]">,
) {
  try {
    const { id } = await ctx.params;
    await connectMongo();

    const query = {
      $or: [{ patientId: id }, ...(isObjectId(id) ? [{ _id: id }] : [])],
    };

    const deleted = await Patient.findOneAndDelete(query);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await Device.updateMany({ patient: deleted._id }, { $set: { patient: null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/patients/:id DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete patient" },
      { status: 500 },
    );
  }
}

function isObjectId(id: string) {
  return /^[a-f\d]{24}$/i.test(id);
}
