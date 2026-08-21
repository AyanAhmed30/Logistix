"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAccountingWorkingFilesForReview,
  type ReviewWorkingFileItem,
} from "@/app/actions/accounting/review";
import { AccountingStartAuditDialog } from "@/components/accounting/AccountingStartAuditDialog";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { workingFileStatusLabel } from "@/lib/accounting-working-files";
import {
  REVIEW_TEAL,
  ReviewAuthorCell,
  ReviewEmptyState,
  ReviewListToolbar,
  ReviewPagination,
  formatReviewDate,
  formatReviewDateTime,
} from "@/components/accounting/AccountingReviewOdooPanels";

const PAGE_SIZE = 40;

function statusBadgeClass(status: string) {
  switch (status) {
    case "ongoing":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "paused":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "done":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function statusLabel(status: string) {
  return workingFileStatusLabel(status);
}

export function AccountingWorkingFilesReviewView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 280);
  const [statusFilter, setStatusFilter] = useState("ongoing");
  const [documentType, setDocumentType] = useState("all");
  const [files, setFiles] = useState<ReviewWorkingFileItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [, startTransition] = useTransition();

  const filterPills = useMemo(() => {
    if (statusFilter === "ongoing") {
      return [{ id: "ongoing", label: "Ongoing or Paused" }];
    }
    return [];
  }, [statusFilter]);

  const load = useCallback(() => {
    if (isAdminContext) {
      setFiles([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingWorkingFilesForReview({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter,
        documentType: documentType as "all" | "audit" | "annual_report" | "tax_return",
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setFiles([]);
        setTotal(0);
      } else {
        setFiles(res.files ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, statusFilter, documentType, isAdminContext, switchVersion]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, documentType, switchVersion]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreated(fileId: string) {
    load();
    router.push(`/accounting/review/working-files/${fileId}`);
  }

  function openFile(file: ReviewWorkingFileItem) {
    router.push(file.related_record_href);
  }

  return (
    <>
      <AccountingStartAuditDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        onCreated={handleCreated}
      />

      <div className="-mx-1 sm:-mx-2 flex flex-col min-h-[calc(100vh-8rem)] bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
          <Button
            type="button"
            size="sm"
            disabled={isAdminContext}
            onClick={() => setAuditDialogOpen(true)}
            className="h-8 rounded-md px-3 font-medium text-white"
            style={{ backgroundColor: REVIEW_TEAL }}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New
          </Button>
          <span className="text-base font-semibold text-slate-800">Working Files</span>
        </div>

      <ReviewListToolbar
        title=""
        search={search}
        onSearchChange={setSearch}
        filterPills={filterPills}
        onRemoveFilter={() => setStatusFilter("all")}
        extraFilters={
          <>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Document type"
            >
              <option value="all">All Types</option>
              <option value="audit">Audit</option>
              <option value="annual_report">Annual Report</option>
              <option value="tax_return">Tax Return</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 text-xs border border-slate-200 rounded px-1.5 bg-white text-slate-700"
              aria-label="Status filter"
            >
            <option value="ongoing">Ongoing or Paused</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
          </>
        }
        pagination={
          <ReviewPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        }
      />

      <div className="flex-1 overflow-auto">
        {loading ? (
          <AccountingTableSkeleton rows={6} cols={8} />
        ) : files.length === 0 ? (
          <ReviewEmptyState
            title="No tax return to do!"
            subtitle="Time to relax 🌴"
          />
        ) : (
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead className="sticky top-0 z-[1] bg-slate-50 border-b border-slate-200">
              <tr className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                <th className="px-3 py-2">File Name</th>
                <th className="px-3 py-2">Document Type</th>
                <th className="px-3 py-2">Related Record</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Uploaded By</th>
                <th className="px-3 py-2">Upload Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.id}
                  onClick={() => openFile(file)}
                  className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
                >
                  <td className="px-3 py-2 text-sm font-medium text-slate-800">
                    {file.file_name}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {file.document_type}
                  </td>
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    <span
                      className="font-medium hover:underline"
                      style={{ color: REVIEW_TEAL }}
                    >
                      {file.related_record_label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {file.related_module}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
                    {formatReviewDate(file.period_from)} –{" "}
                    {formatReviewDate(file.period_to)}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {file.organization_name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ReviewAuthorCell name={file.uploaded_by} />
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600 whitespace-nowrap">
                    {formatReviewDateTime(file.uploaded_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded border ${statusBadgeClass(file.status)}`}
                    >
                      {statusLabel(file.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </>
  );
}
