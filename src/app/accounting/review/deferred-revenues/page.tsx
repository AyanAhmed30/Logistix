import { Suspense } from "react";
import { AccountingDeferredReportReviewView } from "@/components/accounting/AccountingDeferredReportReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewDeferredRevenuesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={8} cols={6} />
        </div>
      }
    >
      <AccountingDeferredReportReviewView kind="deferred_revenue" />
    </Suspense>
  );
}
