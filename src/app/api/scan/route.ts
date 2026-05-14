import { NextResponse } from "next/server";
import { recordCartonScan } from "@/app/actions/orders";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { scanIdentifier?: string };
    const scanIdentifier = typeof body?.scanIdentifier === "string" ? body.scanIdentifier : "";

    if (!scanIdentifier.trim()) {
      return NextResponse.json({ error: "scanIdentifier is required" }, { status: 400 });
    }

    const result = await recordCartonScan(scanIdentifier);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        duplicate: !!result.duplicate,
        scanType: result.scanType ?? "inward",
        consoleId: result.consoleId ?? null,
        carton: result.carton ?? null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Unable to process scan request" }, { status: 500 });
  }
}
