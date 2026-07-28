"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  Check,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteCrmActivity,
  getCrmActivities,
  markCrmActivityDone,
  rescheduleCrmActivity,
} from "@/app/actions/crm/activities";
import { type SalespersonOption } from "@/app/actions/contacts";
import { getCachedSalespersonOptions, loadCrmUiPrefs, saveCrmUiPrefs } from "@/lib/crm-client-cache";
import { CrmPageSkeleton } from "@/components/crm/CrmSkeleton";
import type {
  CrmActivityListFilters,
  CrmActivityType,
  CrmScheduledActivity,
} from "@/app/actions/crm/types";
import {
  CRM_ACTIVITY_TYPES,
  crmActivityDueBucket,
  crmActivityTypeLabel,
  formatCrmActivityDueDate,
} from "@/lib/crm-activity-utils";

type SectionKey = "today" | "upcoming" | "overdue" | "completed";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

export function CrmActivitiesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactIdFilter = searchParams.get("contactId");
  const urlActivityType = searchParams.get("activityType");
  const [activities, setActivities] = useState<CrmScheduledActivity[]>([]);
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionKey>(() => {
    const prefs = loadCrmUiPrefs();
    const s = prefs.activitiesSection as SectionKey | undefined;
    return s && SECTIONS.some((x) => x.key === s) ? s : "today";
  });
  const [activityType, setActivityType] = useState<CrmActivityType | "all" | "tasks" | "meetings">(() => {
    if (urlActivityType === "meetings") return "meetings";
    if (urlActivityType === "meeting") return "meetings";
    if (urlActivityType === "tasks") return "tasks";
    if (urlActivityType && urlActivityType !== "all") {
      return urlActivityType as CrmActivityType;
    }
    return "all";
  });
  const [assignedTo, setAssignedTo] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    const filters: CrmActivityListFilters = {
      activityType,
      assignedTo: assignedTo === "all" ? "all" : assignedTo,
      contactId: contactIdFilter,
    };
    const res = await getCrmActivities(filters);
    setLoading(false);
    if ("error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    setActivities(res.activities || []);
  }, [activityType, assignedTo, contactIdFilter]);

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

  useEffect(() => {
    saveCrmUiPrefs({ activitiesSection: activeSection });
  }, [activeSection]);

  const grouped = useMemo(() => {
    const buckets: Record<SectionKey, CrmScheduledActivity[]> = {
      today: [],
      upcoming: [],
      overdue: [],
      completed: [],
    };
    for (const act of activities) {
      const bucket = crmActivityDueBucket(act.due_date, act.status);
      if (bucket === "today") buckets.today.push(act);
      else if (bucket === "upcoming") buckets.upcoming.push(act);
      else if (bucket === "overdue") buckets.overdue.push(act);
      else if (bucket === "completed") buckets.completed.push(act);
    }
    return buckets;
  }, [activities]);

  const visible = grouped[activeSection];

  function handleMarkDone(id: string) {
    startTransition(async () => {
      const res = await markCrmActivityDone(id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Activity completed");
      void load();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteCrmActivity(id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Activity deleted");
      void load();
    });
  }

  function handleReschedule(id: string) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    startTransition(async () => {
      const res = await rescheduleCrmActivity(id, tomorrow.toISOString());
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Rescheduled to tomorrow");
      void load();
    });
  }

  return (
    <div className="space-y-3">
      {contactIdFilter ? (
        <div className="rounded-sm border border-slate-200 bg-white px-4 py-2 text-sm text-secondary-muted flex items-center justify-between gap-3">
          <span>Showing activities for the selected contact.</span>
          <button
            type="button"
            className="text-[#017e84] hover:underline font-medium shrink-0"
            onClick={() => router.push("/crm/activities")}
          >
            Clear filter
          </button>
        </div>
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={activityType}
          onValueChange={(v) =>
            setActivityType(v as CrmActivityType | "all" | "tasks" | "meetings")
          }
        >
          <SelectTrigger className="w-[140px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="meetings">Meetings &amp; calls</SelectItem>
            <SelectItem value="tasks">Tasks</SelectItem>
            {CRM_ACTIVITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="w-[160px] h-8 rounded-sm text-sm">
            <SelectValue placeholder="Assigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            {salespersons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        <Button variant="outline" disabled title="Coming Soon" className="h-8 gap-1.5 shrink-0 rounded-sm">
          <Clock className="h-3.5 w-3.5" />
          Calendar — Coming Soon
        </Button>
      </div>

      <div className="flex flex-wrap gap-0 border-b border-slate-200">
        {SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            onClick={() => setActiveSection(section.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSection === section.key
                ? "border-[#017e84] text-[#017e84]"
                : "border-transparent text-secondary-muted hover:text-primary-dark"
            }`}
          >
            {section.label}
            <span className="ml-1.5 text-xs opacity-70">({grouped[section.key].length})</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <CrmPageSkeleton rows={5} />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-secondary-muted">No {activeSection} activities</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((act) => (
              <li key={act.id} className="flex items-start gap-3 p-4 hover:bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-primary-dark">{act.summary}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {crmActivityTypeLabel(act.activity_type)}
                    </Badge>
                    {act.status === "done" ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-800">Done</Badge>
                    ) : crmActivityDueBucket(act.due_date, act.status) === "overdue" ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Overdue
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-secondary-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{formatCrmActivityDueDate(act.due_date)}</span>
                    {act.assigned_to_name ? <span>{act.assigned_to_name}</span> : null}
                    {act.opportunity_name ? (
                      <Link
                        href={`/crm/opportunities/${act.opportunity_id}`}
                        className="text-[#017e84] hover:underline"
                      >
                        {act.opportunity_name}
                      </Link>
                    ) : null}
                    {act.customer_name ? <span>{act.customer_name}</span> : null}
                  </div>
                  {act.notes ? (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{act.notes}</p>
                  ) : null}
                </div>

                {act.status !== "done" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={isPending}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleMarkDone(act.id)}>
                        <Check className="h-3.5 w-3.5 mr-2" />
                        Mark as done
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleReschedule(act.id)}>
                        <Clock className="h-3.5 w-3.5 mr-2" />
                        Reschedule (+1 day)
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/crm/opportunities/${act.opportunity_id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Open opportunity
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(act.id)} className="text-red-600">
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
