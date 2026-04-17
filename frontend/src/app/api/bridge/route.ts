import { NextResponse } from "next/server";
import { getBridgeStatus } from "@/lib/socketBridge";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBridgeStatus());
}
