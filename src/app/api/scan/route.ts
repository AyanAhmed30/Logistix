import { NextResponse } from "next/server";
import { recordCartonScan } from "@/app/actions/orders";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scanIdentifier?: string;
      scanType?: string;
      consoleId?: string;
    };
    const scanIdentifier = typeof body?.scanIdentifier === "string" ? body.scanIdentifier : "";
    const scanType = body?.scanType === "outward" ? "outward" : "inward";
    const consoleId = typeof body?.consoleId === "string" ? body.consoleId.trim() : "";

    if (!scanIdentifier.trim()) {
      return NextResponse.json({ error: "scanIdentifier is required" }, { status: 400 });
    }

    const result = await recordCartonScan(scanIdentifier, {
      scanType,
      consoleId: scanType === "outward" ? consoleId : undefined,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        duplicate: !!result.duplicate,
        scanType: result.scanType ?? "inward",
        consoleId: scanType === "outward" ? consoleId || null : null,
        carton: result.carton ?? null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Unable to process scan request" }, { status: 500 });
  }
}
