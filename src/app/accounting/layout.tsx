import { getAdminOrganizationState } from '@/app/actions/organization-context';
import { requireAccountingPageAccess } from '@/lib/accounting-page-access';
import { AccountingLayoutClient } from '@/components/accounting/AccountingLayoutClient';

export default async function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await requireAccountingPageAccess();
  const organizationState = await getAdminOrganizationState();

  return (
    <AccountingLayoutClient
      access={access}
      initialOrganizationState={organizationState}
    >
      {children}
    </AccountingLayoutClient>
  );
}
