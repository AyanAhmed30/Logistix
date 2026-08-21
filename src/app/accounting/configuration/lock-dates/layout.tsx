import { requireAccountingPageAccess } from '@/lib/accounting-page-access';

export default async function AccountingLockDatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccountingPageAccess({ lockDates: true });
  return children;
}
