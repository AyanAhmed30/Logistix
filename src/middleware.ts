import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth/session';

type Session = {
    username: string;
    role: 'admin' | 'user' | 'sales_agent' | 'operations';
};

async function getSessionFromRequest(request: NextRequest): Promise<Session | null> {
    const token = request.cookies.get('session')?.value;
    if (!token) return null;

    try {
        return (await decrypt(token)) as Session;
    } catch {
        return null;
    }
}

export async function middleware(request: NextRequest) {
    const session = await getSessionFromRequest(request);
    const { pathname } = request.nextUrl;

    // 1. Allow public access to carton scan/details pages (for QR scanning)
    if (pathname.startsWith('/carton/') || pathname.startsWith('/scan/')) {
        return NextResponse.next();
    }

    // 2. If hitting root, redirect to login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 3. Protect Admin Routes
    if (pathname.startsWith('/admin') && (!session || session.role !== 'admin')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 4. Protect User Routes
    if (pathname.startsWith('/user') && (!session || (session.role !== 'user' && session.role !== 'admin'))) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 5. Protect Sales Agent Routes
    if (pathname.startsWith('/sales-agent') && (!session || session.role !== 'sales_agent')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 6. Protect Operations Routes
    if (pathname.startsWith('/operations') && (!session || session.role !== 'operations')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 7. If logged in and hitting login, redirect to dashboard
    if (pathname === '/login' && session) {
        if (session.role === 'admin') {
            return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        } else if (session.role === 'sales_agent') {
            return NextResponse.redirect(new URL('/sales-agent/dashboard', request.url));
        } else if (session.role === 'operations') {
            return NextResponse.redirect(new URL('/operations/dashboard', request.url));
        } else {
            return NextResponse.redirect(new URL('/user/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
