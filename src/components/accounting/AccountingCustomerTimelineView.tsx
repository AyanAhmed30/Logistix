"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getCustomerAccountingTimeline,
  type CustomerTimelineEvent,
} from "@/app/actions/accounting/customer-accounting";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

type Props = { contactId: string };

export function AccountingCustomerTimelineView({ contactId }: Props) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [events, setEvents] = useState<CustomerTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getCustomerAccountingTimeline(contactId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setEvents([]);
      } else {
        setEvents(res.events ?? []);
      }
      setLoading(false);
    });
  }, [contactId]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  return (
    <div className="space-y-3">
      <div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm mb-2"
          onClick={() => router.push(`/accounting/customers/${contactId}`)}
        >
          Back to Customer
        </Button>
        <h2 className="text-lg font-semibold text-primary-dark">Customer Timeline</h2>
        <p className="text-sm text-secondary-muted">
          Chronological business events for this customer
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm p-4">
        {loading || isPending ? (
          <div className="text-sm text-secondary-muted">Loading timeline…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-secondary-muted">No timeline events yet.</div>
        ) : (
          <ol className="relative border-l border-slate-200 ml-2 space-y-4">
            {events.map((e) => {
              const d = e.at ? new Date(e.at) : null;
              return (
                <li key={e.id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-[#017e84]" />
                  <p className="text-sm font-semibold text-primary-dark">{e.label}</p>
                  <p className="text-xs text-secondary-muted mt-0.5">
                    {d && !Number.isNaN(d.getTime())
                      ? d.toLocaleString()
                      : e.at || "—"}
                    {e.user ? ` · ${e.user}` : ""}
                    {e.organization ? ` · ${e.organization}` : ""}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
