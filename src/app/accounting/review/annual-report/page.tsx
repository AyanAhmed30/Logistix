import { Suspense } from "react";
import { requireAccountingReportsPageAccess } from "@/lib/accounting-page-access";
import { AccountingAnnualReportReviewView } from "@/components/accounting/AccountingAnnualReportReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default async function AccountingReviewAnnualReportPage() {
  await requireAccountingReportsPageAccess();
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={4} />
        </div>
      }
    >
      <AccountingAnnualReportReviewView />
    </Suspense>
  );
}
