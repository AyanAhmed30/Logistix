import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { SalesAgentDashboardShell } from '@/components/sales-agent/SalesAgentDashboardShell';

export default async function SalesAgentDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'sales_agent') {
        redirect('/login');
    }

    // Permissions are stored in the session at login so the shell can paint immediately
    // without an extra database round-trip on every dashboard load.
    const permissions = Array.isArray(session.permissions) ? session.permissions : [];

    return (
        <SalesAgentDashboardShell
            username={session.username}
            permissions={permissions}
        />
    );
}
