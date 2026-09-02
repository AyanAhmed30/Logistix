import { getCurrentPortalUser } from "@/lib/local-auth";

export default function WelcomePage() {
  const user = getCurrentPortalUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Portal access
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          Welcome{user ? `, ${user.username}` : ""}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your account was authenticated successfully using the local portal
          credentials.
        </p>
        {user ? (
          <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <div>
              <span className="font-medium">Username:</span> {user.username}
            </div>
            <div>
              <span className="font-medium">Email:</span> {user.email}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
