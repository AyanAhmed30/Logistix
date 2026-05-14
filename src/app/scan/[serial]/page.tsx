import { getCartonScanPreview, type ScanPreviewContext } from "@/app/actions/orders";
import { ScanConfirmationCard } from "@/components/scan/ScanConfirmationCard";

type Props = {
  params: Promise<{ serial: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function ScanRedirectPage({ params, searchParams }: Props) {
  const { serial } = await params;
  const sp = (await searchParams) ?? {};

  if (!serial) {
    return null;
  }

  const outwardRaw = firstParam(sp.outward);
  const outward =
    outwardRaw === "1" ||
    outwardRaw === "true" ||
    outwardRaw === "yes" ||
    outwardRaw === "outward";
  const consoleId = firstParam(sp.console)?.trim() ?? "";

  const context: ScanPreviewContext | undefined =
    outward && consoleId ? { scanMode: "outward", consoleId } : undefined;

  const previewResult = await getCartonScanPreview(serial, context);
  if ("error" in previewResult || !previewResult.preview) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4">
        <div className="max-w-md mx-auto rounded-xl border bg-white shadow-sm p-6 text-center space-y-3">
          <h1 className="text-2xl font-bold text-primary-dark">Invalid QR Code</h1>
          <p className="text-sm text-secondary-muted">
            {"error" in previewResult && previewResult.error
              ? previewResult.error
              : "This sticker could not be verified. Please rescan a valid warehouse sticker."}
          </p>
        </div>
      </div>
    );
  }

  return <ScanConfirmationCard preview={previewResult.preview} />;
}
