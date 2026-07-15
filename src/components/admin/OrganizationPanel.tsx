"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrganization,
  deleteOrganization,
  getAllOrganizations,
  updateOrganization,
  type Organization,
} from "@/app/actions/organizations";
import { OrganizationCompanyForm } from "@/components/admin/OrganizationCompanyForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2, Edit, PlusCircle, Trash2 } from "lucide-react";

const CREATE_HASH = "#organization-create";
const CREATE_EVENT = "logistix:organization-create";

function formatAddress(organization: Organization) {
  const parts = [
    organization.street,
    organization.street_2,
    organization.city,
    organization.state,
    organization.zip,
    organization.country,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return organization.address || "—";
}

function isCreateHash() {
  if (typeof window === "undefined") return false;
  return window.location.hash === CREATE_HASH;
}

export function OrganizationPanel() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"list" | "create">("list");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOrganization, setEditOrganization] = useState<Organization | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [createStatus, setCreateStatus] = useState<"active" | "inactive">("active");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [createLogoPreview, setCreateLogoPreview] = useState<string | null>(null);
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [editLogoPreview, setEditLogoPreview] = useState<string | null>(null);
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void fetchData();
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const open = isCreateHash();
      setView(open ? "create" : "list");
      window.dispatchEvent(
        new CustomEvent(CREATE_EVENT, { detail: { open } })
      );
    }
    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    window.addEventListener("popstate", syncViewFromHash);
    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
      window.removeEventListener("popstate", syncViewFromHash);
    };
  }, []);

  function resetCreateFormState() {
    setCreateStatus("active");
    setCreateLogoPreview(null);
    setCreateLogoFile(null);
  }

  function resetEditFormState() {
    setEditOrganization(null);
    setEditStatus("active");
    setEditLogoPreview(null);
    setEditLogoFile(null);
  }

  async function fetchData() {
    setIsLoading(true);
    try {
      const result = await getAllOrganizations();
      if ("error" in result) {
        toast.error(result.error || "Unable to load organizations");
        setOrganizations([]);
      } else {
        setOrganizations(result.organizations || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  function notifyCreateView(open: boolean) {
    window.dispatchEvent(new CustomEvent(CREATE_EVENT, { detail: { open } }));
  }

  function openCreate() {
    resetCreateFormState();
    setCreateFormKey((key) => key + 1);
    setView("create");
    notifyCreateView(true);
    if (window.location.hash !== CREATE_HASH) {
      window.history.pushState({ organizationCreate: true }, "", CREATE_HASH);
    }
  }

  function closeCreate(options?: { replace?: boolean }) {
    resetCreateFormState();
    setView("list");
    notifyCreateView(false);
    const target = window.location.pathname + window.location.search;
    if (options?.replace) {
      window.history.replaceState(null, "", target);
    } else if (window.location.hash === CREATE_HASH) {
      window.history.pushState(null, "", target);
    }
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("status", createStatus);
    if (createLogoFile) {
      formData.set("logo_file", createLogoFile);
    }

    startTransition(async () => {
      const result = await createOrganization(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization created successfully");
      closeCreate({ replace: true });
      router.refresh();
      await fetchData();
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editOrganization) return;

    const formData = new FormData(event.currentTarget);
    formData.set("id", editOrganization.id);
    formData.set("status", editStatus);
    if (editLogoFile) {
      formData.set("logo_file", editLogoFile);
    }

    startTransition(async () => {
      const result = await updateOrganization(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization updated successfully");
      setEditOpen(false);
      resetEditFormState();
      router.refresh();
      await fetchData();
    });
  }

  function openEdit(organization: Organization) {
    setEditOrganization(organization);
    setEditStatus(organization.status);
    setEditLogoPreview(organization.logo_url);
    setEditLogoFile(null);
    setEditOpen(true);
  }

  function openDelete(organization: Organization) {
    setDeleteTarget(organization);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteTarget.id);
      const result = await deleteOrganization(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization deleted successfully");
      setDeleteOpen(false);
      setDeleteTarget(null);
      router.refresh();
      await fetchData();
    });
  }

  if (view === "create") {
    return (
      <div className="min-h-[70vh]">
        <form key={`create-org-page-${createFormKey}`} onSubmit={handleCreateSubmit} className="flex flex-col min-h-[70vh]">
          {/* Odoo-style sticky action bar */}
          <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-secondary-muted"
                onClick={() => closeCreate({ replace: true })}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest text-secondary-muted">Companies</p>
                <h1 className="text-lg font-bold text-primary-dark truncate md:text-xl">New Company</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => closeCreate({ replace: true })}
                disabled={isPending}
              >
                Discard
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="flex-1 px-4 py-6 md:px-8 md:py-8 max-w-6xl mx-auto w-full">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 md:p-8">
              <OrganizationCompanyForm
                key={`create-page-${createFormKey}`}
                mode="create"
                layout="page"
                status={createStatus}
                onStatusChange={setCreateStatus}
                logoPreview={createLogoPreview}
                onLogoPreviewChange={setCreateLogoPreview}
                onLogoFileChange={setCreateLogoFile}
              />
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organizations
            </CardTitle>
          </div>
          <Button onClick={openCreate} className="create-console-btn">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Organization
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">Loading organizations...</div>
          ) : organizations.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No organizations found. Create your first organization to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((organization) => (
                    <TableRow key={organization.id}>
                      <TableCell className="font-semibold">{organization.organization_name}</TableCell>
                      <TableCell>{organization.email}</TableCell>
                      <TableCell>{organization.phone}</TableCell>
                      <TableCell>{formatAddress(organization)}</TableCell>
                      <TableCell>{organization.username}</TableCell>
                      <TableCell className="text-secondary-muted">
                        {new Date(organization.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{organization.status}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(organization)}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDelete(organization)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
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
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) resetEditFormState();
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update organization details and login credentials.</DialogDescription>
          </DialogHeader>
          <form key={editOrganization?.id ?? "edit-org-form"} onSubmit={handleEditSubmit}>
            <OrganizationCompanyForm
              key={editOrganization?.id ?? "edit-org-form"}
              mode="edit"
              layout="compact"
              organization={editOrganization}
              status={editStatus}
              onStatusChange={setEditStatus}
              logoPreview={editLogoPreview}
              onLogoPreviewChange={setEditLogoPreview}
              onLogoFileChange={setEditLogoFile}
            />
            <DialogFooter className="pt-4">
              <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Delete {deleteTarget?.organization_name}? This will remove the organization and its login
              credentials.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
