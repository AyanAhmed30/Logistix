"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createPartner,
  getPartners,
  setPartnerStatus,
  updatePartner,
  type Partner,
  type PartnerStatus,
  type PartnerType,
} from "@/app/actions/partners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Edit2, Plus, Power, RefreshCcw, Save } from "lucide-react";

type PartnerFormState = {
  id: string | null;
  name: string;
  partner_type: PartnerType;
  email: string;
  phone: string;
  address: string;
  status: PartnerStatus;
};

const PARTNER_TYPE_OPTIONS: { value: PartnerType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "agent", label: "Agent" },
  { value: "both", label: "Both" },
];

const PARTNER_STATUS_OPTIONS: { value: PartnerStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function createEmptyForm(): PartnerFormState {
  return {
    id: null,
    name: "",
    partner_type: "customer",
    email: "",
    phone: "",
    address: "",
    status: "active",
  };
}

function formatPartnerType(value: PartnerType) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function PartnersPanel() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<PartnerType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PartnerStatus | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<PartnerFormState>(createEmptyForm);
  const [isPending, startTransition] = useTransition();

  const loadPartners = useCallback(
    async (type: PartnerType | "all" = typeFilter, status: PartnerStatus | "all" = statusFilter) => {
      setIsLoading(true);
      try {
        const result = await getPartners(type, status);
        if ("error" in result) {
          setLoadError(result.error || "Failed to load partners.");
          setPartners([]);
        } else {
          setLoadError(null);
          setPartners(result.partners || []);
        }
      } catch {
        setLoadError("Failed to load partners.");
        setPartners([]);
      } finally {
        setIsLoading(false);
      }
    },
    [typeFilter, statusFilter]
  );

  useEffect(() => {
    loadPartners(typeFilter, statusFilter);
  }, [loadPartners, typeFilter, statusFilter]);

  const filteredPartners = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) => {
      return (
        partner.name.toLowerCase().includes(query) ||
        partner.partner_type.toLowerCase().includes(query) ||
        (partner.email || "").toLowerCase().includes(query) ||
        (partner.phone || "").toLowerCase().includes(query)
      );
    });
  }, [partners, searchQuery]);

  function resetForm() {
    setForm(createEmptyForm());
  }

  function openCreateDialog() {
    resetForm();
    setEditorOpen(true);
  }

  function handleEdit(partner: Partner) {
    setForm({
      id: partner.id,
      name: partner.name,
      partner_type: partner.partner_type,
      email: partner.email || "",
      phone: partner.phone || "",
      address: partner.address || "",
      status: partner.status,
    });
    setEditorOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const payload = {
        id: form.id ?? undefined,
        name: form.name,
        partner_type: form.partner_type,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        status: form.status,
      };

      const result = form.id ? await updatePartner(payload) : await createPartner(payload);

      if ("error" in result) {
        toast.error(result.error || "Unable to save partner.");
        return;
      }

      toast.success(form.id ? "Partner updated successfully." : "Partner created successfully.");
      setEditorOpen(false);
      resetForm();
      await loadPartners(typeFilter, statusFilter);
    });
  }

  function handleToggleStatus(partner: Partner) {
    const nextStatus: PartnerStatus = partner.status === "active" ? "inactive" : "active";
    const confirmed = window.confirm(
      nextStatus === "active"
        ? `Activate partner "${partner.name}"?`
        : `Set partner "${partner.name}" as inactive?`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await setPartnerStatus(partner.id, nextStatus);
      if ("error" in result) {
        toast.error(result.error || "Unable to update partner status.");
        return;
      }
      toast.success(nextStatus === "active" ? "Partner activated." : "Partner marked inactive.");
      await loadPartners(typeFilter, statusFilter);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Partners</CardTitle>
              <CardDescription className="mt-1">
                Manage customers, vendors, agents and dual-role partners.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openCreateDialog} disabled={isPending}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => loadPartners(typeFilter, statusFilter)}
                disabled={isLoading}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search partners..."
                className="w-full md:w-80"
              />
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as PartnerType | "all")}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as PartnerStatus | "all")}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-slate-500">
              {isLoading ? "Loading partners..." : `${filteredPartners.length} partner(s)`}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loadError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPartners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      {isLoading ? "Loading partners..." : "No partners found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPartners.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell className="font-medium">{partner.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatPartnerType(partner.partner_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{partner.email || "-"}</TableCell>
                      <TableCell className="text-slate-600">{partner.phone || "-"}</TableCell>
                      <TableCell className="text-slate-600">{partner.address || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={partner.status === "active" ? "" : "text-slate-500"}
                        >
                          {partner.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(partner)}
                            disabled={isPending}
                          >
                            <Edit2 className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleStatus(partner)}
                            disabled={isPending}
                          >
                            <Power className="mr-1 h-3.5 w-3.5" />
                            {partner.status === "active" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Partner" : "Create Partner"}</DialogTitle>
            <DialogDescription>
              Partners are reusable master entities for accounting operations. Use inactive status
              instead of deletion.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="partner-name">Name</Label>
                <Input
                  id="partner-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Enter partner name"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.partner_type}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, partner_type: value as PartnerType }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select partner type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTNER_TYPE_OPTIONS.filter((option) => option.value !== "all").map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-email">Email</Label>
                <Input
                  id="partner-email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="partner@example.com"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-phone">Phone</Label>
                <Input
                  id="partner-phone"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder="+92..."
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="partner-address">Address</Label>
                <Input
                  id="partner-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, address: event.target.value }))
                  }
                  placeholder="Address"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, status: value as PartnerStatus }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 h-4 w-4" />
                {form.id ? (isPending ? "Updating..." : "Update Partner") : isPending ? "Creating..." : "Create Partner"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditorOpen(false);
                  resetForm();
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
