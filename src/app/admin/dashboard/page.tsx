import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AdminDashboardShell } from '@/components/admin/AdminDashboardShell';

export default async function AdminDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    // Paint the shell immediately; app users load client-side so login → admin
    // feels instant instead of waiting on the users table query.
    return <AdminDashboardShell />;
}
