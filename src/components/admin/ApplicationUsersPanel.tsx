"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  getApplicationUserAgentCounts,
  getApplicationUserDetail,
  listApplicationUsers,
  reassignApplicationUserSalesAgent,
  type ApplicationUserDetail,
  type ApplicationUserListItem,
  type SalesAgentUserCount,
} from "@/app/actions/application-users";
import { getAllSalesAgents, type SalesAgent } from "@/app/actions/sales_agents";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Filter, Search, Smartphone, Users } from "lucide-react";

type ViewMode = "list" | "detail";

export function ApplicationUsersPanel() {
  const [view, setView] = useState<ViewMode>("list");
  const [users, setUsers] = useState<ApplicationUserListItem[]>([]);
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [counts, setCounts] = useState<SalesAgentUserCount[]>([]);
  const [total, setTotal] = useState(0);
  const [unassigned, setUnassigned] = useState(0);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ApplicationUserDetail | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string>("none");
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    const [listRes, countRes, agentsRes] = await Promise.all([
      listApplicationUsers({
        salesAgentId: agentFilter === "all" ? null : agentFilter,
        search,
      }),
      getApplicationUserAgentCounts(),
      getAllSalesAgents(),
    ]);

    if ("error" in listRes && listRes.error) {
      toast.error(listRes.error);
      setUsers([]);
    } else if ("users" in listRes && listRes.users) {
      setUsers(listRes.users);
    }

    if ("error" in countRes && countRes.error) {
      // non-fatal for list
    } else if ("byAgent" in countRes && countRes.byAgent) {
      setCounts(countRes.byAgent);
      setTotal(countRes.total ?? 0);
      setUnassigned(countRes.unassigned ?? 0);
    }

    if ("error" in agentsRes && agentsRes.error) {
      // ignore — filter still works from counts
    } else if ("salesAgents" in agentsRes && agentsRes.salesAgents) {
      setAgents(agentsRes.salesAgents as SalesAgent[]);
    }

    setLoading(false);
  }, [agentFilter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const countById = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of counts) map.set(c.salesAgentId, c.userCount);
    return map;
  }, [counts]);

  async function openDetail(userId: string) {
    startTransition(async () => {
      const res = await getApplicationUserDetail(userId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("user" in res && res.user) {
        setDetail(res.user);
        setDetailAgentId(res.user.salespersonId || "none");
        setView("detail");
      }
    });
  }

  function handleSaveReassignment() {
    if (!detail) return;
    const next = detailAgentId === "none" ? null : detailAgentId;
    if ((detail.salespersonId || null) === next) {
      toast.message("No change to Sales Agent.");
      return;
    }
    setConfirmOpen(true);
  }

  function confirmReassignment() {
    if (!detail) return;
    const next = detailAgentId === "none" ? null : detailAgentId;
    startTransition(async () => {
      const res = await reassignApplicationUserSalesAgent({
        userId: detail.userId,
        contactId: detail.contactId,
        salesAgentId: next,
      });
      setConfirmOpen(false);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Sales Agent updated");
      const refreshed = await getApplicationUserDetail(detail.userId);
      if ("user" in refreshed && refreshed.user) {
        setDetail(refreshed.user);
        setDetailAgentId(refreshed.user.salespersonId || "none");
      }
      await loadList();
    });
  }

  if (view === "detail" && detail) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setView("list");
              setDetail(null);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Button>
          <div>
            <h3 className="text-lg font-semibold text-primary-dark">{detail.name}</h3>
            <p className="text-xs text-secondary-muted">
              Mobile application customer
              {detail.leadIdFormatted ? ` · ID ${detail.leadIdFormatted}` : ""}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First Name" value={detail.firstName || "—"} />
          <Field label="Last Name" value={detail.lastName || "—"} />
          <Field label="Full Name" value={detail.name} />
          <Field label="Phone Number" value={detail.phone || "—"} />
          <Field label="Email" value={detail.email || "—"} />
          <Field
            label="Source"
            value={
              detail.source === "mobile_app" || detail.mobileRegisteredAt
                ? "Mobile App"
                : detail.source || "—"
            }
          />
        </div>

        <div className="rounded-lg border border-slate-200 p-4 space-y-3">
          <Label>Assigned Sales Agent</Label>
          <Select value={detailAgentId} onValueChange={setDetailAgentId}>
            <SelectTrigger className="max-w-md bg-slate-50">
              <SelectValue placeholder="Select Sales Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-secondary-muted">
            Changing this updates the customer&apos;s CRM ownership, inquiry routing, Contacts
            visibility, and the mobile WhatsApp button.
          </p>
          <Button
            type="button"
            onClick={handleSaveReassignment}
            disabled={pending}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            Save assignment
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Sales Agent change</DialogTitle>
              <DialogDescription>
                This manually reassigns the customer. Automatic load balancing will not run.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={confirmReassignment} disabled={pending}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-secondary-muted">
          <Users className="h-4 w-4" />
          <span>
            {total} mobile user{total === 1 ? "" : "s"}
            {unassigned > 0 ? ` · ${unassigned} unassigned` : ""}
          </span>
        </div>

        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-secondary-muted pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email…"
            className="pl-9 h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-secondary-muted shrink-0" />
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 w-[260px] bg-slate-50 border-slate-200">
              <SelectValue placeholder="Sales Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sales Agents ({total})</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} — {countById.get(a.id) ?? 0} users
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead className="font-semibold text-primary-dark">Name</TableHead>
              <TableHead className="font-semibold text-primary-dark">Phone Number</TableHead>
              <TableHead className="font-semibold text-primary-dark">Email</TableHead>
              <TableHead className="font-semibold text-primary-dark">
                Assigned Sales Agent
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-secondary-muted">
                  Loading application users…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-secondary-muted">
                    <Smartphone className="h-10 w-10 text-slate-300" />
                    <p className="text-sm font-medium">No mobile application users yet</p>
                    <p className="text-xs">
                      Customers appear here after they register in the Logistix mobile app.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow
                  key={u.userId}
                  className="cursor-pointer hover:bg-slate-50/80"
                  onClick={() => void openDetail(u.userId)}
                >
                  <TableCell className="font-medium text-primary-dark">
                    <div className="flex flex-col gap-0.5">
                      <span>{u.name}</span>
                      <span className="inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-100">
                        Mobile App
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-secondary-muted">{u.phone || "—"}</TableCell>
                  <TableCell className="text-secondary-muted">{u.email || "—"}</TableCell>
                  <TableCell className="text-secondary-muted">
                    {u.salespersonName || "Unassigned"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-secondary-muted">{label}</Label>
      <p className="mt-1 font-medium text-primary-dark">{value}</p>
    </div>
  );
}
