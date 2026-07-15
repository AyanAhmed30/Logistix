export default function SalesAgentDashboardLoading() {
  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b bg-white">
        <div className="flex h-full items-center justify-between px-4 md:px-8">
          <div className="h-9 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
      </header>
      <main className="px-4 pt-24 md:px-8">
        <div className="h-10 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
          <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
          <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />
        </div>
      </main>
    </div>
  );
}
