'use strict';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY || 'default_secret_key_for_development', 'utf-8');

type SessionPayload = {
    username: string;
    role: 'admin' | 'user';
    expires?: Date;
};

export async function encrypt(payload: SessionPayload): Promise<string> {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(SECRET_KEY);
}

export async function decrypt(input: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(input, SECRET_KEY, {
        algorithms: ['HS256'],
    });
    return payload as SessionPayload;
}

export async function getSession() {
    const session = (await cookies()).get('session')?.value;
    if (!session) return null;
    return await decrypt(session);
}
