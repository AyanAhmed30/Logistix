'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export async function createUser(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        throw new Error('Unauthorized');
    }

    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    if (!username?.trim() || !password?.trim()) {
        return { error: 'Username and password are required' };
    }

    const supabase = await createAdminClient();

    const { error } = await supabase
        .from('app_users')
        .insert([{ username, password, role: 'user' }]);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
}

export async function updateUser(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        throw new Error('Unauthorized');
    }

    const id = formData.get('id') as string;
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    if (!id || !username?.trim() || !password?.trim()) {
        return { error: 'User id, username, and password are required' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
        .from('app_users')
        .update({ username, password })
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
}

export async function deleteUser(formData: FormData) {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        throw new Error('Unauthorized');
    }

    const id = formData.get('id') as string;
    if (!id) {
        return { error: 'User id is required' };
    }

    const supabase = await createAdminClient();
    const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/admin/dashboard');
    return { success: true };
}
