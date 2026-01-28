import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { UserDashboardShell } from '@/components/user/UserDashboardShell';

export default async function UserDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'user') {
        redirect('/login');
    }

    return <UserDashboardShell username={session.username} />;
}
