import { Suspense } from "react";
import { AccountingReviewHubView } from "@/components/accounting/AccountingReviewHubView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={4} cols={3} />
        </div>
      }
    >
      <AccountingReviewHubView />
    </Suspense>
  );
}
