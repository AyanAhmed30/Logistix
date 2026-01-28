import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
    const session = await getSession();
    const { pathname } = request.nextUrl;

    // 1. If hitting root, redirect to login
    if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 2. Protect Admin Routes
    if (pathname.startsWith('/admin') && (!session || session.role !== 'admin')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 3. Protect User Routes
    if (pathname.startsWith('/user') && (!session || (session.role !== 'user' && session.role !== 'admin'))) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // 4. If logged in and hitting login, redirect to dashboard
    if (pathname === '/login' && session) {
        if (session.role === 'admin') {
            return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        } else {
            return NextResponse.redirect(new URL('/user/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
