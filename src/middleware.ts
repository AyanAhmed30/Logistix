import { NextRequest, NextResponse } from 'next/server';
import { parseSessionToken, type SessionPayload } from '@/lib/auth/session';

type Session = Pick<SessionPayload, 'username' | 'role'>;

type RequestSessionState = {
    session: Session | null;
    hadInvalidToken: boolean;
};

async function getSessionFromRequest(request: NextRequest): Promise<RequestSessionState> {
    const token = request.cookies.get('session')?.value;
    if (!token) return { session: null, hadInvalidToken: false };

    const payload = await parseSessionToken(token);
    if (!payload) return { session: null, hadInvalidToken: true };

    return {
        session: { username: payload.username, role: payload.role },
        hadInvalidToken: false,
    };
}

function redirectToLogin(request: NextRequest) {
    return NextResponse.redirect(new URL('/login', request.url));
}

function redirectToSessionExpired(request: NextRequest) {
    return NextResponse.redirect(new URL('/session-expired', request.url));
}

export async function middleware(request: NextRequest) {
    const { session, hadInvalidToken } = await getSessionFromRequest(request);
    const { pathname } = request.nextUrl;

    // 1. Allow public access to carton scan/details pages (for QR scanning)
    if (pathname.startsWith('/carton/') || pathname.startsWith('/scan/')) {
        return NextResponse.next();
    }

    // 2. Dedicated session-expired page (no auth required)
    if (pathname === '/session-expired') {
        return NextResponse.next();
    }

    // 3. If hitting root, redirect to login
    if (pathname === '/') {
        return redirectToLogin(request);
    }

    const requiresAuth =
        pathname.startsWith('/admin') ||
        pathname.startsWith('/user') ||
        pathname.startsWith('/sales-agent') ||
        pathname.startsWith('/operations');

    if (requiresAuth && !session) {
        return hadInvalidToken
            ? redirectToSessionExpired(request)
            : redirectToLogin(request);
    }

    // 4. Protect Admin Routes
    if (pathname.startsWith('/admin') && (!session || session.role !== 'admin')) {
        return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }

    // 5. Protect User Routes
    if (pathname.startsWith('/user') && (!session || (session.role !== 'user' && session.role !== 'admin'))) {
        return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }

    // 6. Protect Sales Agent Routes
    if (pathname.startsWith('/sales-agent') && (!session || session.role !== 'sales_agent')) {
        return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }

    // 7. Protect Operations Routes
    if (pathname.startsWith('/operations') && (!session || session.role !== 'operations')) {
        return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }

    // 8. If logged in and hitting login, redirect to dashboard
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
