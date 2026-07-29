"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getVendorAccountingTimeline,
  type VendorTimelineEvent,
} from "@/app/actions/accounting/vendor-accounting";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { contactId: string };

export function AccountingVendorTimelineView({ contactId }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<VendorTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getVendorAccountingTimeline(contactId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) toast.error(res.error);
      else setEvents(res.events ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-sm"
        onClick={() => router.push(`/accounting/vendors/${contactId}`)}
      >
        Back to Vendor
      </Button>
      {loading ? (
        <AccountingTableSkeleton rows={6} cols={3} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-3">
          {events.length === 0 ? (
            <p className="text-sm text-secondary-muted">No timeline events.</p>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                className="border-l-2 border-[#017e84]/40 pl-3 text-sm"
              >
                <p className="font-medium capitalize">{e.label}</p>
                <p className="text-[11px] text-secondary-muted">
                  {e.user || "System"} · {new Date(e.at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
