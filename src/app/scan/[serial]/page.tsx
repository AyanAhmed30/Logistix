import { recordCartonScan } from "@/app/actions/orders";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ serial: string }>;
};

export default async function ScanRedirectPage({ params }: Props) {
  const { serial } = await params;

  if (!serial) {
    redirect("/_not-found");
  }

  const result = await recordCartonScan(serial);

  // Even if recording fails, still redirect to carton details so the user sees something
  if ("error" in result) {
    redirect(`/carton/${encodeURIComponent(serial)}`);
  }

  redirect(`/carton/${encodeURIComponent(serial)}`);
}

