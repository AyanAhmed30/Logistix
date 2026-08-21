import { requireAccountingConfigPageAccess } from '@/lib/accounting-page-access';

export default async function AccountingPaymentTermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccountingConfigPageAccess();
  return children;
}
