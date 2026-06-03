export type CartonLoadingStatus = "pending_inward" | "inward" | "outward" | "re_inward";

export type OrderLoadingStatus = "waiting" | "fully_loaded" | "partially_loaded";

export type CartonScanTimelineEvent = {
  type: "inward" | "outward" | "re_inward";
  scanned_at: string;
  label: string;
};

export type CartonProgressDetail = {
  carton_id: string;
  carton_no: string;
  shipping_mark: string;
  current_status: CartonLoadingStatus;
  last_activity_at: string | null;
  remarks: string;
  timeline: CartonScanTimelineEvent[];
};

export type OrderLoadingProgressCounts = {
  total: number;
  inward: number;
  outward: number;
  re_inward: number;
  pending_inward: number;
};

export type OrderLoadingProgressRow = {
  order_id: string;
  order_number: string;
  shipping_mark: string;
  username?: string;
  console_id: string;
  console_number: string;
  loading_instruction_no: string;
  destination_country?: string;
  item_description?: string | null;
  counts: OrderLoadingProgressCounts;
  status: OrderLoadingStatus;
  last_activity_at: string | null;
  cartons: CartonProgressDetail[];
};

export type LoadingInstructionDashboardSummary = {
  total_orders: number;
  waiting: number;
  fully_loaded: number;
  partially_loaded: number;
  total_re_inward_cartons: number;
  total_consoles?: number;
};

export type LoadingInstructionSortKey =
  | "latest_activity"
  | "oldest_activity"
  | "most_loaded"
  | "most_re_inward";

export type LoadingInstructionStatusFilter =
  | "all"
  | "fully_loaded"
  | "partially_loaded"
  | "waiting"
  | "has_inward"
  | "has_outward"
  | "has_re_inward";

export function formatLoadingDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function orderNumberLabel(orderId: string, shippingMark: string): string {
  if (shippingMark?.trim()) return shippingMark;
  return orderId.slice(0, 8).toUpperCase();
}

export function cartonNoLabel(
  serial: string | null | undefined,
  cartonIndex: number,
  totalCartons: number
): string {
  if (serial?.trim()) return serial;
  return `CTN-${String(cartonIndex).padStart(3, "0")}/${totalCartons}`;
}

export function deriveOrderLoadingStatus(counts: OrderLoadingProgressCounts): OrderLoadingStatus {
  const { total, outward, re_inward, inward, pending_inward } = counts;
  if (total === 0) return "waiting";
  if (outward >= total && re_inward === 0) return "fully_loaded";
  if (outward > 0 || re_inward > 0) return "partially_loaded";
  if (inward > 0 && outward === 0 && re_inward === 0) return "waiting";
  if (pending_inward === total) return "waiting";
  return "waiting";
}

export function loadingProgressPercent(counts: OrderLoadingProgressCounts): number {
  if (counts.total <= 0) return 0;
  return Math.round((counts.outward / counts.total) * 100);
}

export function summarizeOrderRows(rows: OrderLoadingProgressRow[]): LoadingInstructionDashboardSummary {
  let waiting = 0;
  let fully_loaded = 0;
  let partially_loaded = 0;
  let total_re_inward_cartons = 0;
  const consoleIds = new Set<string>();

  for (const row of rows) {
    consoleIds.add(row.console_id);
    total_re_inward_cartons += row.counts.re_inward;
    if (row.status === "fully_loaded") fully_loaded += 1;
    else if (row.status === "partially_loaded") partially_loaded += 1;
    else waiting += 1;
  }

  return {
    total_orders: rows.length,
    waiting,
    fully_loaded,
    partially_loaded,
    total_re_inward_cartons,
    total_consoles: consoleIds.size,
  };
}

export function filterAndSortOrderRows(
  rows: OrderLoadingProgressRow[],
  options: {
    search?: string;
    statusFilter?: LoadingInstructionStatusFilter;
    sort?: LoadingInstructionSortKey;
  }
): OrderLoadingProgressRow[] {
  const q = (options.search ?? "").trim().toLowerCase();
  let list = [...rows];

  if (q) {
    list = list.filter((row) => {
      const hay = [
        row.order_number,
        row.shipping_mark,
        row.console_number,
        row.loading_instruction_no,
        row.username ?? "",
        ...row.cartons.map((c) => c.carton_no),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const sf = options.statusFilter ?? "all";
  if (sf !== "all") {
    list = list.filter((row) => {
      switch (sf) {
        case "fully_loaded":
          return row.status === "fully_loaded";
        case "partially_loaded":
          return row.status === "partially_loaded";
        case "waiting":
          return row.status === "waiting";
        case "has_inward":
          return row.counts.inward > 0;
        case "has_outward":
          return row.counts.outward > 0;
        case "has_re_inward":
          return row.counts.re_inward > 0;
        default:
          return true;
      }
    });
  }

  const sort = options.sort ?? "latest_activity";
  list.sort((a, b) => {
    switch (sort) {
      case "oldest_activity": {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return ta - tb;
      }
      case "most_loaded":
        return b.counts.outward - a.counts.outward || b.counts.total - a.counts.total;
      case "most_re_inward":
        return b.counts.re_inward - a.counts.re_inward;
      case "latest_activity":
      default: {
        const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return tb - ta;
      }
    }
  });

  return list;
}

export const ORDER_STATUS_META: Record<
  OrderLoadingStatus,
  { label: string; emoji: string; badgeClass: string; description: string }
> = {
  waiting: {
    label: "Waiting for Loading",
    emoji: "⏳",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    description: "Cartons are inward; outward loading not started or incomplete.",
  },
  fully_loaded: {
    label: "Fully Loaded",
    emoji: "✅",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    description: "Every carton has an outward scan on this console.",
  },
  partially_loaded: {
    label: "Partially Loaded",
    emoji: "⚠",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
    description: "Some cartons are outward and/or re-inward; loading is not complete.",
  },
};

export const CARTON_STATUS_META: Record<
  CartonLoadingStatus,
  { label: string; className: string }
> = {
  pending_inward: { label: "Not inward yet", className: "bg-slate-100 text-slate-600" },
  inward: { label: "Inward", className: "bg-emerald-50 text-emerald-800" },
  outward: { label: "Outward", className: "bg-sky-50 text-sky-800" },
  re_inward: { label: "Re-Inward", className: "bg-amber-50 text-amber-900" },
};
