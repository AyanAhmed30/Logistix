"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Upload, UserCheck, X } from "lucide-react";
import { toast } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  assignLeads,
  getAssignableAgents,
  getLeadDistributionOverview,
  type LeadDistributionOverview,
  type LeadStatusFilter,
} from "@/app/actions/lead-distribution";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { LeadUploadDialog } from "@/components/admin/lead-distribution/LeadUploadDialog";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "—");

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-primary-dark">{title}</p>
      {children ? <div className="mt-1 text-sm text-slate-600">{children}</div> : null}
    </div>
  );
}

function AssignDialog({
  open,
  count,
  onOpenChange,
  onAssign,
}: {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onAssign: (agentId: string, agentName: string) => Promise<void>;
}) {
  const [agents, setAgents] = useState<Array<{ id: string; name: string }> | null>(null);
  const [agentId, setAgentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAgents(null);
    setAgentId("");
    setLoadError(null);
    getAssignableAgents().then((res) => {
      if (cancelled) return;
      if ("error" in res) setLoadError(res.error);
      else setAgents(res.agents);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const agentName = agents?.find((a) => a.id === agentId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign leads</DialogTitle>
          <DialogDescription>
            {count.toLocaleString()} selected lead{count === 1 ? "" : "s"} will appear in the sales agent&apos;s CRM
            pipeline under New, and the agent gets a notification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="assign-agent" className="text-sm font-medium text-primary-dark">
            Sales agent
          </label>
          {loadError ? (
            <p role="alert" className="text-sm text-red-700">
              {loadError}
            </p>
          ) : (
            <Select value={agentId} onValueChange={setAgentId} disabled={!agents || saving}>
              <SelectTrigger id="assign-agent" className="h-9 w-full">
                <SelectValue placeholder={agents ? "Choose a sales agent" : "Loading sales agents…"} />
              </SelectTrigger>
              <SelectContent>
                {(agents ?? []).map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {agents && agents.length === 0 ? (
            <p className="text-xs text-slate-600">This company has no active sales agents.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-[#017e84] text-white hover:bg-[#016970]"
            disabled={!agentId || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onAssign(agentId, agentName);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin stroke-white" aria-hidden /> : <UserCheck className="h-4 w-4 stroke-white" aria-hidden />}
            {saving ? "Assigning…" : agentName ? `Assign to ${agentName}` : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadDistributionPanel() {
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [status, setStatus] = useState<LeadStatusFilter>("unassigned");
  const [agentFilter, setAgentFilter] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const needle = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<LeadDistributionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [skipped, setSkipped] = useState<Array<{ name: string; reason: string }> | null>(null);

  useEffect(() => {
    if (isAdminContext) return;
    let cancelled = false;
    setLoading(true);
    getLeadDistributionOverview({ status, agentId: agentFilter?.id ?? null, search: needle, page })
      .then((res) => {
        if (cancelled) return;
        if ("setupRequired" in res) {
          setSetupRequired(true);
          setError(null);
        } else if ("error" in res) {
          setError(res.error);
        } else {
          setSetupRequired(false);
          setError(null);
          setData(res);
        }
      })
      .catch(() => {
        if (!cancelled) setError("The request failed. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminContext, status, agentFilter, needle, page, refresh, switchVersion]);

  // Selection only holds leads of the current view.
  useEffect(() => setSelected(new Set()), [status, agentFilter, needle, page, switchVersion]);
  useEffect(() => setPage(1), [status, agentFilter, needle]);

  const selectable = useMemo(() => (data?.leads ?? []).filter((l) => l.status === "unassigned"), [data]);
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id));
  const someSelected = selectable.some((l) => selected.has(l.id));
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  if (isAdminContext) {
    return <Message title="Select a company">Choose a company from the header switcher to upload and assign its leads.</Message>;
  }
  if (setupRequired) {
    return (
      <Message title="Lead Distribution is not set up yet">
        It needs its database update (<code>056_lead_distribution.sql</code>). Run it in Supabase, then refresh this page.
      </Message>
    );
  }

  async function handleAssign(agentId: string, agentName: string) {
    const ids = [...selected];
    const res = await assignLeads(ids, agentId);
    if ("setupRequired" in res) {
      setSetupRequired(true);
      setAssignOpen(false);
      return;
    }
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setAssignOpen(false);
    setSelected(new Set());
    setRefresh((n) => n + 1);
    if (res.assigned) toast.success(`${res.assigned} lead${res.assigned === 1 ? "" : "s"} assigned to ${agentName || res.agentName}`);
    setSkipped(res.skipped.length ? res.skipped : null);
  }

  const statusTabs: Array<{ id: LeadStatusFilter; label: string }> = [
    { id: "unassigned", label: `Unassigned (${(data?.counts.unassigned ?? 0).toLocaleString()})` },
    { id: "assigned", label: `Assigned (${(data?.counts.assigned ?? 0).toLocaleString()})` },
    { id: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9 bg-[#017e84] text-white hover:bg-[#016970]" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 stroke-white" aria-hidden />
          Upload leads
        </Button>
        <div role="tablist" aria-label="Lead status" className="flex gap-1 rounded-md border border-slate-200 bg-white p-0.5">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={status === tab.id}
              onClick={() => setStatus(tab.id)}
              className={`rounded-sm px-2.5 py-1 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#017e84] ${
                status === tab.id ? "bg-[#e6f4f5] font-medium text-[#016970]" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 stroke-slate-500" aria-hidden />
          <Input
            type="search"
            aria-label="Search leads"
            placeholder="Search name, phone, email, company"
            className="h-9 bg-white pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {agentFilter ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-[#017e84]/40 bg-[#e6f4f5] px-2 py-1 text-sm text-[#016970]">
            Agent: {agentFilter.name}
            <button
              type="button"
              aria-label="Show all agents"
              onClick={() => setAgentFilter(null)}
              className="rounded-sm p-0.5 hover:bg-white/60"
            >
              <X className="h-3.5 w-3.5 stroke-[#016970]" aria-hidden />
            </button>
          </span>
        ) : null}
        <Button
          variant="outline"
          className="h-9 sm:ml-auto"
          disabled={selected.size === 0}
          onClick={() => setAssignOpen(true)}
        >
          <UserCheck className="h-4 w-4" aria-hidden />
          Assign leads{selected.size ? ` (${selected.size})` : ""}
        </Button>
      </div>

      {skipped ? (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">
              {skipped.length} lead{skipped.length === 1 ? " was" : "s were"} not assigned
            </p>
            <button type="button" aria-label="Dismiss" onClick={() => setSkipped(null)} className="rounded-sm p-0.5 hover:bg-white/60">
              <X className="h-3.5 w-3.5 stroke-amber-800" aria-hidden />
            </button>
          </div>
          <ul className="mt-1 list-disc pl-5">
            {skipped.slice(0, 10).map((s, i) => (
              <li key={`${s.name}-${i}`}>
                {s.name}: {s.reason}
              </li>
            ))}
            {skipped.length > 10 ? <li>and {skipped.length - 10} more</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section aria-label="Leads" className="min-w-0 rounded-lg border border-slate-200 bg-white xl:col-span-8">
          {error ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-primary-dark">Leads couldn&apos;t be loaded.</p>
              <p className="mt-1 text-xs text-slate-600">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setRefresh((n) => n + 1)}>
                Retry
              </Button>
            </div>
          ) : !data ? (
            <div className="space-y-2 p-3 animate-pulse" aria-busy="true" aria-label="Loading leads">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-9 rounded bg-slate-100" />
              ))}
            </div>
          ) : data.leads.length === 0 ? (
            <Message
              title={
                needle || agentFilter
                  ? "No leads match these filters"
                  : status === "unassigned"
                    ? "No unassigned leads"
                    : status === "assigned"
                      ? "No leads assigned yet"
                      : "No leads uploaded yet"
              }
            >
              {status === "unassigned" && !needle && !agentFilter ? "Upload an Excel or CSV file to add leads." : null}
            </Message>
          ) : (
            <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select all unassigned leads on this page"
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        disabled={selectable.length === 0}
                        onCheckedChange={(checked) =>
                          setSelected(checked === true ? new Set(selectable.map((l) => l.id)) : new Set())
                        }
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-primary-dark">Lead</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Phone and email</TableHead>
                    <TableHead className="font-semibold text-primary-dark">City / country</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Assigned to</TableHead>
                    <TableHead className="text-right font-semibold text-primary-dark">Inquiries sent</TableHead>
                    <TableHead className="font-semibold text-primary-dark">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leads.map((lead) => {
                    const canSelect = lead.status === "unassigned";
                    return (
                      <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                        <TableCell>
                          {canSelect ? (
                            <Checkbox
                              aria-label={`Select ${lead.name}`}
                              checked={selected.has(lead.id)}
                              onCheckedChange={(checked) =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (checked === true) next.add(lead.id);
                                  else next.delete(lead.id);
                                  return next;
                                })
                              }
                            />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="block font-medium text-primary-dark">{lead.name}</span>
                          {lead.companyName ? <span className="block text-xs text-slate-600">{lead.companyName}</span> : null}
                        </TableCell>
                        <TableCell>
                          <span className="block whitespace-nowrap">{lead.phone ?? "—"}</span>
                          {lead.email ? <span className="block text-xs text-slate-600">{lead.email}</span> : null}
                        </TableCell>
                        <TableCell>{[lead.city, lead.country].filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell>
                          {lead.status === "assigned" ? (
                            <>
                              <span className="inline-flex rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                                {lead.agentName ?? "Sales agent"}
                              </span>
                              <span className="block text-xs text-slate-600">{formatDate(lead.assignedAt)}</span>
                            </>
                          ) : (
                            <span className="inline-flex rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                              Unassigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {lead.status === "assigned" ? lead.inquiriesSent : <span className="text-slate-500">—</span>}
                        </TableCell>
                        <TableCell>
                          <span className="block whitespace-nowrap">{formatDate(lead.createdAt)}</span>
                          {lead.fileName ? (
                            <span className="block max-w-[180px] truncate text-xs text-slate-600" title={lead.fileName}>
                              {lead.fileName}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
                <span className="tabular-nums">
                  {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of{" "}
                  {data.total.toLocaleString()}
                  {selected.size ? ` · ${selected.size} selected` : ""}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="xs" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section aria-label="Leads by sales agent" className="min-w-0 rounded-lg border border-slate-200 bg-white xl:col-span-4">
          <div className="px-3 pt-3">
            <h2 className="text-base font-semibold text-primary-dark">Sales agents</h2>
            <p className="text-xs text-slate-600">
              Inquiries sent counts inquiries sent to Operations from assigned leads after they were assigned. Click an
              agent to see their leads.
            </p>
          </div>
          {!data ? (
            <div className="space-y-2 p-3 animate-pulse" aria-busy="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 rounded bg-slate-100" />
              ))}
            </div>
          ) : data.agents.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-600">This company has no sales agents.</p>
          ) : (
            <Table className="mt-2">
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-semibold text-primary-dark">Sales agent</TableHead>
                  <TableHead className="text-right font-semibold text-primary-dark">Assigned leads</TableHead>
                  <TableHead className="text-right font-semibold text-primary-dark">Inquiries sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agents.map((agent) => (
                  <TableRow key={agent.id} className={agentFilter?.id === agent.id ? "bg-[#e6f4f5]" : undefined}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium text-[#017e84] hover:underline focus-visible:outline-2 focus-visible:outline-[#017e84]"
                        onClick={() => {
                          setAgentFilter({ id: agent.id, name: agent.name });
                          setStatus("assigned");
                        }}
                      >
                        {agent.name}
                      </button>
                      {!agent.active ? <span className="block text-xs text-slate-600">Inactive</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{agent.assignedLeads.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{agent.inquiriesSent.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableCell className="font-semibold text-primary-dark">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {data.agents.reduce((n, a) => n + a.assignedLeads, 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {data.agents.reduce((n, a) => n + a.inquiriesSent, 0).toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <LeadUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onImported={() => {
          setStatus("unassigned");
          setAgentFilter(null);
          setPage(1);
          setRefresh((n) => n + 1);
        }}
        onSetupRequired={() => setSetupRequired(true)}
      />
      <AssignDialog open={assignOpen} count={selected.size} onOpenChange={setAssignOpen} onAssign={handleAssign} />
    </div>
  );
}
