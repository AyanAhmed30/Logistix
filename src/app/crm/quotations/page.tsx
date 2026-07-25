import { redirect } from 'next/navigation';

/** Legacy CRM quotations route — Sales module owns quotations now. */
export default function CrmQuotationsPage() {
  redirect('/sales/quotations');
}
