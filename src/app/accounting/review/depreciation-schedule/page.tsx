import { Suspense } from "react";
import { AccountingDepreciationScheduleReviewView } from "@/components/accounting/AccountingDepreciationScheduleReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewDepreciationSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={8} />
        </div>
      }
    >
      <AccountingDepreciationScheduleReviewView />
    </Suspense>
  );
}
