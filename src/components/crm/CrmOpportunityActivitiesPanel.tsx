"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarPlus,
  Check,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteCrmActivity,
  getCrmActivitiesForOpportunity,
  markCrmActivityDone,
  rescheduleCrmActivity,
} from "@/app/actions/crm/activities";
import { type SalespersonOption } from "@/app/actions/contacts";
import { getCachedSalespersonOptions } from "@/lib/crm-client-cache";
import type { CrmScheduledActivity } from "@/app/actions/crm/types";
import { CrmActivityDialog } from "@/components/crm/CrmActivityDialog";
import {
  crmActivityTypeLabel,
  formatCrmActivityDueDate,
  crmActivityDueBucket,
} from "@/lib/crm-activity-utils";

type Props = {
  opportunityId: string | null;
  defaultAssignedTo?: string;
};

export function CrmOpportunityActivitiesPanel({
  opportunityId,
  defaultAssignedTo,
}: Props) {
  const [activities, setActivities] = useState<CrmScheduledActivity[]>([]);
  const [nextActivity, setNextActivity] = useState<CrmScheduledActivity | null>(null);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrmScheduledActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    if (!opportunityId) {
      setActivities([]);
      setNextActivity(null);
      return;
    }
    setLoading(true);
    const res = await getCrmActivitiesForOpportunity(opportunityId);
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    setActivities(res.activities || []);
    setNextActivity(res.next_activity || null);
  }, [opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getCachedSalespersonOptions().then((res) => {
      if ("salespersons" in res && res.salespersons) {
        setSalespersons(res.salespersons);
      }
    });
  }, []);

  function handleSaved(activity: CrmScheduledActivity) {
    void load();
  }

  function handleMarkDone(activityId: string) {
    startTransition(async () => {
      const res = await markCrmActivityDone(activityId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Activity marked as done");
      void load();
    });
  }

  function handleDelete(activityId: string) {
    startTransition(async () => {
      const res = await deleteCrmActivity(activityId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Activity deleted");
      void load();
    });
  }

  function handleReschedule(activityId: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    startTransition(async () => {
      const res = await rescheduleCrmActivity(activityId, tomorrow.toISOString());
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Activity rescheduled to tomorrow");
      void load();
    });
  }

  if (!opportunityId) {
    return (
      <div className="bg-white border rounded-lg p-4 text-xs text-secondary-muted text-center">
        Save the opportunity to schedule activities.
      </div>
    );
  }

  const bucket = nextActivity
    ? crmActivityDueBucket(nextActivity.due_date, nextActivity.status)
    : null;

  return (
    <div className="bg-white border rounded-lg">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-semibold text-primary-dark">Activities</h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled
            title="Coming Soon"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Calendar
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970]"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Schedule
          </Button>
        </div>
      </div>

      {nextActivity ? (
        <div className="p-3 border-b bg-slate-50/80 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-secondary-muted">
            Next Activity
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-primary-dark truncate">
                {nextActivity.summary}
              </div>
              <div className="text-xs text-secondary-muted mt-0.5 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {crmActivityTypeLabel(nextActivity.activity_type)}
                </Badge>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatCrmActivityDueDate(nextActivity.due_date)}
                </span>
                {nextActivity.assigned_to_name ? (
                  <span>{nextActivity.assigned_to_name}</span>
                ) : null}
              </div>
            </div>
            {bucket === "overdue" ? (
              <Badge variant="destructive" className="shrink-0 text-[10px]">
                Overdue
              </Badge>
            ) : bucket === "today" ? (
              <Badge className="shrink-0 text-[10px] bg-amber-500">Today</Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="p-3 border-b text-xs text-secondary-muted italic">
          No scheduled activities
        </div>
      )}

      <div className="max-h-[280px] overflow-y-auto divide-y">
        {loading ? (
          <div className="p-4 text-xs text-secondary-muted text-center">Loading…</div>
        ) : activities.length === 0 ? (
          <div className="p-4 text-xs text-secondary-muted text-center">
            No activities yet
          </div>
        ) : (
          activities.map((act) => (
            <ActivityRow
              key={act.id}
              activity={act}
              isPending={isPending}
              onEdit={() => {
                setEditing(act);
                setDialogOpen(true);
              }}
              onDone={() => handleMarkDone(act.id)}
              onDelete={() => handleDelete(act.id)}
              onReschedule={() => handleReschedule(act.id)}
            />
          ))
        )}
      </div>

      <CrmActivityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunityId={opportunityId}
        activity={editing}
        salespersons={salespersons}
        defaultAssignedTo={defaultAssignedTo}
        onSaved={handleSaved}
      />
    </div>
  );
}

function ActivityRow({
  activity,
  isPending,
  onEdit,
  onDone,
  onDelete,
  onReschedule,
}: {
  activity: CrmScheduledActivity;
  isPending: boolean;
  onEdit: () => void;
  onDone: () => void;
  onDelete: () => void;
  onReschedule: () => void;
}) {
  const isDone = activity.status === "done";
  const bucket = crmActivityDueBucket(activity.due_date, activity.status);

  return (
    <div className="flex items-start gap-2 p-3 text-xs">
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${isDone ? "line-through text-slate-400" : "text-primary-dark"}`}>
          {activity.summary}
        </div>
        <div className="text-secondary-muted mt-0.5 flex flex-wrap gap-2">
          <span>{crmActivityTypeLabel(activity.activity_type)}</span>
          <span>{formatCrmActivityDueDate(activity.due_date)}</span>
          {activity.assigned_to_name ? <span>{activity.assigned_to_name}</span> : null}
          {bucket === "overdue" && !isDone ? (
            <span className="text-red-600 font-medium">Overdue</span>
          ) : null}
          {isDone ? <span className="text-emerald-600">Done</span> : null}
        </div>
      </div>
      {!isDone ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={isPending}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDone}>
              <Check className="h-3.5 w-3.5 mr-2" />
              Mark as done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReschedule}>
              <Clock className="h-3.5 w-3.5 mr-2" />
              Reschedule (+1 day)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
