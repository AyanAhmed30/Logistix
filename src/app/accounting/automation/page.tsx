import { Suspense } from 'react';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { AccountingAutomationView } from '@/components/accounting/AccountingAutomationView';

export default function AccountingAutomationPage() {
  return (
    <Suspense fallback={<AccountingFormSkeleton />}>
      <AccountingAutomationView />
    </Suspense>
  );
}
