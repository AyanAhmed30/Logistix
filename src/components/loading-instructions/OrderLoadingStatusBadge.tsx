import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_META, type OrderLoadingStatus } from "@/lib/loading-instruction-progress";
import type { OrderLoadingProgressCounts } from "@/lib/loading-instruction-progress";

type Props = {
  status: OrderLoadingStatus;
  counts: OrderLoadingProgressCounts;
  variant?: "user" | "admin";
};

export function OrderLoadingStatusBadge({ status, counts, variant = "user" }: Props) {
  const meta = ORDER_STATUS_META[status];

  if (variant === "admin") {
    if (status === "fully_loaded") {
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0">
          Fully Loaded · {counts.outward}/{counts.total} Outward
        </Badge>
      );
    }
    if (status === "partially_loaded") {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0">
          Partially Loaded · {counts.outward} Out · {counts.re_inward} Re-In
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600 text-white border-0">
        Waiting for Loading
      </Badge>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}
      title={meta.description}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}
