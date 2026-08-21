import { Suspense } from "react";
import { AccountingWorkingFilesReviewView } from "@/components/accounting/AccountingWorkingFilesReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewWorkingFilesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={8} cols={9} />
        </div>
      }
    >
      <AccountingWorkingFilesReviewView />
    </Suspense>
  );
}
