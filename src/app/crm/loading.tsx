export default function CrmLoading() {
  return (
    <div className="min-h-[50vh] px-6 py-8 md:px-10">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
