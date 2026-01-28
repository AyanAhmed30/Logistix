import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/server';
import { AdminDashboardShell } from '@/components/admin/AdminDashboardShell';

export default async function AdminDashboard() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/login');
    }

    const supabase = await createAdminClient();
    const { data: users, error: dbError } = await supabase
        .from('app_users')
        .select('id, username, password, created_at')
        .order('created_at', { ascending: false });

    return (
        <AdminDashboardShell users={users ?? []} dbError={dbError?.message} />
    );
}
