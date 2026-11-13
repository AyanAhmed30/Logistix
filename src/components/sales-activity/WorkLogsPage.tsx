"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Paperclip, Search, X } from "lucide-react";
import { toast } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getMyWorkLogs,
  saveWorkLog,
  searchMyLogContacts,
  type LogContactOption,
} from "@/app/actions/sales-activity";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { karachiTodayYmd } from "@/lib/contact-date-range";
import {
  WORK_LOG_ACCEPT,
  WORK_LOG_MAX_FILES,
  WORK_LOG_MAX_TOTAL_BYTES,
  WORK_LOG_TYPES,
  type WorkLogEntry,
  type WorkLogType,
} from "@/lib/sales-work-log-types";
import { WorkLogList } from "@/components/sales-activity/WorkLogList";
import { dayOf } from "@/components/sales-activity/activity-format";

function Label({ htmlFor, children, required }: { htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-primary-dark">
      {children} {required ? <span className="text-red-700" aria-hidden>*</span> : null}
    </label>
  );
}

/** Search the agent's own leads / customers; optional. */
function ContactField({ value, onChange }: { value: LogContactOption | null; onChange: (c: LogContactOption | null) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LogContactOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 250);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    searchMyLogContacts(debounced)
      .then((res) => !cancelled && setResults("contacts" in res ? res.contacts : []))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  if (value) {
    return (
      <div className="space-y-1">
        <Label>Lead / customer</Label>
        <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-[#017e84]/40 bg-[#e6f4f5] px-3">
          <span className="truncate text-sm font-medium text-[#016970]">
            {value.name}
            {value.customerId ? <span className="ml-1.5 text-xs font-normal text-slate-600">{value.customerId}</span> : null}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#017e84]"
            aria-label={`Remove ${value.name}`}
          >
            <X className="h-4 w-4 stroke-[#016970]" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-1">
      <Label htmlFor={id}>Lead / customer</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 stroke-slate-500" aria-hidden />
        <Input
          id={id}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search by name or Customer ID"
          className="h-9 bg-white pl-8"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-describedby={`${id}-help`}
          autoComplete="off"
        />
      </div>
      <p id={`${id}-help`} className="text-xs text-slate-600">Optional. Only your own leads and customers are listed.</p>
      {open ? (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute inset-x-0 top-[62px] z-20 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-sm"
        >
          {loading && !results ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin stroke-[#017e84]" aria-hidden /> Searching…
            </li>
          ) : results && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-600">{query.trim() ? "No matching lead or customer." : "You have no leads or customers yet."}</li>
          ) : (
            (results ?? []).map((c) => (
              <li key={c.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  // Choose before the input's blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#e6f4f5] focus-visible:bg-[#e6f4f5] focus-visible:outline-none"
                >
                  <span className="truncate text-primary-dark">{c.name}</span>
                  {c.customerId ? <span className="shrink-0 text-xs text-slate-600">{c.customerId}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function LogForm({ onSaved }: { onSaved: (log: WorkLogEntry) => void }) {
  const [type, setType] = useState<WorkLogType | "">("");
  const [customType, setCustomType] = useState("");
  const [contact, setContact] = useState<LogContactOption | null>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];
    if (next.length > WORK_LOG_MAX_FILES) setError(`Attach at most ${WORK_LOG_MAX_FILES} files.`);
    else if (next.reduce((s, f) => s + f.size, 0) > WORK_LOG_MAX_TOTAL_BYTES) setError("Attachments can be at most 10 MB in total.");
    else {
      setError(null);
      setFiles(next);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!type) return setError("Choose an activity type.");
    if (type === "other" && !customType.trim()) return setError("Enter the activity type.");
    if (!description.trim()) return setError("Describe what you did.");
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("activityType", type);
      form.set("customType", customType);
      form.set("contactId", contact?.id ?? "");
      form.set("description", description);
      for (const f of files) form.append("files", f);
      const res = await saveWorkLog(form);
      if ("error" in res) return setError(res.error);
      if ("setupRequired" in res) return setError("Logs are not set up yet. Ask Admin.");
      toast.success("Log saved");
      onSaved(res.log);
      setType("");
      setCustomType("");
      setContact(null);
      setDescription("");
      setFiles([]);
    } catch {
      setError("The log could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <div className="space-y-1">
        <Label htmlFor="log-type" required>Activity type</Label>
        <Select value={type} onValueChange={(v) => setType(v as WorkLogType)}>
          <SelectTrigger id="log-type" className="h-9 w-full bg-white">
            <SelectValue placeholder="Choose the activity" />
          </SelectTrigger>
          <SelectContent>
            {WORK_LOG_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {type === "other" ? (
        <div className="space-y-1">
          <Label htmlFor="log-custom-type" required>Activity type name</Label>
          <Input id="log-custom-type" value={customType} onChange={(e) => setCustomType(e.target.value)} maxLength={80} className="h-9 bg-white" />
        </div>
      ) : null}
      <ContactField value={contact} onChange={setContact} />
      <div className="space-y-1">
        <Label htmlFor="log-description" required>What did you do?</Label>
        <Textarea
          id="log-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          className="bg-white"
          placeholder="For example: called the customer about the Dubai shipment, they will confirm tomorrow."
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="log-files">Attachments</Label>
        <input
          id="log-files"
          ref={fileInput}
          type="file"
          multiple
          accept={WORK_LOG_ACCEPT}
          onChange={(e) => addFiles(e.target.files)}
          className="sr-only"
          aria-describedby="log-files-help"
        />
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInput.current?.click()} disabled={files.length >= WORK_LOG_MAX_FILES}>
          <Paperclip className="h-4 w-4" aria-hidden />
          Add files
        </Button>
        <p id="log-files-help" className="text-xs text-slate-600">
          Optional. Screenshots, PDF, Word, Excel, text or CSV. Up to {WORK_LOG_MAX_FILES} files, 10 MB in total.
        </p>
        {files.length ? (
          <ul className="space-y-1" aria-label="Chosen files">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                <span className="truncate text-xs text-primary-dark">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="rounded p-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#017e84]"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3.5 w-3.5 stroke-slate-600" aria-hidden />
                </button>
              </li>
            ))}
            <li className="text-xs text-slate-600">{(totalBytes / (1024 * 1024)).toFixed(1)} MB of 10 MB</li>
          </ul>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full bg-[#017e84] text-white hover:bg-[#016970] sm:w-auto" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin stroke-white" aria-hidden /> : null}
        {saving ? "Saving…" : "Save Log"}
      </Button>
    </form>
  );
}

export function WorkLogsPage() {
  const today = karachiTodayYmd();
  const [date, setDate] = useState(today);
  const [logs, setLogs] = useState<WorkLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMyWorkLogs(date)
      .then((res) => {
        if (cancelled) return;
        if ("setupRequired" in res) setSetupRequired(true);
        else if ("error" in res) setError(res.error);
        else {
          setError(null);
          setLogs(res.logs);
        }
      })
      .catch(() => !cancelled && setError("The request failed. Check your connection and try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, retry]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-base sm:text-lg font-semibold text-primary-dark">Logs</h1>
        <p className="text-xs text-slate-600">Record the work you do during the day. The date and time are saved automatically and can&apos;t be changed.</p>
      </div>
      {setupRequired ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
          Logs are not set up yet. Ask Admin to run the database update (<code>058_sales_agent_work_logs.sql</code>).
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <section aria-label="New log" className="h-fit rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-primary-dark">New log</h2>
            <LogForm
              onSaved={(log) => {
                if (date === today) setLogs((prev) => [log, ...(prev ?? [])]);
                else setDate(today);
              }}
            />
          </section>
          <section aria-label="Your logs" className="min-w-0 rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
              <h2 className="text-base font-semibold text-primary-dark">
                {date === today ? "Today's logs" : `Logs on ${dayOf(date)}`}
                {logs ? <span className="ml-2 text-sm font-normal text-slate-600">({logs.length})</span> : null}
              </h2>
              <div className="flex items-center gap-2">
                <label htmlFor="log-date" className="text-sm font-medium text-primary-dark">Date</label>
                <Input id="log-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-9 w-[150px] bg-white" />
                {date !== today ? (
                  <Button variant="ghost" size="sm" className="text-[#017e84] hover:text-[#016970]" onClick={() => setDate(today)}>
                    Today
                  </Button>
                ) : null}
              </div>
            </div>
            <div className={`p-4 transition-opacity ${loading && logs ? "opacity-60" : ""}`} aria-busy={loading} aria-live="polite">
              {error ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-600">{error}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setRetry((n) => n + 1)}>Retry</Button>
                </div>
              ) : !logs ? (
                <div className="space-y-2 animate-pulse">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded bg-slate-100" />)}
                </div>
              ) : logs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-600">
                  {date === today ? "No logs yet today. Use the New log form to save one." : "No logs on this day."}
                </p>
              ) : (
                <WorkLogList logs={logs} />
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
