import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { SalesAgentDashboardShell } from '@/components/sales-agent/SalesAgentDashboardShell';
import { getSalesAgentByUsername } from '@/app/actions/sales_agents';

export default async function SalesAgentDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'sales_agent') {
        redirect('/login');
    }

    // Fetch sales agent permissions
    let permissions: string[] = [];
    try {
        const result = await getSalesAgentByUsername(session.username);
        if (result && 'salesAgent' in result && result.salesAgent) {
            permissions = Array.isArray(result.salesAgent.permissions) 
                ? result.salesAgent.permissions 
                : [];
        }
    } catch (error) {
        // If there's an error fetching permissions, use empty array
        permissions = [];
    }

    return <SalesAgentDashboardShell username={session.username} permissions={permissions} />;
}
