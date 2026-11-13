"use client";

import { FileText, Paperclip, UserRound } from "lucide-react";
import type { WorkLogAttachment, WorkLogEntry } from "@/lib/sales-work-log-types";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Attachment({ file }: { file: WorkLogAttachment }) {
  if (!file.url) {
    return <span className="text-xs text-slate-600">{file.name} (unavailable)</span>;
  }
  const isImage = file.type.startsWith("image/");
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex max-w-[220px] items-center gap-2 rounded-md border border-slate-200 bg-white p-1.5 pr-2 hover:border-[#017e84]/50 hover:bg-[#e6f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#017e84]"
      title={`Open ${file.name}`}
    >
      {isImage ? (
        // Signed, short-lived link to a private file; next/image can't optimise it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" loading="lazy" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100">
          <FileText className="h-5 w-5 stroke-slate-600" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-primary-dark group-hover:text-[#016970]">{file.name}</span>
        <span className="block text-xs text-slate-600">{fileSize(file.size)}</span>
      </span>
    </a>
  );
}

/** Manual work logs with their time, type, lead / customer and attachments. */
export function WorkLogList({ logs, showAgent = false }: { logs: WorkLogEntry[]; showAgent?: boolean }) {
  return (
    <ol className="divide-y divide-slate-200">
      {logs.map((log) => (
        <li key={log.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
          <p className="w-32 shrink-0 text-xs tabular-nums text-slate-600 sm:pt-0.5">{timeFormat.format(new Date(log.loggedAt))}</p>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex rounded-sm border border-[#017e84]/30 bg-[#e6f4f5] px-1.5 py-0.5 text-xs font-medium text-[#016970]">
                {log.typeLabel}
              </span>
              {log.contactName ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-dark">
                  <UserRound className="h-3.5 w-3.5 stroke-slate-600" aria-hidden />
                  {log.contactName}
                </span>
              ) : (
                <span className="text-xs text-slate-600">No lead or customer</span>
              )}
              {showAgent ? <span className="text-xs text-slate-600">by {log.agentName}</span> : null}
              {log.attachments.length ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                  <Paperclip className="h-3.5 w-3.5 stroke-slate-600" aria-hidden />
                  {log.attachments.length} {log.attachments.length === 1 ? "file" : "files"}
                </span>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-primary-dark">{log.description}</p>
            {log.attachments.length ? (
              <div className="flex flex-wrap gap-2">
                {log.attachments.map((file, i) => (
                  <Attachment key={`${log.id}-${i}`} file={file} />
                ))}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
