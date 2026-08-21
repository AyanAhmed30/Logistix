import { NextRequest, NextResponse } from 'next/server';
import { parseSessionToken, type SessionPayload } from '@/lib/auth/session';
import { canAccessAdminDashboard, isPortalAccountSession } from '@/lib/auth/portal-access';

type RequestSessionState = {
  session: SessionPayload | null;
  hadInvalidToken: boolean;
};

async function getSessionFromRequest(request: NextRequest): Promise<RequestSessionState> {
  const token = request.cookies.get('session')?.value;
  if (!token) return { session: null, hadInvalidToken: false };

  const payload = await parseSessionToken(token);
  if (!payload) return { session: null, hadInvalidToken: true };

  return { session: payload, hadInvalidToken: false };
}

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url));
}

function redirectToSessionExpired(request: NextRequest) {
  return NextResponse.redirect(new URL('/session-expired', request.url));
}

function redirectAccessDenied(request: NextRequest) {
  return NextResponse.redirect(new URL('/access-denied', request.url));
}

function dashboardForRole(session: SessionPayload) {
  if (isPortalAccountSession(session)) return '/admin/dashboard';
  switch (session.role) {
    case 'admin':
      return '/admin/dashboard';
    case 'organization':
      return '/organization/dashboard';
    case 'sales_agent':
    case 'operations':
      return '/admin/dashboard';
    default:
      return '/admin/dashboard';
  }
}

export async function middleware(request: NextRequest) {
  const { session, hadInvalidToken } = await getSessionFromRequest(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/carton/') || pathname.startsWith('/scan/')) {
    return NextResponse.next();
  }

  if (pathname === '/session-expired' || pathname === '/access-denied') {
    return NextResponse.next();
  }

  if (pathname === '/') {
    return redirectToLogin(request);
  }

  const requiresAuth =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/crm') ||
    pathname.startsWith('/sales') ||
    pathname.startsWith('/hr') ||
    pathname.startsWith('/user') ||
    pathname.startsWith('/sales-agent') ||
    pathname.startsWith('/operations') ||
    pathname.startsWith('/organization');

  if (requiresAuth && !session) {
    return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
  }

  // Admin dashboard — Super Admin and portal accounts
  if (pathname.startsWith('/admin')) {
    if (!session || !canAccessAdminDashboard(session)) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  // CRM module — Super Admin and portal accounts with CRM access
  if (pathname.startsWith('/crm')) {
    if (!session || !canAccessAdminDashboard(session)) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  // Sales module — Super Admin and portal accounts with Sales access
  if (pathname.startsWith('/sales') && !pathname.startsWith('/sales-agent')) {
    if (!session || !canAccessAdminDashboard(session)) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  // HR module — Super Admin / portal accounts (page-level permission checks apply)
  if (pathname.startsWith('/hr')) {
    if (!session || !canAccessAdminDashboard(session)) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  // Legacy portal route — redirect portal accounts to unified admin dashboard
  if (pathname.startsWith('/user')) {
    if (!session) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }
    if (isPortalAccountSession(session)) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    if (session.role !== 'user' && session.role !== 'admin') {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  // Legacy Sales / Operations dashboards — redirect to unified admin dashboard
  if (pathname.startsWith('/sales-agent') || pathname.startsWith('/operations')) {
    if (!session) {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectToLogin(request);
    }
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }

  // Organization portal
  if (pathname.startsWith('/organization')) {
    if (!session || session.role !== 'organization') {
      return hadInvalidToken ? redirectToSessionExpired(request) : redirectAccessDenied(request);
    }
  }

  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL(dashboardForRole(session), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
