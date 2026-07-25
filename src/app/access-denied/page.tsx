import Link from 'next/link';
import { getSession } from '@/lib/auth/session';

export default async function AccessDeniedPage() {
  const session = await getSession();

  let homeHref = '/login';
  if (session?.appUserId || session?.role === 'user') homeHref = '/admin/dashboard';
  else if (session?.role === 'admin') homeHref = '/admin/dashboard';
  else if (session?.role === 'sales_agent' || session?.role === 'operations') {
    homeHref = '/login';
  }
  else if (session?.role === 'organization') homeHref = '/organization/dashboard';

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-rose-500">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Access Denied</h1>
        <p className="mt-3 text-sm text-slate-600">
          You do not have permission to view this page or module. Contact your administrator if you
          believe this is an error.
        </p>
        <Link
          href={homeHref}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Go back
        </Link>
      </div>
    </main>
  );
}
