import { Suspense } from "react";
import { requireAccountingReportsPageAccess } from "@/lib/accounting-page-access";
import { AccountingJournalAuditView } from "@/components/accounting/AccountingJournalAuditView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default async function AccountingReviewJournalAuditPage() {
  await requireAccountingReportsPageAccess();
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={8} />
        </div>
      }
    >
      <AccountingJournalAuditView />
    </Suspense>
  );
}
