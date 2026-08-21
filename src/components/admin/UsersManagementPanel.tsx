"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createPortalUser,
  deletePortalUser,
  getOrganizationPortalUsers,
  getPortalUserActivityLogs,
  getPortalUsers,
  updatePortalUser,
  type PortalUser,
  type PortalUserActivityLog,
  type PortalUserRole,
} from "@/app/actions/user";
import { getAllOrganizations, type Organization } from "@/app/actions/organizations";
import {
  MODULE_PERMISSION_GROUPS,
  SALES_ACCESS_LEVEL_OPTIONS,
  ACCOUNTING_ACCESS_LEVEL_OPTIONS,
  applySalesAccessLevel,
  applyAccountingAccessLevel,
  getSalesAccessLevel,
  getAccountingAccessLevel,
  toFormPermissionKeys,
  type ModuleDepartment,
  type SalesAccessLevel,
  type AccountingAccessLevel,
} from "@/lib/module-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { PortalUserActivityPanel } from "@/components/admin/PortalUserActivityPanel";

const CREATE_HASH = "#user-create";
const PROFILE_HASH_PREFIX = "#user-profile/";
const CREATE_EVENT = "logistix:user-create";

type ViewMode = "list" | "form";
type FormMode = "create" | "view" | "edit";

type FormSnapshot = {
  fullName: string;
  email: string;
  phone: string;
  username: string;
  role: PortalUserRole;
  companyIds: string[];
  defaultOrganizationId: string;
  selectedPermissions: string[];
};

function isCreateHash() {
  if (typeof window === "undefined") return false;
  return window.location.hash === CREATE_HASH;
}

function parseProfileUserId(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith(PROFILE_HASH_PREFIX)) return null;
  const id = hash.slice(PROFILE_HASH_PREFIX.length).trim();
  return id || null;
}

function profileHashFor(userId: string) {
  return `${PROFILE_HASH_PREFIX}${userId}`;
}

function notifyUserFormOpen(open: boolean) {
  window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: { open } }));
}

function roleLabel(user: Pick<PortalUser, "role">) {
  return user.role === "admin" ? "Administrator" : "User";
}

function userListKey(user: PortalUser) {
  return user.id;
}

export function UsersManagementPanel({
  organizationScoped = false,
}: {
  organizationScoped?: boolean;
}) {
  const { organizationId, organizationName, switchVersion, organizations: sessionOrganizations } =
    useAdminOrganization();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingUser, setEditingUser] = useState<PortalUser | null>(null);
  const [formSnapshot, setFormSnapshot] = useState<FormSnapshot | null>(null);
  const [activityLogs, setActivityLogs] = useState<PortalUserActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PortalUser | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PortalUserRole>("user");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [defaultOrganizationId, setDefaultOrganizationId] = useState<string>("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [expandedDepartments, setExpandedDepartments] = useState<Record<ModuleDepartment, boolean>>({
    sales: true,
    crm: true,
    accounting: true,
    operations: true,
    warehouse: true,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    if (organizationScoped) {
      const usersResult = await getOrganizationPortalUsers();
      if ("error" in usersResult && usersResult.error && !("users" in usersResult)) {
        toast.error(usersResult.error);
        setUsers([]);
      } else if ("users" in usersResult) {
        setUsers(usersResult.users ?? []);
      }
      setIsLoading(false);
      return;
    }

    const [usersResult, orgsResult] = await Promise.all([getPortalUsers(), getAllOrganizations()]);
    if ("error" in usersResult && usersResult.error && !("users" in usersResult)) {
      toast.error(usersResult.error);
      setUsers([]);
    } else if ("users" in usersResult) {
      setUsers(usersResult.users ?? []);
    }
    if ("error" in orgsResult && orgsResult.error) {
      toast.error(orgsResult.error);
      setOrganizations([]);
    } else if ("organizations" in orgsResult) {
      setOrganizations(orgsResult.organizations ?? []);
    }
    setIsLoading(false);
  }, [organizationScoped]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, switchVersion]);

  /** Organizations the org admin may assign (from session switcher — not derived from existing users). */
  const assignableCompanies = useMemo(() => {
    if (!organizationScoped) return organizations;
    return sessionOrganizations.map((org) => ({
      id: org.id,
      organization_name: org.organization_name,
    })) as Organization[];
  }, [organizationScoped, organizations, sessionOrganizations]);

  const assignableCompanyIds = useMemo(
    () => new Set(assignableCompanies.map((org) => org.id)),
    [assignableCompanies]
  );

  const isReadOnly = formMode === "view";
  const isCreating = formMode === "create";
  const showActivityPanel = Boolean(editingUser);

  async function loadActivityLogs(userId: string, append = false) {
    if (append) setActivityLoadingMore(true);
    else setActivityLoading(true);

    const result = await getPortalUserActivityLogs(userId, {
      limit: 30,
      offset: append ? activityLogs.length : 0,
    });

    if (append) setActivityLoadingMore(false);
    else setActivityLoading(false);

    if ("error" in result && result.error) return;
    if ("logs" in result) {
      const nextLogs = result.logs ?? [];
      setActivityLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
      setActivityHasMore(Boolean(result.hasMore));
    }
  }

  function captureFormSnapshot(): FormSnapshot {
    return {
      fullName,
      email,
      phone,
      username,
      role,
      companyIds: [...companyIds],
      defaultOrganizationId,
      selectedPermissions: [...selectedPermissions],
    };
  }

  function applyFormSnapshot(snapshot: FormSnapshot) {
    setFullName(snapshot.fullName);
    setEmail(snapshot.email);
    setPhone(snapshot.phone);
    setUsername(snapshot.username);
    setRole(snapshot.role);
    setCompanyIds(snapshot.companyIds);
    setDefaultOrganizationId(snapshot.defaultOrganizationId);
    setSelectedPermissions(snapshot.selectedPermissions);
    setPassword("");
  }

  function populateFormFromUser(user: PortalUser) {
    setFullName(user.full_name);
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setUsername(user.username);
    setPassword("");
    setRole(user.role);
    const ids = user.companies
      .map((c) => c.id)
      .filter((id) => !organizationScoped || assignableCompanyIds.has(id));
    setCompanyIds(ids.length > 0 ? ids : organizationId ? [organizationId] : []);
    setDefaultOrganizationId(
      user.default_organization_id && ids.includes(user.default_organization_id)
        ? user.default_organization_id
        : organizationScoped && organizationId
          ? organizationId
          : ids[0] || ""
    );
    setSelectedPermissions(toFormPermissionKeys(user.permissions || []));
  }

  function applyOrganizationScopeDefaults() {
    if (!organizationScoped || !organizationId) return;
    setCompanyIds([organizationId]);
    setDefaultOrganizationId(organizationId);
  }

  function resetFormForCreate() {
    resetForm();
    applyOrganizationScopeDefaults();
  }

  useEffect(() => {
    if (!organizationScoped || view !== "form" || editingUser || !organizationId) return;
    setCompanyIds((prev) => {
      const valid = prev.filter((id) => assignableCompanyIds.has(id));
      if (valid.length > 0) return valid;
      return [organizationId];
    });
    setDefaultOrganizationId((prev) => {
      if (prev && assignableCompanyIds.has(prev)) return prev;
      return organizationId;
    });
  }, [
    organizationScoped,
    view,
    editingUser,
    organizationId,
    switchVersion,
    assignableCompanyIds,
  ]);

  useEffect(() => {
    function syncViewFromHash() {
      if (isCreateHash()) {
        setEditingUser(null);
        setFormMode("create");
        resetFormForCreate();
        setView("form");
        notifyUserFormOpen(true);
        return;
      }

      const profileId = parseProfileUserId();
      if (profileId) {
        notifyUserFormOpen(true);
        return;
      }

      setEditingUser(null);
      setFormMode("create");
      setFormSnapshot(null);
      setActivityLogs([]);
      resetForm();
      setView("list");
      notifyUserFormOpen(false);
    }
    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    window.addEventListener("popstate", syncViewFromHash);
    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
      window.removeEventListener("popstate", syncViewFromHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const profileId = parseProfileUserId();
    if (!profileId || isLoading) return;
    const user = users.find((entry) => entry.id === profileId);
    if (!user) return;
    if (editingUser?.id === profileId && view === "form") return;
    applyProfileState(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, isLoading]);

  function resetForm() {
    setFullName("");
    setEmail("");
    setPhone("");
    setUsername("");
    setPassword("");
    setRole("user");
    setCompanyIds([]);
    setDefaultOrganizationId("");
    setSelectedPermissions([]);
  }

  function openCreate() {
    setEditingUser(null);
    setFormMode("create");
    setFormSnapshot(null);
    setActivityLogs([]);
    resetFormForCreate();
    setView("form");
    notifyUserFormOpen(true);
    if (window.location.hash !== CREATE_HASH) {
      window.history.pushState({ userCreate: true }, "", CREATE_HASH);
    }
  }

  function applyProfileState(user: PortalUser) {
    setEditingUser(user);
    populateFormFromUser(user);
    setFormSnapshot({
      fullName: user.full_name,
      email: user.email || "",
      phone: user.phone || "",
      username: user.username,
      role: user.role,
      companyIds: user.companies
        .map((c) => c.id)
        .filter((id) => !organizationScoped || assignableCompanyIds.has(id)),
      defaultOrganizationId:
        user.default_organization_id ||
        (organizationScoped && organizationId ? organizationId : user.companies[0]?.id || ""),
      selectedPermissions: toFormPermissionKeys(user.permissions || []),
    });
    setFormMode("view");
    setView("form");
    void loadActivityLogs(user.id);
  }

  function openProfile(user: PortalUser) {
    const target = profileHashFor(user.id);
    if (window.location.hash !== target) {
      window.history.pushState({ userProfile: user.id }, "", target);
    }
    applyProfileState(user);
    notifyUserFormOpen(true);
  }

  function startEdit() {
    setFormSnapshot(captureFormSnapshot());
    setFormMode("edit");
  }

  function cancelEdit() {
    if (formSnapshot) applyFormSnapshot(formSnapshot);
    else if (editingUser) populateFormFromUser(editingUser);
    setPassword("");
    setFormMode("view");
  }

  function backToList() {
    setEditingUser(null);
    setFormMode("create");
    setFormSnapshot(null);
    setActivityLogs([]);
    resetForm();
    setView("list");
    const target = window.location.pathname + window.location.search;
    if (isCreateHash() || parseProfileUserId()) {
      window.history.replaceState(null, "", target);
    }
    notifyUserFormOpen(false);
  }

  function toggleCompany(orgId: string, checked: boolean) {
    setCompanyIds((prev) => {
      const next = checked ? [...prev, orgId] : prev.filter((id) => id !== orgId);
      if (next.length === 1) {
        setDefaultOrganizationId(next[0]);
      } else if (!next.includes(defaultOrganizationId)) {
        setDefaultOrganizationId(next[0] || "");
      }
      return next;
    });
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) => {
      const haystack = [
        user.full_name,
        user.username,
        user.email || "",
        roleLabel(user),
        ...user.companies.map((c) => c.organization_name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [users, search]);

  const assignedCompanies = useMemo(
    () => assignableCompanies.filter((org) => companyIds.includes(org.id)),
    [assignableCompanies, companyIds]
  );

  function resolveSubmitCompanyIds(): string[] {
    const valid = companyIds.filter((id) =>
      organizationScoped ? assignableCompanyIds.has(id) : true
    );
    if (valid.length > 0) return valid;
    if (organizationScoped && organizationId) return [organizationId];
    return [];
  }

  function toggleChildPermission(key: string, checked: boolean) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);

      for (const group of MODULE_PERMISSION_GROUPS) {
        if (group.department === "sales" || group.department === "accounting") continue;
        const childKeys = group.modules.map((m) => m.key);
        if (childKeys.length === 0) continue;
        const allSelected = childKeys.every((k) => next.has(k));
        if (allSelected) next.add(group.department);
        else next.delete(group.department);
      }

      return [...next];
    });
  }

  function toggleDepartment(department: ModuleDepartment, checked: boolean) {
    if (department === "sales") {
      setSalesAccessLevel(checked ? "all" : "no");
      return;
    }
    if (department === "accounting") {
      setAccountingAccessLevel(checked ? "accountant" : "no");
      return;
    }

    const group = MODULE_PERMISSION_GROUPS.find((g) => g.department === department);
    if (!group) return;
    const childKeys = group.modules.map((m) => m.key);

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(department);
        for (const key of childKeys) next.add(key);
      } else {
        next.delete(department);
        for (const key of childKeys) next.delete(key);
      }
      return [...next];
    });
    setExpandedDepartments((prev) => ({ ...prev, [department]: true }));
  }

  function setSalesAccessLevel(level: SalesAccessLevel) {
    setSelectedPermissions((prev) => applySalesAccessLevel(prev, level));
    setExpandedDepartments((prev) => ({ ...prev, sales: true }));
  }

  function setAccountingAccessLevel(level: AccountingAccessLevel) {
    setSelectedPermissions((prev) => applyAccountingAccessLevel(prev, level));
    setExpandedDepartments((prev) => ({ ...prev, accounting: true }));
  }

  function departmentCheckboxState(department: ModuleDepartment): boolean | "indeterminate" {
    if (department === "sales") {
      return getSalesAccessLevel(selectedPermissions) !== "no";
    }
    if (department === "accounting") {
      return getAccountingAccessLevel(selectedPermissions) !== "no";
    }
    const group = MODULE_PERMISSION_GROUPS.find((g) => g.department === department);
    if (!group) return false;
    const childKeys = group.modules.map((m) => m.key);
    const selectedCount = childKeys.filter((k) => selectedPermissions.includes(k)).length;
    if (selectedCount === 0) return false;
    if (selectedCount === childKeys.length) return true;
    return "indeterminate";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) return;
    const submitCompanyIds = resolveSubmitCompanyIds();
    if (submitCompanyIds.length === 0) {
      toast.error("Assign at least one company");
      return;
    }
    const defaultId =
      submitCompanyIds.length === 1
        ? submitCompanyIds[0]
        : defaultOrganizationId && submitCompanyIds.includes(defaultOrganizationId)
          ? defaultOrganizationId
          : submitCompanyIds[0];
    if (!defaultId || !submitCompanyIds.includes(defaultId)) {
      toast.error("Select a default company from the assigned companies");
      return;
    }
    const hasModule =
      getSalesAccessLevel(selectedPermissions) !== "no" ||
      selectedPermissions.some((k) =>
        MODULE_PERMISSION_GROUPS.some(
          (g) =>
            g.department !== "sales" &&
            (g.department === k || g.modules.some((m) => m.key === k))
        )
      );
    if (role === "user" && !hasModule) {
      toast.error("Assign at least one module under Sales, CRM, Operations, and/or Warehouse");
      return;
    }

    const formData = new FormData();
    if (editingUser) formData.set("id", editingUser.id);
    formData.set("full_name", fullName.trim());
    formData.set("email", email.trim());
    formData.set("phone", phone.trim());
    formData.set("username", username.trim());
    formData.set("password", password);
    formData.set("role", role);
    formData.set("company_ids", JSON.stringify(submitCompanyIds));
    formData.set("default_organization_id", defaultId);
    formData.set("permissions", JSON.stringify(selectedPermissions));

    startTransition(async () => {
      const result = editingUser
        ? await updatePortalUser(formData)
        : await createPortalUser(formData);
      if ("error" in result && result.error) {
        toast.error(result.error, { duration: 12000 });
        return;
      }
      toast.success(
        "message" in result && typeof result.message === "string"
          ? result.message
          : editingUser
            ? "User updated"
            : "User created successfully."
      );
      await fetchData();
      if (editingUser && formMode === "edit") {
        const updatedUser =
          "user" in result && result.user
            ? result.user
            : users.find((entry) => entry.id === editingUser.id) || editingUser;
        setEditingUser(updatedUser);
        populateFormFromUser(updatedUser);
        setFormSnapshot({
          fullName: updatedUser.full_name,
          email: updatedUser.email || "",
          phone: updatedUser.phone || "",
          username: updatedUser.username,
          role: updatedUser.role,
          companyIds: updatedUser.companies.map((c) => c.id),
          defaultOrganizationId: updatedUser.default_organization_id || updatedUser.companies[0]?.id || "",
          selectedPermissions: toFormPermissionKeys(updatedUser.permissions || []),
        });
        setFormMode("view");
        void loadActivityLogs(updatedUser.id);
        return;
      }
      backToList();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const formData = new FormData();
    formData.set("id", deleteTarget.id);
    startTransition(async () => {
      const result = await deletePortalUser(formData);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("User deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchData();
    });
  }

  if (view === "form") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={backToList} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Users
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                {isCreating ? "New User" : editingUser?.full_name || "User Profile"}
              </h1>
              <p className="text-sm text-slate-500">
                {isCreating
                  ? "Create login credentials, role, and company access."
                  : isReadOnly
                    ? "View user details and activity history."
                    : "Edit user details, access, and organizations."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {isCreating ? (
              <>
                <Button type="button" variant="outline" onClick={backToList} disabled={isPending}>
                  Discard
                </Button>
                <Button type="submit" form="portal-user-form" disabled={isPending}>
                  {isPending ? "Saving..." : "Save"}
                </Button>
              </>
            ) : isReadOnly ? (
              <Button type="button" onClick={startEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={cancelEdit} disabled={isPending}>
                  Cancel
                </Button>
                <Button type="submit" form="portal-user-form" disabled={isPending}>
                  {isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className={`grid gap-6 ${showActivityPanel ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <form id="portal-user-form" onSubmit={handleSubmit} className="space-y-8 min-w-0">
          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Basic Information
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  required={!isReadOnly}
                  readOnly={isReadOnly}
                  disabled={isReadOnly}
                  className="max-w-xl text-lg font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@company.com"
                  readOnly={isReadOnly}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  readOnly={isReadOnly}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  required={!isReadOnly}
                  readOnly={isReadOnly}
                  disabled={isReadOnly}
                  autoComplete="off"
                />
              </div>
              {!isReadOnly && (
              <div className="space-y-2 md:col-span-2 max-w-md">
                <Label htmlFor="password">
                  Password {editingUser ? "(leave blank to keep current)" : "*"}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={isCreating}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
              )}
              {editingUser && isReadOnly ? (
                <div className="space-y-2 md:col-span-2">
                  <Label>Created</Label>
                  <p className="text-sm text-slate-700">
                    {new Date(editingUser.created_at).toLocaleString()}
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Role
            </h2>
            <div className="space-y-2 max-w-sm">
              <Label>Role</Label>
              {isReadOnly ? (
                <p className="text-sm font-medium text-slate-900">{roleLabel({ role })}</p>
              ) : (
              <Select value={role} onValueChange={(value: PortalUserRole) => setRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
              )}
              <p className="text-xs text-slate-500">
                Module access is configured in Module Access below.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6 space-y-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Companies
            </h2>
            {organizationScoped && (
              <p className="text-sm text-slate-600">
                Assign companies from your organization access. Working in{" "}
                <span className="font-semibold text-slate-900">
                  {organizationName || "current organization"}
                </span>
                .
              </p>
            )}
            {assignableCompanies.length === 0 ? (
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {organizationScoped
                  ? "No assignable companies found for your account."
                  : "No companies found. Create an organization first under Settings → Organization / Company, then assign it here."}
              </div>
            ) : (
              <div className="space-y-3 max-w-xl">
                {assignableCompanies.map((org) => {
                  const checked = companyIds.includes(org.id);
                  return (
                    <label
                      key={org.id}
                      className={`flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 ${
                        isReadOnly ? "bg-slate-50" : "hover:bg-slate-50 cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={isReadOnly}
                        onCheckedChange={(value) => toggleCompany(org.id, value === true)}
                      />
                      <span className="text-sm font-medium text-slate-800">
                        {org.organization_name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="space-y-2 max-w-sm pt-2">
              <Label>Default Company *</Label>
              <Select
                value={defaultOrganizationId || undefined}
                onValueChange={setDefaultOrganizationId}
                disabled={isReadOnly || assignedCompanies.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select default company" />
                </SelectTrigger>
                <SelectContent>
                  {assignedCompanies.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.organization_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                Default company must be one of the companies assigned above.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 md:p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Module Access
              </h2>
              <p className="text-sm text-slate-500">
                Sales and Accounting use Odoo-style access levels. Assigning Sales
                also grants Contacts and CRM. Other modules still use parent/child
                checkboxes.
              </p>
            </div>

            <div className="space-y-4 max-w-2xl">
              {MODULE_PERMISSION_GROUPS.map((group) => {
                if (group.department === "sales") {
                  const level = getSalesAccessLevel(selectedPermissions);
                  return (
                    <div
                      key={group.department}
                      className="rounded-md border border-slate-200 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                        <span className="text-sm font-semibold text-slate-800 min-w-[4.5rem]">
                          {group.label}
                        </span>
                        <Select
                          value={level}
                          disabled={isReadOnly}
                          onValueChange={(v) =>
                            setSalesAccessLevel(v as SalesAccessLevel)
                          }
                        >
                          <SelectTrigger className="h-9 w-full max-w-xs bg-white">
                            <SelectValue placeholder="No" />
                          </SelectTrigger>
                          <SelectContent>
                            {SALES_ACCESS_LEVEL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {level !== "no" ? (
                        <p className="px-3 py-2 text-xs text-slate-500">
                          Contacts and CRM are included automatically with Sales access.
                        </p>
                      ) : null}
                    </div>
                  );
                }

                if (group.department === "accounting") {
                  const level = getAccountingAccessLevel(selectedPermissions);
                  return (
                    <div
                      key={group.department}
                      className="rounded-md border border-slate-200 overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                        <span className="text-sm font-semibold text-slate-800 min-w-[4.5rem]">
                          {group.label}
                        </span>
                        <Select
                          value={level}
                          disabled={isReadOnly}
                          onValueChange={(v) =>
                            setAccountingAccessLevel(v as AccountingAccessLevel)
                          }
                        >
                          <SelectTrigger className="h-9 w-full max-w-xs bg-white">
                            <SelectValue placeholder="No Access" />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCOUNTING_ACCESS_LEVEL_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {level !== "no" ? (
                        <p className="px-3 py-2 text-xs text-slate-500">
                          {level === "billing"
                            ? "Can view customers, create invoices, and register payments."
                            : level === "accountant"
                              ? "Full invoices, payments, reports, credit notes, and refunds."
                              : "Full Accounting access including automation settings."}
                        </p>
                      ) : null}
                    </div>
                  );
                }

                const childKeys = group.modules.map((m) => m.key);
                const selectedCount = childKeys.filter((k) =>
                  selectedPermissions.includes(k)
                ).length;
                const parentState = departmentCheckboxState(group.department);
                const isExpanded = expandedDepartments[group.department];
                const salesLocksCrm =
                  group.department === "crm" &&
                  getSalesAccessLevel(selectedPermissions) !== "no";

                return (
                  <div
                    key={group.department}
                    className="rounded-md border border-slate-200 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-200/70"
                        onClick={() =>
                          setExpandedDepartments((prev) => ({
                            ...prev,
                            [group.department]: !prev[group.department],
                          }))
                        }
                        aria-label={isExpanded ? "Collapse" : "Expand"}
                        disabled={false}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <label className="flex flex-1 items-center gap-2.5 cursor-pointer min-w-0">
                        <Checkbox
                          checked={
                            parentState === "indeterminate" ? "indeterminate" : parentState
                          }
                          disabled={isReadOnly || salesLocksCrm}
                          onCheckedChange={(value) =>
                            toggleDepartment(group.department, value === true)
                          }
                        />
                        <span className="text-sm font-semibold text-slate-800">{group.label}</span>
                        <span className="text-xs text-slate-500">
                          {selectedCount}/{childKeys.length}
                          {salesLocksCrm ? " · via Sales" : ""}
                        </span>
                      </label>
                    </div>

                    {isExpanded && (
                      <div className="grid gap-1 p-3 sm:grid-cols-2">
                        {group.modules.map((module) => {
                          const checked =
                            selectedPermissions.includes(module.key) || salesLocksCrm;
                          return (
                            <label
                              key={`${group.department}:${module.key}`}
                              className="flex items-center gap-2.5 rounded-md pl-8 pr-2.5 py-2 hover:bg-slate-50 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                disabled={isReadOnly || salesLocksCrm}
                                onCheckedChange={(value) =>
                                  toggleChildPermission(module.key, value === true)
                                }
                              />
                              <span className="text-sm text-slate-800">{module.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </form>

        {showActivityPanel && editingUser ? (
          <PortalUserActivityPanel
            logs={activityLogs}
            isLoading={activityLoading}
            hasMore={activityHasMore}
            isLoadingMore={activityLoadingMore}
            onLoadMore={() => void loadActivityLogs(editingUser.id, true)}
          />
        ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-md border border-b-0 border-slate-200 bg-[#714B67] px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 opacity-90" />
          <span className="text-sm font-semibold tracking-wide">Users</span>
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs">
            {filteredUsers.length}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          className="bg-white text-[#714B67] hover:bg-white/90 gap-1.5 h-8"
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      <div className="rounded-b-md border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="border-0 shadow-none focus-visible:ring-0 h-8"
          />
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">Loading users…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-slate-500">
              {search ? "No users match your search." : "No users yet. Create your first user."}
            </p>
            {!search ? (
              <Button type="button" onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Name</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Companies</TableHead>
                <TableHead>Default Company</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const defaultCompany =
                  user.companies.find((c) => c.id === user.default_organization_id)
                    ?.organization_name ||
                  user.companies[0]?.organization_name ||
                  "—";
                return (
                  <TableRow
                    key={userListKey(user)}
                    className="cursor-pointer hover:bg-[#714B67]/5"
                    onClick={() => openProfile(user)}
                  >
                    <TableCell className="font-medium text-slate-900">{user.full_name}</TableCell>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.email || "—"}</TableCell>
                    <TableCell>{roleLabel(user)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {user.companies.map((c) => c.organization_name).join(", ") || "—"}
                    </TableCell>
                    <TableCell>{defaultCompany}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(user);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.full_name || deleteTarget?.username}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
