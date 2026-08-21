import { Suspense } from "react";
import { AccountingLoansAnalysisReviewView } from "@/components/accounting/AccountingLoansAnalysisReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewLoansAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={12} />
        </div>
      }
    >
      <AccountingLoansAnalysisReviewView />
    </Suspense>
  );
}
