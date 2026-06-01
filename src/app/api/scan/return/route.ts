import { NextResponse } from "next/server";
import { recordCartonReInwardScan } from "@/app/actions/loading-workflow";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { scanIdentifier?: string; consoleId?: string };
    const scanIdentifier = typeof body?.scanIdentifier === "string" ? body.scanIdentifier : "";
    const consoleId = typeof body?.consoleId === "string" ? body.consoleId : "";

    if (!scanIdentifier.trim() || !consoleId) {
      return NextResponse.json({ error: "scanIdentifier and consoleId are required" }, { status: 400 });
    }

    const result = await recordCartonReInwardScan(scanIdentifier, consoleId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        duplicate: !!result.duplicate,
        scanType: "re_inward",
        consoleId: result.consoleId,
        carton: result.carton,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Unable to process return scan" }, { status: 500 });
  }
}
