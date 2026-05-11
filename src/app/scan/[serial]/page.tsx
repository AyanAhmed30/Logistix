import { recordCartonScan } from "@/app/actions/orders";

type Props = {
  params: Promise<{ serial: string }>;
};

export default async function ScanRedirectPage({ params }: Props) {
  const { serial } = await params;

  if (!serial) {
    return null;
  }

  const result = await recordCartonScan(serial);

  const isError = "error" in result;
  const isDuplicate = !isError && !!result.duplicate;
  const serialLabel = !isError ? result.carton?.serial ?? "-" : "-";
  const trackingLabel = !isError ? result.carton?.tracking_id ?? "-" : "-";
  const qrLabel = !isError ? result.carton?.sticker_identifier ?? "-" : "-";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-10 px-4">
      <div className="max-w-md mx-auto rounded-xl border bg-white shadow-sm p-6 text-center space-y-4">
        <h1 className="text-2xl font-bold text-primary-dark">
          {isError ? "Invalid QR Code" : isDuplicate ? "Sticker Already Scanned" : "Sticker Scanned Successfully"}
        </h1>
        <p className="text-sm text-secondary-muted">
          {isError
            ? "This QR code is invalid or no longer available."
            : "The scan has been registered. It now appears in the user dashboard Scanned Stickers tab."}
        </p>
        {!isError ? (
          <div className="rounded-lg border bg-slate-50 p-3 text-left text-sm space-y-1">
            <div><span className="font-semibold">Carton:</span> {serialLabel}</div>
            <div><span className="font-semibold">Tracking:</span> {trackingLabel}</div>
            <div><span className="font-semibold">QR ID:</span> {qrLabel}</div>
            <div><span className="font-semibold">Status:</span> {isDuplicate ? "Already scanned" : "Scanned"}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

