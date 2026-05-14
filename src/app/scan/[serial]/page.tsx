import { getCartonScanPreview } from "@/app/actions/orders";
import { ScanConfirmationCard } from "@/components/scan/ScanConfirmationCard";

type Props = {
  params: Promise<{ serial: string }>;
};

export default async function ScanRedirectPage({ params }: Props) {
  const { serial } = await params;

  if (!serial) {
    return null;
  }

  const previewResult = await getCartonScanPreview(serial);
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
