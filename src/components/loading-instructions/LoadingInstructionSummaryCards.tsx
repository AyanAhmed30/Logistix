import { Card, CardContent } from "@/components/ui/card";
import type { LoadingInstructionDashboardSummary } from "@/lib/loading-instruction-progress";

type Props = {
  summary: LoadingInstructionDashboardSummary;
  variant: "user" | "admin";
};

export function LoadingInstructionSummaryCards({ summary, variant }: Props) {
  const userCards = [
    { label: "Total Orders", value: summary.total_orders },
    { label: "Waiting for Loading", value: summary.waiting },
    { label: "Fully Loaded", value: summary.fully_loaded },
    { label: "Partially Loaded", value: summary.partially_loaded },
    { label: "Re-Inward Cartons", value: summary.total_re_inward_cartons },
  ];

  const adminCards = [
    { label: "Loading Instructions", value: summary.total_consoles ?? 0 },
    { label: "Orders in Loading", value: summary.total_orders },
    { label: "Fully Loaded Orders", value: summary.fully_loaded },
    { label: "Partially Loaded", value: summary.partially_loaded },
    { label: "Re-Inward Cartons", value: summary.total_re_inward_cartons },
  ];

  const cards = variant === "admin" ? adminCards : userCards;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="bg-white border shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-secondary-muted uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold text-primary-dark mt-1">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
