import { Suspense } from "react";
import { requireAccountingReportsPageAccess } from "@/lib/accounting-page-access";
import { AccountingAuditTrailView } from "@/components/accounting/AccountingAuditTrailView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default async function AccountingReviewAuditTrailPage() {
  await requireAccountingReportsPageAccess();
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={9} />
        </div>
      }
    >
      <AccountingAuditTrailView />
    </Suspense>
  );
}
