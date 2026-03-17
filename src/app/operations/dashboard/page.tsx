import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { OperationsDashboardShell } from '@/components/operations/OperationsDashboardShell';

export default async function OperationsDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'operations') {
        redirect('/login');
    }

    return <OperationsDashboardShell username={session.username} />;
}
