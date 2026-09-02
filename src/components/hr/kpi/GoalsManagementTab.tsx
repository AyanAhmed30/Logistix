"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, PlusCircle, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Employee } from "@/app/actions/employees";
import {
  createGoal,
  deleteGoal,
  getGoals,
  updateGoal,
  type KpiGoal,
  type KpiGoalStatus,
} from "@/app/actions/kpiGoals";
import {
  formatGoalMonthLabel,
  getCurrentGoalMonth,
  toMonthInputValue,
} from "@/lib/kpi-goal-month";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type GoalsManagementTabProps = {
  employee: Employee;
};

type GoalFormState = {
  goal: string;
  goalMonth: string;
  weight: string;
  progress: string;
  target: string;
  status: KpiGoalStatus;
};

type SortOption = "newest" | "oldest" | "highest_progress" | "lowest_progress";

const STATUS_OPTIONS: Array<{ value: KpiGoalStatus; label: string }> = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "cancelled", label: "Cancelled" },
];

const EMPTY_FORM: GoalFormState = {
  goal: "",
  goalMonth: toMonthInputValue(getCurrentGoalMonth()),
  weight: "",
  progress: "0",
  target: "",
  status: "not_started",
};

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function statusLabel(status: KpiGoalStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function statusBadgeClass(status: KpiGoalStatus) {
  switch (status) {
    case "not_started":
      return "border-transparent bg-slate-100 text-slate-700";
    case "in_progress":
      return "border-transparent bg-blue-100 text-blue-700";
    case "completed":
      return "border-transparent bg-emerald-100 text-emerald-700";
    case "on_hold":
      return "border-transparent bg-amber-100 text-amber-800";
    case "cancelled":
      return "border-transparent bg-red-100 text-red-700";
    default:
      return "border-transparent bg-slate-100 text-slate-700";
  }
}

function ProgressCell({ progress }: { progress: number }) {
  const value = Math.max(0, Math.min(100, progress || 0));
  return (
    <div className="min-w-[120px] space-y-1">
      <p className="text-sm font-medium text-slate-800">{value}%</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#0f766e] transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function GoalSummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export function GoalsManagementTab({ employee }: GoalsManagementTabProps) {
  const [goals, setGoals] = useState<KpiGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | KpiGoalStatus>("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<KpiGoal | null>(null);
  const [form, setForm] = useState<GoalFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KpiGoal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getGoals(employee.id);
      if ("error" in result) {
        toast.error(result.error);
        setGoals([]);
        return;
      }
      setGoals(result.goals || []);
    } catch (err) {
      toast.error(String(err || "Failed to load goals"));
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
  }, [employee.id]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const goal of goals) {
      if (goal.goal_month) {
        months.add(String(goal.goal_month).slice(0, 7));
      }
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [goals]);

  const summary = useMemo(() => {
    const total = goals.length;
    const completed = goals.filter((goal) => goal.status === "completed").length;
    const inProgress = goals.filter(
      (goal) => goal.status === "in_progress",
    ).length;
    const averageProgress =
      total === 0
        ? 0
        : Math.round(
            goals.reduce((sum, goal) => sum + (goal.progress || 0), 0) / total,
          );

    return { total, completed, inProgress, averageProgress };
  }, [goals]);

  const filteredGoals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let next = goals.filter((goal) => {
      if (statusFilter !== "all" && goal.status !== statusFilter) return false;
      if (
        monthFilter !== "all" &&
        String(goal.goal_month || "").slice(0, 7) !== monthFilter
      ) {
        return false;
      }
      if (!query) return true;
      return (
        goal.goal.toLowerCase().includes(query) ||
        goal.target.toLowerCase().includes(query) ||
        formatGoalMonthLabel(goal.goal_month).toLowerCase().includes(query)
      );
    });

    next = [...next].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return String(a.created_at).localeCompare(String(b.created_at));
        case "highest_progress":
          return (b.progress || 0) - (a.progress || 0);
        case "lowest_progress":
          return (a.progress || 0) - (b.progress || 0);
        case "newest":
        default:
          return String(b.created_at).localeCompare(String(a.created_at));
      }
    });

    return next;
  }, [goals, searchQuery, statusFilter, monthFilter, sortBy]);

  function openCreate() {
    setEditingGoal(null);
    setForm({
      ...EMPTY_FORM,
      goalMonth: toMonthInputValue(getCurrentGoalMonth()),
    });
    setFormOpen(true);
  }

  function openEdit(goal: KpiGoal) {
    setEditingGoal(goal);
    setForm({
      goal: goal.goal,
      goalMonth: toMonthInputValue(goal.goal_month),
      weight: String(goal.weight ?? ""),
      progress: String(goal.progress ?? 0),
      target: goal.target,
      status: goal.status,
    });
    setFormOpen(true);
  }

  function validateForm(): string | null {
    if (!form.goal.trim()) return "Goal is required";
    if (!form.goalMonth.trim()) return "Month is required";
    if (!form.weight.trim()) return "Weight is required";
    const weightNum = Number(form.weight);
    if (!Number.isFinite(weightNum) || weightNum < 0 || weightNum > 100) {
      return "Weight must be between 0 and 100";
    }
    if (!form.progress.trim()) return "Progress is required";
    const progressNum = Number(form.progress);
    if (!Number.isFinite(progressNum) || progressNum < 0 || progressNum > 100) {
      return "Progress must be between 0 and 100";
    }
    if (!form.target.trim()) return "Target is required";
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);
    try {
      const formData = new FormData();
      if (editingGoal) formData.append("id", editingGoal.id);
      formData.append("employeeId", employee.id);
      formData.append("goal", form.goal.trim());
      formData.append("goalMonth", form.goalMonth.trim());
      formData.append("weight", form.weight.trim());
      formData.append("progress", form.progress.trim());
      formData.append("target", form.target.trim());
      formData.append("status", form.status);

      const result = editingGoal
        ? await updateGoal(formData)
        : await createGoal(formData);

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(editingGoal ? "Goal updated" : "Goal created");
      setFormOpen(false);
      setEditingGoal(null);
      setForm(EMPTY_FORM);
      await loadGoals();
    } catch (err) {
      toast.error(String(err || "Failed to save goal"));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deleteGoal(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Goal deleted");
      setDeleteTarget(null);
      await loadGoals();
    } catch (err) {
      toast.error(String(err || "Failed to delete goal"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Goals & Management
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Create, monitor and manage employee performance goals.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="shrink-0">
          <PlusCircle className="mr-1.5 h-4 w-4" />
          Create Goal
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <GoalSummaryCard title="Total Goals" value={summary.total} />
        <GoalSummaryCard title="Completed Goals" value={summary.completed} />
        <GoalSummaryCard title="In Progress Goals" value={summary.inProgress} />
        <GoalSummaryCard
          title="Average Progress %"
          value={`${summary.averageProgress}%`}
        />
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">Goals</CardTitle>
          <CardDescription>
            Filter and sort performance goals for this employee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="goal-search">Search Goal</Label>
              <Input
                id="goal-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by goal, target, or month"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-status-filter">Status Filter</Label>
              <select
                id="goal-status-filter"
                className={selectClassName}
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "all" | KpiGoalStatus)
                }
              >
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-month-filter">Month Filter</Label>
              <select
                id="goal-month-filter"
                className={selectClassName}
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
              >
                <option value="all">All Months</option>
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {formatGoalMonthLabel(`${month}-01`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-sort">Sorting</Label>
              <select
                id="goal-sort"
                className={selectClassName}
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="highest_progress">Highest Progress</option>
                <option value="lowest_progress">Lowest Progress</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading goals...
            </div>
          ) : goals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-12 text-center">
              <Target className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                No goals have been created for this employee.
              </p>
              <Button type="button" className="mt-4" onClick={openCreate}>
                <PlusCircle className="mr-1.5 h-4 w-4" />
                Create Goal
              </Button>
            </div>
          ) : filteredGoals.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No goals match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Goal</TableHead>
                    <TableHead>Weight (%)</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Progress (%)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGoals.map((goal) => (
                    <TableRow key={goal.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatGoalMonthLabel(goal.goal_month)}
                      </TableCell>
                      <TableCell className="max-w-[220px] font-medium">
                        {goal.goal}
                      </TableCell>
                      <TableCell>{goal.weight}%</TableCell>
                      <TableCell className="max-w-[260px]">
                        <p className="line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                          {goal.target}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ProgressCell progress={goal.progress} />
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(goal.status)}>
                          {statusLabel(goal.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(goal)}
                          >
                            <Edit className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(goal)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingGoal(null);
            setForm(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGoal ? "Edit Goal" : "Create Goal"}
            </DialogTitle>
            <DialogDescription>
              {editingGoal
                ? "Update this employee performance goal."
                : "Add a new performance goal for this employee."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kpi-goal-title">Goal</Label>
              <Input
                id="kpi-goal-title"
                value={form.goal}
                onChange={(event) =>
                  setForm((current) => ({ ...current, goal: event.target.value }))
                }
                placeholder="Enter goal title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kpi-goal-month">Month</Label>
              <Input
                id="kpi-goal-month"
                type="month"
                value={form.goalMonth}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    goalMonth: event.target.value,
                  }))
                }
                required
              />
              <p className="text-xs text-slate-500">
                Select month and year only (for example January 2026).
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="kpi-goal-weight">Weight (%)</Label>
                <Input
                  id="kpi-goal-weight"
                  type="number"
                  min={0}
                  max={100}
                  value={form.weight}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weight: event.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kpi-goal-progress">Progress (%)</Label>
                <Input
                  id="kpi-goal-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      progress: event.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Progress Preview</Label>
              <ProgressCell progress={Number(form.progress) || 0} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kpi-goal-target">Target</Label>
              <Textarea
                id="kpi-goal-target"
                value={form.target}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    target: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Describe the target in detail"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kpi-goal-status">Status</Label>
              <select
                id="kpi-goal-status"
                className={selectClassName}
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as KpiGoalStatus,
                  }))
                }
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? "Saving..."
                  : editingGoal
                    ? "Save Changes"
                    : "Create Goal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Goal</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-900">
                {deleteTarget?.goal}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
