'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { createAdminClient } from '@/utils/supabase/server';
import { encrypt } from '@/lib/auth/session';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

export async function login(formData: FormData) {
    try {
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '').trim();

        if (!username || !password) {
            return { error: 'Username and password are required' };
        }

        const cookieOptions = {
            expires: new Date(Date.now() + 2 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        };

        // 1. Check Admin Credentials
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const session = await encrypt({ username, role: 'admin', expires: cookieOptions.expires });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/admin/dashboard');
        }

        // 2. Check DB-backed users in parallel to reduce login latency.
        const supabase = await createAdminClient();
        const [salesAgentResult, opsUserResult, appUserResult] = await Promise.all([
            supabase
                .from('sales_agents')
                .select('username')
                .eq('username', username)
                .eq('password', password)
                .maybeSingle(),
            supabase
                .from('operations_users')
                .select('username')
                .eq('username', username)
                .eq('password', password)
                .maybeSingle(),
            supabase
                .from('app_users')
                .select('username, role')
                .eq('username', username)
                .eq('password', password)
                .maybeSingle(),
        ]);

        if (salesAgentResult.error) {
            return { error: salesAgentResult.error.message };
        }
        if (opsUserResult.error && !opsUserResult.error.message.includes('does not exist') && !opsUserResult.error.message.includes('relation')) {
            return { error: opsUserResult.error.message };
        }
        if (appUserResult.error) {
            return { error: appUserResult.error.message };
        }

        const salesAgent = salesAgentResult.data;
        if (salesAgent) {
            const session = await encrypt({ username: salesAgent.username, role: 'sales_agent', expires: cookieOptions.expires });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/sales-agent/dashboard');
        }

        const opsUser = opsUserResult.data;
        if (opsUser) {
            const session = await encrypt({ username: opsUser.username, role: 'operations', expires: cookieOptions.expires });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/operations/dashboard');
        }

        const user = appUserResult.data;
        if (user) {
            const session = await encrypt({ username: user.username, role: 'user', expires: cookieOptions.expires });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/user/dashboard');
        }

        return { error: 'Invalid username or password' };
    } catch (error) {
        if (isRedirectError(error)) {
            throw error;
        }
        return { error: 'Login failed. Please try again.' };
    }
}

export async function logout() {
    (await cookies()).set('session', '', { expires: new Date(0) });
    redirect('/login');
}
