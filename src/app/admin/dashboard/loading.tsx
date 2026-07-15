export default function AdminDashboardLoading() {
  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b bg-white">
        <div className="flex h-full items-center justify-between px-6 md:px-8">
          <div className="h-9 w-36 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-28 animate-pulse rounded bg-slate-200" />
        </div>
      </header>
      <main className="px-6 pt-24 md:px-10">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </main>
    </div>
  );
}
