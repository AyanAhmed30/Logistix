type Props = {
  title: string;
};

export function HRPlaceholder({ title }: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 text-base text-slate-600">
        This module will be implemented next.
      </p>
    </div>
  );
}
