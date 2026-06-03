import { formatLoadingDateTime } from "@/lib/loading-instruction-progress";
import type { CartonScanTimelineEvent } from "@/lib/loading-instruction-progress";

const EVENT_STYLES: Record<CartonScanTimelineEvent["type"], string> = {
  inward: "border-emerald-300 bg-emerald-50 text-emerald-900",
  outward: "border-sky-300 bg-sky-50 text-sky-900",
  re_inward: "border-amber-300 bg-amber-50 text-amber-900",
};

type Props = {
  cartonNo: string;
  timeline: CartonScanTimelineEvent[];
  compact?: boolean;
};

export function CartonMovementTimeline({ cartonNo, timeline, compact }: Props) {
  if (!timeline.length) {
    return (
      <p className="text-xs text-secondary-muted">No scans recorded yet for {cartonNo}.</p>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-xs font-semibold text-primary-dark">Carton {cartonNo}</p>
      <div className="flex flex-col gap-0">
        {timeline.map((ev, i) => (
          <div key={`${ev.type}-${ev.scanned_at}`} className="flex gap-2">
            <div className="flex flex-col items-center w-4 shrink-0">
              <div
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  ev.type === "inward"
                    ? "border-emerald-500 bg-emerald-500"
                    : ev.type === "outward"
                      ? "border-sky-500 bg-sky-500"
                      : "border-amber-500 bg-amber-500"
                }`}
              />
              {i < timeline.length - 1 ? (
                <div className="w-0.5 flex-1 min-h-[20px] bg-slate-300 my-0.5" />
              ) : null}
            </div>
            <div className={`rounded-md border px-2 py-1.5 mb-2 flex-1 ${EVENT_STYLES[ev.type]}`}>
              <p className="text-xs font-semibold">{ev.label}</p>
              <p className="text-[11px] opacity-90">{formatLoadingDateTime(ev.scanned_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
