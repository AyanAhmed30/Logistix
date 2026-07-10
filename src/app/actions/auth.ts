'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { createAdminClient } from '@/utils/supabase/server';
import { encrypt, getSessionCookieOptions } from '@/lib/auth/session';
import { authenticateOrganization } from '@/app/actions/organizations';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

export async function login(formData: FormData) {
    try {
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '').trim();

        if (!username || !password) {
            return { error: 'Username and password are required' };
        }

        const cookieOptions = getSessionCookieOptions();
        const sessionBase = { lastActivity: Date.now() };

        // 1. Check Admin Credentials
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            const session = await encrypt({ username, role: 'admin', ...sessionBase });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/admin/dashboard');
        }

        // 2. Check DB-backed users in parallel to reduce login latency.
        const supabase = await createAdminClient();
        const [salesAgentResult, opsUserResult, appUserResult, organizationAuth] = await Promise.all([
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
            authenticateOrganization(username, password),
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
            const session = await encrypt({ username: salesAgent.username, role: 'sales_agent', ...sessionBase });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/sales-agent/dashboard');
        }

        const opsUser = opsUserResult.data;
        if (opsUser) {
            const session = await encrypt({ username: opsUser.username, role: 'operations', ...sessionBase });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/operations/dashboard');
        }

        if (organizationAuth && 'inactive' in organizationAuth) {
            return { error: 'This organization account is inactive. Please contact the administrator.' };
        }

        if (organizationAuth && 'username' in organizationAuth) {
            const session = await encrypt({
                username: organizationAuth.username,
                role: 'organization',
                organizationName: organizationAuth.organizationName,
                ...sessionBase,
            });
            (await cookies()).set('session', session, cookieOptions);
            redirect('/organization/dashboard');
        }

        const user = appUserResult.data;
        if (user) {
            const session = await encrypt({ username: user.username, role: 'user', ...sessionBase });
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
