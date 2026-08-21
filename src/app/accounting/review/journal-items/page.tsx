import { Suspense } from "react";
import { AccountingJournalItemsReviewView } from "@/components/accounting/AccountingJournalItemsReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewJournalItemsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={10} />
        </div>
      }
    >
      <AccountingJournalItemsReviewView />
    </Suspense>
  );
}
