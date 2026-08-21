import React from "react";

type Props = {
  title: string;
  count: number;
  icon?: React.ReactNode;
};

export default function SummaryCard({ title, count, icon }: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{title}</div>
        {icon ? <div className="text-slate-700">{icon}</div> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{count}</div>
    </div>
  );
}
