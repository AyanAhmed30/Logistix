"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAccountingActivity,
  getAccountingActivities,
  markAccountingActivityDone,
  type AccountingActivity,
} from "@/app/actions/accounting/automation";

type Props = {
  invoiceId?: string;
  contactId?: string;
};

export function AccountingActivitiesPanel({ invoiceId, contactId }: Props) {
  const [activities, setActivities] = useState<AccountingActivity[]>([]);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [activityType, setActivityType] = useState<
    "follow_up" | "call" | "send_reminder" | "verify_payment" | "todo"
  >("follow_up");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await getAccountingActivities({ invoiceId, contactId });
      if ("error" in res && res.error) {
        setActivities([]);
      } else {
        setActivities(res.activities ?? []);
      }
    });
  }, [invoiceId, contactId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreate() {
    if (!dueAt) {
      toast.error("Set a due date/time");
      return;
    }
    startTransition(async () => {
      const res = await createAccountingActivity({
        invoiceId,
        contactId,
        activityType,
        summary: summary || activityType.replace(/_/g, " "),
        dueAt: new Date(dueAt).toISOString(),
      });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Activity scheduled");
        setOpen(false);
        setSummary("");
        load();
      }
    });
  }

  return (
    <div className="border border-slate-200 rounded-sm bg-white">
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary-dark">Scheduled Activities</h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-sm text-xs"
          onClick={() => {
            setDueAt(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
            setOpen(true);
          }}
        >
          Schedule
        </Button>
      </div>
      <div className="p-3 space-y-2">
        {activities.length === 0 ? (
          <p className="text-xs text-secondary-muted">No scheduled activities.</p>
        ) : (
          activities.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0"
            >
              <div>
                <p className="font-medium capitalize">
                  {a.activity_type.replace(/_/g, " ")}
                  {a.status !== "scheduled" ? (
                    <span className="ml-2 text-xs text-secondary-muted">({a.status})</span>
                  ) : null}
                </p>
                <p className="text-xs text-secondary-muted">{a.summary}</p>
                <p className="text-[11px] text-secondary-muted mt-0.5">
                  Due {new Date(a.due_at).toLocaleString()}
                  {a.assigned_to ? ` · ${a.assigned_to}` : ""}
                </p>
              </div>
              {a.status === "scheduled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-sm text-xs shrink-0"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await markAccountingActivityDone(a.id);
                      if ("error" in res && res.error) toast.error(res.error);
                      else load();
                    });
                  }}
                >
                  Done
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as typeof activityType)}
                className="h-8 w-full rounded-sm border border-slate-200 px-2 text-sm"
              >
                <option value="follow_up">Follow up customer</option>
                <option value="call">Call customer</option>
                <option value="send_reminder">Send reminder</option>
                <option value="verify_payment">Verify payment</option>
                <option value="todo">Todo</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Summary</Label>
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Due</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 rounded-sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f]"
              disabled={isPending}
              onClick={handleCreate}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
