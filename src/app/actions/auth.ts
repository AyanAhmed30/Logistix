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
        const username = formData.get('username') as string;
        const password = formData.get('password') as string;

        if (!username?.trim() || !password?.trim()) {
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

        // 2. Check Database Users
        const supabase = await createAdminClient();
        const { data: user, error } = await supabase
            .from('app_users')
            .select('username, password, role')
            .eq('username', username)
            .eq('password', password) // Simple verification for demo
            .maybeSingle();

        if (error) {
            return { error: error.message };
        }

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
