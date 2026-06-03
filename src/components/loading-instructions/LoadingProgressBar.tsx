type Props = {
  loaded: number;
  total: number;
  className?: string;
};

export function LoadingProgressBar({ loaded, total, className = "" }: Props) {
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
  return (
    <div className={`space-y-1 min-w-[120px] ${className}`}>
      <div className="flex justify-between text-xs text-secondary-muted gap-2">
        <span>
          {loaded} / {total} loaded
        </span>
        <span className="font-medium text-primary-dark">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-sky-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
