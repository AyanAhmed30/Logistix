import { Suspense } from "react";
import { AccountingInvoicedNotDeliveredReviewView } from "@/components/accounting/AccountingInvoicedNotDeliveredReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewInvoicedNotDeliveredPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={9} />
        </div>
      }
    >
      <AccountingInvoicedNotDeliveredReviewView />
    </Suspense>
  );
}
