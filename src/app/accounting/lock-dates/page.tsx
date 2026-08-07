import { redirect } from 'next/navigation';

/** Legacy path — Lock Dates now lives under Configuration. */
export default function AccountingLockDatesRedirectPage() {
  redirect('/accounting/configuration/lock-dates');
}
