import { Suspense } from "react";
import { requireAccountingReportsPageAccess } from "@/lib/accounting-page-access";
import { AccountingStatementReportsView } from "@/components/accounting/AccountingStatementReportsView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

/**
 * Accounting → Reporting (Phase 1 Statement Reports).
 * Legacy invoice-analytics Reporting UI has been replaced.
 */
export default async function AccountingReportsPage() {
  await requireAccountingReportsPageAccess();
  return (
    <Suspense fallback={<AccountingTableSkeleton rows={8} cols={2} />}>
      <AccountingStatementReportsView />
    </Suspense>
  );
}
