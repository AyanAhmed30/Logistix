import { Suspense } from "react";
import { AccountingInvoicesToBeIssuedReviewView } from "@/components/accounting/AccountingInvoicesToBeIssuedReviewView";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

export default function AccountingReviewInvoicesToBeIssuedPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4">
          <AccountingTableSkeleton rows={10} cols={11} />
        </div>
      }
    >
      <AccountingInvoicesToBeIssuedReviewView />
    </Suspense>
  );
}
