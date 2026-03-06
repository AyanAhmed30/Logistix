"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createLead, getAllLeadsForSalesAgent, updateLead, deleteLead, type Lead } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PlusCircle, Edit, Trash2, Search, X } from "lucide-react";

export function LeadPanel() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteLeadTarget, setDeleteLeadTarget] = useState<Lead | null>(null);
  const [source, setSource] = useState<string>("");
  const [editSource, setEditSource] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setIsLoading(true);
    try {
      const result = await getAllLeadsForSalesAgent();
      if ("error" in result) {
        toast.error(result.error || "Unable to load leads");
        setLeads([]);
      } else {
        setLeads(result.leads || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const number = String(formData.get("number") || "").trim();
    const city = String(formData.get("city") || "").trim();

    // Only number and source are required
    if (!number || !source) {
      toast.error("Number and source are required");
      return;
    }

    // Add source to formData
    formData.set("source", source);

    // City is optional; it will be available in formData for future use if needed
    formData.set("city", city);

    startTransition(async () => {
      const result = await createLead(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Lead created successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setCreateOpen(false);
      form.reset();
      setSource("");
      router.refresh();
      fetchLeads();
    });
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editLead) return;
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editLead.id);
    const number = String(formData.get("number") || "").trim();

    if (!number || !editSource) {
      toast.error("Number and source are required");
      return;
    }

    formData.set("source", editSource);

    startTransition(async () => {
      const result = await updateLead(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Lead updated successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditLead(null);
      setEditSource("");
      router.refresh();
      fetchLeads();
    });
  }

  function handleDelete() {
    if (!deleteLeadTarget) return;
    startTransition(async () => {
      const result = await deleteLead(deleteLeadTarget.id);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("Lead deleted successfully", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteLeadTarget(null);
      router.refresh();
      fetchLeads();
    });
  }

  function openEdit(lead: Lead) {
    setEditLead(lead);
    setEditSource(lead.source);
    setEditOpen(true);
  }

  function openDelete(lead: Lead) {
    setDeleteLeadTarget(lead);
    setDeleteOpen(true);
  }

  const totalLeads = leads.length;
  const convertedLeads = leads.filter((l) => l.converted).length;

  // Filter leads based on search query
  const filteredLeads = searchQuery.trim()
    ? leads.filter((lead) =>
        lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.source.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : leads;

  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>Leads</CardTitle>
              {totalLeads > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary text-white text-xs">
                  {totalLeads}
                </span>
              )}
            </div>
            <CardDescription>
              Manage your leads. Add new leads and track their information.
              {totalLeads > 0 && (
                <> ({convertedLeads} converted)</>
              )}
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="create-console-btn">
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Lead
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none" />
              <Input
                type="text"
                placeholder="Search leads by name, number, or source..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-8 h-9 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="h-3.5 w-3.5 text-secondary-muted" />
                </Button>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading leads...
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              {searchQuery.trim() ? "No leads found matching your search." : "No leads found. Create your first lead to get started."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-semibold">{lead.name}</TableCell>
                      <TableCell>{lead.number}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm">
                          {lead.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(lead.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {lead.converted ? (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs">
                            Converted
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md text-xs">
                            Active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(lead)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDelete(lead)}
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

      {/* Create Lead Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setSource("");
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              Add a new lead with their contact information and source.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input id="lead-name" name="name" placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-number">Number *</Label>
              <Input id="lead-number" name="number" placeholder="+1 234 567 8900" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-city">City</Label>
              <Input id="lead-city" name="city" placeholder="City" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-source">Source *</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id="lead-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Meta">Meta</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setSource("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Creating..." : "Done"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) {
          setEditLead(null);
          setEditSource("");
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>Update lead information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-lead-name">Name *</Label>
              <Input 
                id="edit-lead-name" 
                name="name" 
                defaultValue={editLead?.name || ""} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-number">Number *</Label>
              <Input 
                id="edit-lead-number" 
                name="number" 
                defaultValue={editLead?.number || ""} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-lead-source">Source *</Label>
              <Select value={editSource} onValueChange={setEditSource}>
                <SelectTrigger id="edit-lead-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Meta">Meta</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Others">Others</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditLead(null);
                  setEditSource("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="create-console-btn">
                {isPending ? "Updating..." : "Update Lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteLeadTarget?.name}&quot;? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteLeadTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
