import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { SalesAgentDashboardShell } from '@/components/sales-agent/SalesAgentDashboardShell';

export default async function SalesAgentDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'sales_agent') {
        redirect('/login');
    }

    return <SalesAgentDashboardShell username={session.username} />;
}
