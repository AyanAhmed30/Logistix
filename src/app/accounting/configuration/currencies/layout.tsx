import { requireAccountingConfigPageAccess } from '@/lib/accounting-page-access';

export default async function AccountingCurrenciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAccountingConfigPageAccess();
  return children;
}
