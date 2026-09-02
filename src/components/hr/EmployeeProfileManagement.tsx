"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Edit,
  Eye,
  PlusCircle,
  Trash2,
  Users,
  UserCheck,
  UserMinus,
  BarChart3,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import { toast } from "sonner";
import { canAccessHrModule } from "@/app/actions/hr_people";
import {
  createEmployee,
  deleteEmployee,
  getAllEmployees,
  getEmployee,
  updateEmployee,
  type Employee,
  type EmploymentStatus,
} from "@/app/actions/employees";
import { EmployeeProfileFormFields } from "@/components/hr/EmployeeProfileFormFields";
import { ViewEmployeeProfile } from "@/components/hr/ViewEmployeeProfile";
import { KpiDashboard } from "@/components/hr/KpiDashboard";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
type HrPersonStatus = EmploymentStatus;

type HrPersonRecord = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  employeeId: string;
  status: HrPersonStatus;
  createdAt: string;
};

function mapEmployeeToRecord(row: Employee): HrPersonRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email || "",
    phone: row.phone || "",
    department: row.department || "",
    designation: row.designation || "",
    employeeId: row.employee_id || "",
    status: row.status,
    createdAt: row.created_at,
  };
}

function filterAndSortHrPersons(
  records: HrPersonRecord[],
  filters: {
    query: string;
    status: "all" | HrPersonStatus;
    sortBy: "createdAt" | "fullName" | "department" | "status";
    sortOrder: "asc" | "desc";
  },
) {
  const query = filters.query.trim().toLowerCase();
  const status = filters.status;

  const filtered = records.filter((record) => {
    const matchesQuery =
      !query ||
      [
        record.fullName,
        record.username,
        record.department,
        record.designation,
        record.employeeId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesStatus = status === "all" || record.status === status;
    return matchesQuery && matchesStatus;
  });

  filtered.sort((a, b) => {
    const left = a[filters.sortBy] ?? "";
    const right = b[filters.sortBy] ?? "";
    const comparison = String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
    });
    return filters.sortOrder === "asc" ? comparison : -comparison;
  });

  return filtered;
}

export function EmployeeProfileManagement() {
  const [persons, setPersons] = useState<HrPersonRecord[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | HrPersonStatus>(
    "all",
  );
  const [sortBy, setSortBy] = useState<
    "createdAt" | "fullName" | "department" | "status"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HrPersonRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [isViewLoading, setIsViewLoading] = useState(false);
  const [kpiOpen, setKpiOpen] = useState(false);
  const [kpiEmployee, setKpiEmployee] = useState<Employee | null>(null);
  const [isKpiLoading, setIsKpiLoading] = useState(false);

  useEffect(() => {
    async function loadAccess() {
      const result = await canAccessHrModule();
      setIsAuthorized(result.authorized);
    }

    loadAccess();
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      setIsLoading(false);
      return;
    }

    async function loadPeople() {
      setIsLoading(true);
      try {
        const result = await getAllEmployees();

        if ("error" in result) {
          toast.error(result.error);
          setPersons([]);
        } else {
          setPersons((result.employees || []).map(mapEmployeeToRecord));
        }
      } catch (err) {
        toast.error(String(err || "Failed to load employees"));
        setPersons([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPeople();
  }, [isAuthorized]);

  const sortedPersons = useMemo(
    () =>
      filterAndSortHrPersons(persons, {
        query,
        status: statusFilter,
        sortBy,
        sortOrder,
      }),
    [persons, query, statusFilter, sortBy, sortOrder],
  );

  const summaryStats = useMemo(() => {
    const total = persons.length;
    const active = persons.filter((p) => p.status === "active").length;
    const inactive = persons.filter((p) => p.status === "inactive").length;
    const departments = Array.from(
      new Set(persons.map((p) => p.department).filter(Boolean)),
    ).length;

    return { total, active, inactive, departments };
  }, [persons]);

  async function refreshData() {
    setIsLoading(true);
    try {
      const refreshed = await getAllEmployees();
      if ("error" in refreshed) {
        toast.error(refreshed.error);
      } else {
        setPersons((refreshed.employees || []).map(mapEmployeeToRecord));
      }
    } catch (err) {
      toast.error(String(err || "Failed to refresh employees"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const result = await createEmployee(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Employee created");
      setCreateOpen(false);
      if (form instanceof HTMLFormElement) {
        form.reset();
      }

      await refreshData();
    } catch (err) {
      toast.error(String(err || "Failed to create employee"));
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEmployee) return;

    const formData = new FormData(event.currentTarget);
    formData.append("id", editingEmployee.id);

    try {
      const result = await updateEmployee(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Employee updated");
      setEditOpen(false);
      setEditingEmployee(null);
      await refreshData();
    } catch (err) {
      toast.error(String(err || "Failed to update employee"));
    }
  }

  function openView(person: HrPersonRecord) {
    setViewingEmployee(null);
    setViewOpen(true);
    setIsViewLoading(true);

    getEmployee(person.id)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          setViewOpen(false);
          return;
        }
        setViewingEmployee(result.employee);
      })
      .catch((err) => {
        toast.error(String(err || "Failed to load employee details"));
        setViewOpen(false);
      })
      .finally(() => {
        setIsViewLoading(false);
      });
  }

  function openKpi(person: HrPersonRecord) {
    setKpiEmployee(null);
    setKpiOpen(true);
    setIsKpiLoading(true);

    getEmployee(person.id)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          setKpiOpen(false);
          return;
        }
        setKpiEmployee(result.employee);
      })
      .catch((err) => {
        toast.error(String(err || "Failed to load employee KPI dashboard"));
        setKpiOpen(false);
      })
      .finally(() => {
        setIsKpiLoading(false);
      });
  }

  function openEdit(person: HrPersonRecord) {
    setEditingEmployee(null);
    setEditOpen(true);
    setIsEditLoading(true);

    getEmployee(person.id)
      .then((result) => {
        if ("error" in result) {
          toast.error(result.error);
          setEditOpen(false);
          return;
        }
        setEditingEmployee(result.employee);
      })
      .catch((err) => {
        toast.error(String(err || "Failed to load employee details"));
        setEditOpen(false);
      })
      .finally(() => {
        setIsEditLoading(false);
      });
  }

  function handleDelete(person: HrPersonRecord) {
    setDeleteTarget(person);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const formData = new FormData();
      formData.append("id", deleteTarget.id);
      const result = await deleteEmployee(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Employee removed");
      setDeleteTarget(null);
      await refreshData();
    } catch (err) {
      toast.error(String(err || "Failed to delete employee"));
    }
  }

  if (!isAuthorized) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        Only authorized HR users can manage employee profiles from this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-16 text-center text-secondary-muted">
        Loading employees...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              Employee Profile Management
            </CardTitle>
            <CardDescription>
              Create and manage employee profiles with basic details.
            </CardDescription>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            <PlusCircle className="mr-2 h-4 w-4 text-white stroke-white" />
            Create Employee
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, username, department..."
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | HrPersonStatus)
              }
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
              <option value="suspended">Suspended</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
            </select>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(event) => {
                const [nextSortBy, nextSortOrder] =
                  event.target.value.split(":");
                setSortBy(
                  nextSortBy as
                    | "createdAt"
                    | "fullName"
                    | "department"
                    | "status",
                );
                setSortOrder(nextSortOrder as "asc" | "desc");
              }}
              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="fullName:asc">Name A-Z</option>
              <option value="fullName:desc">Name Z-A</option>
              <option value="department:asc">Department A-Z</option>
            </select>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryCard
              title="Total Employees"
              count={summaryStats.total}
              icon={<Users className="h-5 w-5" />}
            />
            <SummaryCard
              title="Active Employees"
              count={summaryStats.active}
              icon={<UserCheck className="h-5 w-5" />}
            />
            <SummaryCard
              title="Inactive Employees"
              count={summaryStats.inactive}
              icon={<UserMinus className="h-5 w-5" />}
            />
            <SummaryCard
              title="Departments"
              count={summaryStats.departments}
              icon={<BriefcaseBusiness className="h-5 w-5" />}
            />
          </div>

          <div className="mb-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button onClick={refreshData} size="sm" variant="ghost">
              Refresh Data
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            {sortedPersons.length === 0 ? (
              <div className="py-8 text-center text-secondary-muted">
                No employees yet. Create the first profile to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Email Address</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Employment Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPersons.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className="font-semibold">
                          {person.fullName}
                        </TableCell>
                        <TableCell>{person.email || "—"}</TableCell>
                        <TableCell>{person.department || "—"}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              person.status === "active"
                                ? "bg-emerald-100 text-emerald-700"
                                : person.status === "on_leave"
                                ? "bg-blue-100 text-blue-700"
                                : person.status === "suspended"
                                ? "bg-amber-100 text-amber-700"
                                : person.status === "resigned"
                                ? "bg-purple-100 text-purple-700"
                                : person.status === "terminated"
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {person.status === "active"
                              ? "Active"
                              : person.status === "inactive"
                              ? "Inactive"
                              : person.status === "on_leave"
                              ? "On Leave"
                              : person.status === "suspended"
                              ? "Suspended"
                              : person.status === "resigned"
                              ? "Resigned"
                              : person.status === "terminated"
                              ? "Terminated"
                              : person.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openView(person)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openKpi(person)}
                          >
                            <BarChart3 className="mr-1 h-4 w-4" />
                            KPI
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(person)}
                          >
                            <Edit className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(person)}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Create Employee</DialogTitle>
            <DialogDescription>
              Add a new employee profile with complete details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <EmployeeProfileFormFields idPrefix="create" variant="full" />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingEmployee(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>
              Update the selected employee profile.
            </DialogDescription>
          </DialogHeader>
          {isEditLoading ? (
            <div className="py-8 text-center text-secondary-muted">
              Loading employee details...
            </div>
          ) : editingEmployee ? (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <EmployeeProfileFormFields
                idPrefix="edit"
                employee={editingEmployee}
                variant="full"
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remove Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              {deleteTarget?.fullName || "this profile"} from the list?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ViewEmployeeProfile
        open={viewOpen}
        onOpenChange={setViewOpen}
        employee={viewingEmployee}
        isLoading={isViewLoading}
      />

      <KpiDashboard
        open={kpiOpen}
        onOpenChange={(open) => {
          setKpiOpen(open);
          if (!open) {
            setKpiEmployee(null);
            setIsKpiLoading(false);
          }
        }}
        employee={kpiEmployee}
        isLoading={isKpiLoading}
      />
    </div>
  );
}
