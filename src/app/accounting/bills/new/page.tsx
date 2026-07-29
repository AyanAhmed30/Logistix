'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createManualAccountingBill } from '@/app/actions/accounting/bills';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';

export default function AccountingNewBillPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void createManualAccountingBill().then((res) => {
      if (cancelled) return;
      if ('error' in res && res.error) {
        toast.error(res.error);
        router.replace('/accounting/bills');
        return;
      }
      if (res.billId) router.replace(`/accounting/bills/${res.billId}`);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <AccountingFormSkeleton />;
}
