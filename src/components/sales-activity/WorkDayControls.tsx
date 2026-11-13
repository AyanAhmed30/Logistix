"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck2, CalendarX2, Loader2, NotebookPen } from "lucide-react";
import { toast } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMyWorkDay,
  submitEndDay,
  submitStartDay,
  type DayStats,
  type MyWorkDay,
} from "@/app/actions/sales-activity";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const timeOf = (iso: string) => timeFormat.format(new Date(iso));

/** A labelled group of radio buttons (native inputs, keyboard friendly). */
function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T | "";
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-primary-dark">
        {legend} <span className="text-red-700" aria-hidden>*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              value === option.value ? "border-[#017e84] bg-[#e6f4f5] text-[#016970]" : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="accent-[#017e84]"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Explain({ id, label, value, onChange, required = true }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-primary-dark">
        {label} {required ? <span className="text-red-700" aria-hidden>*</span> : null}
      </label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} maxLength={4000} className="bg-white" />
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  ) : null;
}

const YES_NO = [
  { value: "no" as const, label: "No" },
  { value: "yes" as const, label: "Yes" },
];

function StartDayDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: (startedAt: string) => void }) {
  const [internet, setInternet] = useState<"yes" | "no" | "">("");
  const [previous, setPrevious] = useState<"yes" | "no" | "partial" | "">("");
  const [issue, setIssue] = useState<"yes" | "no" | "">("");
  const [issueText, setIssueText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInternet("");
    setPrevious("");
    setIssue("");
    setIssueText("");
    setError(null);
  }, [open]);

  async function submit() {
    if (!internet || !previous || !issue) return setError("Answer every question.");
    if (issue === "yes" && !issueText.trim()) return setError("Describe the problem.");
    setSaving(true);
    setError(null);
    try {
      const res = await submitStartDay({
        internetOk: internet === "yes",
        previousTasks: previous,
        hasIssue: issue === "yes",
        issueText,
      });
      if ("error" in res) return setError(res.error);
      if ("setupRequired" in res) return setError("Daily reports are not set up yet. Ask Admin.");
      toast.success("Your working day has started");
      onDone(res.startedAt);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start your day</DialogTitle>
          <DialogDescription>Admin is notified when you submit. The time is recorded automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Choice name="internet" legend="Is your internet connection working fine?" value={internet} onChange={setInternet} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          <Choice
            name="previous"
            legend="Have you completed your previous day's pending tasks?"
            value={previous}
            onChange={setPrevious}
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              { value: "partial", label: "Some tasks are still pending" },
            ]}
          />
          <Choice name="issue" legend="Do you have any problems or issues?" value={issue} onChange={setIssue} options={[{ value: "no", label: "No issues" }, { value: "yes", label: "Yes" }]} />
          {issue === "yes" ? <Explain id="start-issue" label="Describe the problem" value={issueText} onChange={setIssueText} /> : null}
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-[#017e84] text-white hover:bg-[#016970]" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin stroke-white" aria-hidden /> : null}
            {saving ? "Submitting…" : "Start Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STAT_LABELS: Array<[keyof DayStats, string]> = [
  ["leadsAssigned", "Leads assigned"],
  ["inquiriesSent", "Inquiries sent"],
  ["contactsAdded", "Contacts added"],
  ["followUpsCompleted", "Follow-ups completed"],
  ["quotationsSent", "Quotations sent"],
];

function EndDayDialog({
  open,
  onOpenChange,
  stats,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: DayStats | null;
  onDone: (endedAt: string) => void;
}) {
  const [completed, setCompleted] = useState("");
  const [pending, setPending] = useState<"yes" | "no" | "">("");
  const [pendingText, setPendingText] = useState("");
  const [problems, setProblems] = useState<"yes" | "no" | "">("");
  const [problemsText, setProblemsText] = useState("");
  const [support, setSupport] = useState<"yes" | "no" | "">("");
  const [supportText, setSupportText] = useState("");
  const [plan, setPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  async function submit() {
    if (!completed.trim()) return setError("Describe the work you completed today.");
    if (!pending || !problems || !support) return setError("Answer every question.");
    if (pending === "yes" && !pendingText.trim()) return setError("Explain the pending tasks.");
    if (problems === "yes" && !problemsText.trim()) return setError("Describe the problems you faced.");
    if (support === "yes" && !supportText.trim()) return setError("Describe the support you need.");
    setSaving(true);
    setError(null);
    try {
      const res = await submitEndDay({
        completedWork: completed,
        hasPendingTasks: pending === "yes",
        pendingTasks: pendingText,
        hadProblems: problems === "yes",
        problems: problemsText,
        needsSupport: support === "yes",
        support: supportText,
        nextDayPlan: plan,
      });
      if ("error" in res) return setError(res.error);
      if ("setupRequired" in res) return setError("Daily reports are not set up yet. Ask Admin.");
      toast.success("Your end-of-day report was submitted");
      onDone(res.endedAt);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>End your day</DialogTitle>
          <DialogDescription>Admin is notified when you submit. The time is recorded automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section aria-label="Today from the system" className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-primary-dark">Today, from the system</p>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
              {STAT_LABELS.map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs text-slate-600">{label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-primary-dark">{stats?.[key] ?? "N/A"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <Explain id="end-completed" label="What work did you complete today?" value={completed} onChange={setCompleted} />
          <Choice name="pending" legend="Are there any pending tasks?" value={pending} onChange={setPending} options={YES_NO} />
          {pending === "yes" ? <Explain id="end-pending" label="Explain the pending tasks" value={pendingText} onChange={setPendingText} /> : null}
          <Choice name="problems" legend="Did you face any problems today?" value={problems} onChange={setProblems} options={YES_NO} />
          {problems === "yes" ? <Explain id="end-problems" label="Describe the problems" value={problemsText} onChange={setProblemsText} /> : null}
          <Choice name="support" legend="Do you need any support from Admin?" value={support} onChange={setSupport} options={YES_NO} />
          {support === "yes" ? <Explain id="end-support" label="Describe the support you need" value={supportText} onChange={setSupportText} /> : null}
          <Explain id="end-plan" label="What is your plan for the next working day?" value={plan} onChange={setPlan} required={false} />
          <FormError message={error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-[#017e84] text-white hover:bg-[#016970]" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin stroke-white" aria-hidden /> : null}
            {saving ? "Submitting…" : "End Day"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Start Day / End Day for sales agents, in the existing headers.
 * `tone="brand"` for the teal CRM header, `"light"` for the white dashboard header.
 */
export function WorkDayControls({ tone = "light" }: { tone?: "light" | "brand" }) {
  const [day, setDay] = useState<MyWorkDay | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await getMyWorkDay().catch(() => null);
    if (res && !("error" in res) && !("setupRequired" in res)) setDay(res);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!day) return null;

  const brand = tone === "brand";
  const buttonClass = brand
    ? "h-8 gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white [&_svg]:stroke-white"
    : "h-9 gap-1.5 border-slate-200 bg-white text-primary-dark hover:bg-slate-50";
  const noteClass = `hidden whitespace-nowrap text-xs lg:inline ${brand ? "text-white/85" : "text-slate-600"}`;

  let content: ReactNode;
  if (!day.startedAt) {
    content = (
      <Button variant="outline" className={buttonClass} onClick={() => setStartOpen(true)}>
        <CalendarCheck2 className="h-4 w-4" aria-hidden />
        Start Day
      </Button>
    );
  } else if (!day.endedAt) {
    content = (
      <>
        <span className={noteClass}>Started {timeOf(day.startedAt)}</span>
        <Button
          variant="outline"
          className={buttonClass}
          onClick={() => {
            setEndOpen(true);
            void load(); // fresh counts for the report
          }}
        >
          <CalendarX2 className="h-4 w-4" aria-hidden />
          End Day
        </Button>
      </>
    );
  } else {
    content = (
      <span className={`whitespace-nowrap text-xs ${brand ? "text-white/85" : "text-slate-600"}`}>
        Day ended {timeOf(day.endedAt)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" className={buttonClass}>
        <Link href="/admin/logs" aria-label="Logs">
          <NotebookPen className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Logs</span>
        </Link>
      </Button>
      {content}
      <StartDayDialog open={startOpen} onOpenChange={setStartOpen} onDone={(startedAt) => setDay((d) => (d ? { ...d, startedAt } : d))} />
      <EndDayDialog open={endOpen} onOpenChange={setEndOpen} stats={day.stats} onDone={(endedAt) => setDay((d) => (d ? { ...d, endedAt } : d))} />
    </div>
  );
}
