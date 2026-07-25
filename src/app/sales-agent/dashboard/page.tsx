import { redirect } from 'next/navigation';

/** Legacy Sales dashboard — all users now use the unified admin workspace. */
export default function SalesAgentDashboard() {
  redirect('/admin/dashboard');
}
