import { redirect } from 'next/navigation';

/** Legacy Operations dashboard — all users now use the unified admin workspace. */
export default function OperationsDashboard() {
  redirect('/admin/dashboard');
}
