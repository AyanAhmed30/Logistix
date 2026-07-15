export default function OperationsDashboardLoading() {
  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b bg-white">
        <div className="flex h-full items-center justify-between px-6 md:px-8">
          <div className="h-9 w-36 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-28 animate-pulse rounded bg-slate-200" />
        </div>
      </header>
      <main className="pt-20 md:pl-64">
        <section className="px-6 pb-10 md:px-10">
          <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 h-64 animate-pulse rounded-xl border bg-slate-50" />
        </section>
      </main>
    </div>
  );
}
