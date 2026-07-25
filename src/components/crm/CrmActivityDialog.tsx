"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCrmActivity,
  updateCrmActivity,
} from "@/app/actions/crm/activities";
import type { CrmActivityType, CrmScheduledActivity } from "@/app/actions/crm/types";
import type { SalespersonOption } from "@/app/actions/contacts";
import {
  CRM_ACTIVITY_TYPES,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/crm-activity-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  activity?: CrmScheduledActivity | null;
  salespersons: SalespersonOption[];
  defaultAssignedTo?: string;
  onSaved: (activity: CrmScheduledActivity) => void;
};

export function CrmActivityDialog({
  open,
  onOpenChange,
  opportunityId,
  activity,
  salespersons,
  defaultAssignedTo,
  onSaved,
}: Props) {
  const isEdit = Boolean(activity?.id);
  const [activityType, setActivityType] = useState<CrmActivityType>("call");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setActivityType(activity?.activity_type || "call");
    setSummary(activity?.summary || "");
    setNotes(activity?.notes || "");
    setDueDate(toDatetimeLocalValue(activity?.due_date));
    setAssignedTo(
      activity?.assigned_to || defaultAssignedTo || salespersons[0]?.id || ""
    );
  }, [open, activity, defaultAssignedTo, salespersons]);

  function handleSubmit() {
    startTransition(async () => {
      const payload = {
        id: activity?.id,
        opportunity_id: opportunityId,
        activity_type: activityType,
        summary,
        notes: notes || null,
        due_date: fromDatetimeLocalValue(dueDate),
        assigned_to: assignedTo,
      };

      const result = isEdit
        ? await updateCrmActivity(payload)
        : await createCrmActivity(payload);

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("activity" in result && result.activity) {
        toast.success(isEdit ? "Activity updated" : "Activity scheduled");
        onSaved(result.activity);
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Activity" : "Schedule Activity"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Activity Type</Label>
            <Select
              value={activityType}
              onValueChange={(v) => setActivityType(v as CrmActivityType)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_ACTIVITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="activity-summary">Summary *</Label>
            <Input
              id="activity-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Follow up on proposal"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="activity-due">Due Date</Label>
            <Input
              id="activity-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Assigned To *</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                {salespersons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="activity-notes">Notes</Label>
            <Textarea
              id="activity-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1"
              placeholder="Optional notes…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !summary.trim() || !assignedTo}>
            {isPending ? "Saving…" : isEdit ? "Save" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
