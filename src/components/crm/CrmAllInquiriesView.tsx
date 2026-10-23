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

function formatActivityAt(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityDotClass(key: string): string {
  switch (key) {
    case "sales_submitted":
      return "bg-amber-500";
    case "ops_submitted":
      return "bg-sky-500";
    case "admin_approved":
      return "bg-emerald-500";
    case "admin_rejected":
      return "bg-rose-500";
    default:
      return "bg-slate-400";
  }
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

  useEffect(() => {
    router.prefetch("/sales/quotations/new");
    rows
      .filter((row) => row.workflow.isReadyForQuotation)
      .slice(0, 8)
      .forEach((row) => {
        router.prefetch(inquiryQuotationHref(row.id));
      });
  }, [rows, router]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.product_name, row.customer_name, row.lead_number, row.inquiry_reference, row.workflow.label, row.quantity]
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
                  <TableHead>Inquiry Ref</TableHead>
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
                    onClick={() =>
                      router.push(
                        row.workflow.isReadyForQuotation
                          ? inquiryQuotationHref(row.id)
                          : inquiryDetailsHref(row.id)
                      )
                    }
                    onMouseEnter={() => {
                      if (row.workflow.isReadyForQuotation) {
                        router.prefetch(inquiryQuotationHref(row.id));
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-primary-dark">
                        <ClipboardList className="h-4 w-4 text-[#017e84] shrink-0" />
                        <span className="truncate">{row.product_name || "Inquiry"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-secondary-muted">
                      {row.inquiry_reference || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">{row.customer_name}</TableCell>
                    <TableCell className="font-mono text-sm text-secondary-muted">
                      {row.lead_number}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-secondary-muted whitespace-nowrap">
                      {formatSentAt(row.sent_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2 min-w-[240px] max-w-[320px] py-1">
                        {row.workflow.isReadyForQuotation ? (
                          <button
                            type="button"
                            className={`inline-flex w-fit items-center rounded-sm border px-2 py-0.5 text-xs font-medium underline-offset-2 hover:underline ${workflowBadgeClass(row.workflow.key)}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(inquiryQuotationHref(row.id));
                            }}
                          >
                            {row.workflow.label}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex w-fit items-center rounded-sm border px-2 py-0.5 text-xs font-medium ${workflowBadgeClass(row.workflow.key)}`}
                          >
                            {row.workflow.label}
                          </span>
                        )}
                        {(row.activity || []).length > 0 ? (
                          <ol className="relative space-y-2 border-l border-slate-200 ml-1.5 pl-3">
                            {(row.activity || []).map((event) => {
                              const when = formatActivityAt(event.at);
                              return (
                                <li
                                  key={`${event.key}-${event.at}`}
                                  className="relative"
                                >
                                  <span
                                    className={`absolute -left-[17px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${activityDotClass(event.key)}`}
                                    aria-hidden
                                  />
                                  <p className="text-[11px] font-medium leading-snug text-primary-dark">
                                    {event.label}
                                    {event.actor ? (
                                      <span className="font-normal text-secondary-muted">
                                        {" "}
                                        · {event.actor}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-[10px] text-slate-500 whitespace-nowrap">
                                    {when}
                                  </p>
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p className="text-[11px] text-secondary-muted">
                            No activity logged yet
                          </p>
                        )}
                      </div>
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
