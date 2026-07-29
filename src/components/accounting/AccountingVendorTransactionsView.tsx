"use client";

import { AccountingVendorLedgerView } from "@/components/accounting/AccountingVendorLedgerView";

/** Transactions reuse ledger entries for this vendor. */
export function AccountingVendorTransactionsView({
  contactId,
}: {
  contactId: string;
}) {
  return <AccountingVendorLedgerView contactId={contactId} />;
}
