'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createManualAccountingBill } from '@/app/actions/accounting/bills';
import { AccountingFormSkeleton } from '@/components/accounting/AccountingSkeleton';
import { useAdminOrganization } from '@/contexts/AdminOrganizationContext';

export default function AccountingNewBillPage() {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      if (isAdminContext) {
        toast.info('Select a specific organization to create bills.');
        router.replace('/accounting/bills');
        return;
      }
      const res = await createManualAccountingBill();
      if ('error' in res && res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      if (res.billId) router.replace(`/accounting/bills/${res.billId}`);
    })();
  }, [isAdminContext, router]);

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          className="text-sm text-[#017e84] hover:underline"
          onClick={() => router.push('/accounting/bills')}
        >
          Back to Bills
        </button>
      </div>
    );
  }

  return <AccountingFormSkeleton />;
}
