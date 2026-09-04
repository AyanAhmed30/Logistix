"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClipboardList } from "lucide-react";
import {
  getSalesAllInquiries,
  type SalesAllInquiryListItem,
} from "@/app/actions/crm/all-inquiries";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useCrmShell } from "@/components/crm/CrmShell";
import { CrmEmptyState, CrmPageSkeleton } from "@/components/crm/CrmSkeleton";
import {
  inquiryDetailsHref,
  inquiryQuotationHref,
  type InquiryWorkflowStatusKey,
} from "@/lib/inquiry-workflow";

function workflowBadgeClass(key: InquiryWorkflowStatusKey): string {
  switch (key) {
    case "ready_for_quotation":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "send_to_admin":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "send_to_operation":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function formatSentAt(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CrmAllInquiriesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery } = useCrmShell();
  const [rows, setRows] = useState<SalesAllInquiryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSalesAllInquiries().then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setRows([]);
      } else if ("inquiries" in res) {
        setRows(res.inquiries ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [switchVersion]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.product_name, row.customer_name, row.lead_number, row.workflow.label, row.quantity]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-secondary-muted">
          {filtered.length} inquir{filtered.length === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <CrmPageSkeleton rows={6} />
          </div>
        ) : filtered.length === 0 ? (
          <CrmEmptyState
            title="No submitted inquiries"
            description="Inquiries sent to Operations appear here. Status updates automatically as Operations and Admin complete the workflow."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Inquiry</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Lead Number</TableHead>
                  <TableHead className="hidden sm:table-cell">Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-[#017e84]/5"
                    onClick={() => router.push(inquiryDetailsHref(row.id))}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-primary-dark">
                        <ClipboardList className="h-4 w-4 text-[#017e84] shrink-0" />
                        <span className="truncate">{row.product_name || "Inquiry"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-secondary-muted">{row.customer_name}</TableCell>
                    <TableCell className="font-mono text-sm text-secondary-muted">
                      {row.lead_number}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-secondary-muted whitespace-nowrap">
                      {formatSentAt(row.sent_at)}
                    </TableCell>
                    <TableCell>
                      {row.workflow.isReadyForQuotation ? (
                        <button
                          type="button"
                          className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${workflowBadgeClass(row.workflow.key)}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(inquiryQuotationHref(row.id));
                          }}
                        >
                          {row.workflow.label}
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${workflowBadgeClass(row.workflow.key)}`}
                        >
                          {row.workflow.label}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
