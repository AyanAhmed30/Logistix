"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAccountingWorkingFileDetail,
  type ReviewWorkingFileDetail,
} from "@/app/actions/accounting/review";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import {
  formatAuditPeriodLabel,
  workingFileStatusLabel,
} from "@/lib/accounting-working-files";
import {
  ReviewAuthorCell,
  REVIEW_TEAL,
  formatReviewDateTime,
} from "@/components/accounting/AccountingReviewOdooPanels";

const CYCLE_CHIP =
  "inline-flex items-center h-7 px-2.5 rounded text-xs font-medium text-white";

export function AccountingWorkingFileDetailView({ fileId }: { fileId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const [file, setFile] = useState<ReviewWorkingFileDetail | null>(null);

  useEffect(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingWorkingFileDetail(fileId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setFile(null);
      } else if ("file" in res && res.file) {
        setFile(res.file);
      } else {
        setFile(null);
      }
      setLoading(false);
    });
  }, [fileId]);

  if (loading) {
    return (
      <div className="p-4">
        <AccountingTableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        Working file not found.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => router.push("/accounting/review/working-files")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Working Files
        </Button>
      </div>

      <div className="px-6 py-5 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {file.return_type === "annual_report"
              ? "Annual Report Working File"
              : "Audit Working File"}
          </p>
          <h1 className="text-xl font-semibold text-slate-800 mt-1">{file.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{file.file_number}</p>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-slate-500">Return Type</dt>
            <dd className="mt-1 capitalize font-medium text-slate-800">
              {file.return_type}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {workingFileStatusLabel(file.status)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Period</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {formatAuditPeriodLabel(file.date_from, file.date_to)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Organization</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {file.organization_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Created By</dt>
            <dd className="mt-1">
              <ReviewAuthorCell name={file.created_by} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Created</dt>
            <dd className="mt-1 font-medium text-slate-800">
              {formatReviewDateTime(file.created_at)}
            </dd>
          </div>
        </dl>

        <div>
          <h2 className="text-sm font-medium text-slate-700 mb-2">Cycles</h2>
          <div className="flex flex-wrap gap-1.5">
            {file.cycles.map((cycle) => (
              <span
                key={cycle}
                className={CYCLE_CHIP}
                style={{ backgroundColor: REVIEW_TEAL }}
              >
                {cycle}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
