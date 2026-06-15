"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, UserSquare2, Trophy, ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAllLeadsForAdmin, type LeadWithSalesAgent } from "@/app/actions/leads";
import { getAllConvertedCustomersForAdmin, type ConvertedCustomerWithDetails } from "@/app/actions/customer_conversion";
import { getSalesAgentDirectoryForAdmin, type SalesAgentDirectoryRow } from "@/app/actions/admin_sales_agent_overview";
import { SalesAgentOverviewDrawer, type DateRangeKey } from "@/components/admin/SalesAgentOverviewDrawer";
import { toast } from "sonner";

type SalesSubTab = "leads" | "customer-list" | "sales-agent-overview";

export function SalesPanel() {
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("leads");
  const [leads, setLeads] = useState<LeadWithSalesAgent[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [customers, setCustomers] = useState<ConvertedCustomerWithDetails[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [agentRows, setAgentRows] = useState<SalesAgentDirectoryRow[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [barDateRange, setBarDateRange] = useState<DateRangeKey>("all");
  const [barCustomFrom, setBarCustomFrom] = useState("");
  const [barCustomTo, setBarCustomTo] = useState("");

  const [leadSearch, setLeadSearch] = useState("");

  const visibleLeads = useMemo(() => {
    const needle = leadSearch.trim().toLowerCase();
    if (!needle) return leads;
    return leads.filter((lead) => {
      const hay = `${lead.lead_id_formatted || ""} ${lead.name || ""} ${lead.number || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [leads, leadSearch]);

  const topAgentId = useMemo(() => {
    if (agentRows.length === 0) return null;
    let leader: SalesAgentDirectoryRow | null = null;
    for (const row of agentRows) {
      if (row.won_deals <= 0) continue;
      if (!leader || row.won_deals > leader.won_deals) leader = row;
    }
    return leader?.id ?? null;
  }, [agentRows]);

  const visibleAgentRows = useMemo(() => {
    const needle = agentSearch.trim().toLowerCase();
    if (!needle) return agentRows;
    return agentRows.filter((row) => {
      const hay = `${row.name} ${row.email || ""} ${row.username || ""} ${row.phone_number || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [agentRows, agentSearch]);

  useEffect(() => {
    if (activeSubTab === "leads") {
      fetchLeads();
    }
    if (activeSubTab === "customer-list") {
      fetchCustomers();
    }
    if (activeSubTab === "sales-agent-overview") {
      fetchAgentDirectory();
    }
  }, [activeSubTab]);

  async function fetchLeads() {
    setIsLoadingLeads(true);
    try {
      const result = await getAllLeadsForAdmin();
      if ("error" in result) {
        toast.error(result.error || "Unable to load leads");
        setLeads([]);
      } else {
        setLeads(result.leads || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading leads");
      setLeads([]);
    } finally {
      setIsLoadingLeads(false);
    }
  }

  async function fetchCustomers() {
    setIsLoadingCustomers(true);
    try {
      const result = await getAllConvertedCustomersForAdmin();
      if ("error" in result) {
        toast.error(result.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers(result.customers || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading customers");
      setCustomers([]);
    } finally {
      setIsLoadingCustomers(false);
    }
  }

  async function fetchAgentDirectory() {
    setIsLoadingAgents(true);
    try {
      const result = await getSalesAgentDirectoryForAdmin();
      if ("error" in result) {
        toast.error(result.error || "Unable to load sales agents");
        setAgentRows([]);
      } else {
        setAgentRows(result.rows || []);
      }
    } catch {
      toast.error("An unexpected error occurred while loading sales agents");
      setAgentRows([]);
    } finally {
      setIsLoadingAgents(false);
    }
  }


  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeSubTab === "leads" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("leads")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "leads" ? "default" : "outline"}
        >
          <span className="sidebar-text">Leads</span>
        </Button>
        <Button
          variant={activeSubTab === "customer-list" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("customer-list")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "customer-list" ? "default" : "outline"}
        >
          <Users className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Customer List</span>
        </Button>
        <Button
          variant={activeSubTab === "sales-agent-overview" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("sales-agent-overview")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "sales-agent-overview" ? "default" : "outline"}
        >
          <UserSquare2 className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Sales Agent Overview</span>
        </Button>
      </div>

      {/* Leads Tab Content - Only show when this tab is selected */}
      {activeSubTab === "leads" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Leads</CardTitle>
                <CardDescription>
                  View all leads created by sales agents.
                </CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search by ID, name, or number"
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  className="h-9 pl-9 text-sm bg-white"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLeads ? (
              <div className="py-16 text-center text-secondary-muted">
                Loading leads...
              </div>
            ) : leads.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">
                No leads found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead ID</TableHead>
                      <TableHead>Lead Name</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Sales Agent</TableHead>
                      <TableHead>Created At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLeads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-secondary-muted">
                          No leads match &ldquo;{leadSearch}&rdquo;.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleLeads.map((lead) => (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <span className="font-mono font-semibold text-primary-accent">
                              {lead.lead_id_formatted || "-"}
                            </span>
                          </TableCell>
                          <TableCell className="font-semibold">{lead.name}</TableCell>
                          <TableCell>{lead.number}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm">
                              {lead.source}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lead.sales_agents ? (
                              <div>
                                <div className="font-medium">{lead.sales_agents.name}</div>
                                {lead.sales_agents.username && (
                                  <div className="text-xs text-secondary-muted">
                                    @{lead.sales_agents.username}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-secondary-muted text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(lead.created_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeSubTab === "sales-agent-overview" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Sales Agent Overview</CardTitle>
            <CardDescription>
              Pick any agent and click <span className="font-medium">Open Overview</span> to see their complete dashboard in a side panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50/50 p-3 md:flex-row md:items-center md:justify-between">
              <div className="relative md:flex-1 md:max-w-sm">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search agent by name, email or username"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="h-9 pl-9 text-sm bg-white"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Drawer preset
                </span>
                {(
                  [
                    { id: "today", label: "Today" },
                    { id: "7d", label: "7 Days" },
                    { id: "30d", label: "30 Days" },
                    { id: "all", label: "All time" },
                  ] as Array<{ id: DateRangeKey; label: string }>
                ).map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    size="sm"
                    variant={barDateRange === opt.id ? "default" : "outline"}
                    onClick={() => setBarDateRange(opt.id)}
                    className="h-8 rounded-full text-xs"
                    title="Presets the date filter when you open an agent overview"
                  >
                    {opt.label}
                  </Button>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={barCustomFrom}
                    onChange={(e) => {
                      setBarDateRange("custom");
                      setBarCustomFrom(e.target.value);
                    }}
                    className="h-8 w-36 text-xs bg-white"
                    aria-label="Preset from"
                  />
                  <span className="text-xs text-slate-500">–</span>
                  <Input
                    type="date"
                    value={barCustomTo}
                    onChange={(e) => {
                      setBarDateRange("custom");
                      setBarCustomTo(e.target.value);
                    }}
                    className="h-8 w-36 text-xs bg-white"
                    aria-label="Preset to"
                  />
                </div>
              </div>
            </div>

            {isLoadingAgents ? (
              <div className="py-16 text-center text-secondary-muted">Loading sales agents...</div>
            ) : agentRows.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">No sales agents found.</div>
            ) : visibleAgentRows.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">
                No agents match &ldquo;{agentSearch}&rdquo;.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent name</TableHead>
                      <TableHead className="text-right">Total leads</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                      <TableHead className="text-right w-[160px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAgentRows.map((row) => {
                      const isTop = topAgentId === row.id;
                      return (
                        <TableRow
                          key={row.id}
                          className={`cursor-pointer hover:bg-slate-50/80 transition-colors ${
                            isTop ? "bg-amber-50/40 hover:bg-amber-50/70" : ""
                          }`}
                          onClick={() => setDrawerAgentId(row.id)}
                        >
                          <TableCell className="font-semibold">
                            <div className="flex items-center gap-2">
                              <span>{row.name}</span>
                              {isTop ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                  title="Top performer"
                                >
                                  <Trophy className="h-3 w-3" />
                                  Top
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-secondary-muted mt-0.5">
                              {row.email || row.phone_number || (row.username ? `@${row.username}` : "")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.total_leads}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                              {row.won_deals}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                              {row.pending_leads}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                              {row.customers_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="default"
                              size="sm"
                              className="rounded-md h-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDrawerAgentId(row.id);
                              }}
                            >
                              Open Overview
                              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SalesAgentOverviewDrawer
        salesAgentId={drawerAgentId}
        onOpenChange={(open) => {
          if (!open) setDrawerAgentId(null);
        }}
        initialDateRange={barDateRange}
        initialCustomFrom={barCustomFrom}
        initialCustomTo={barCustomTo}
      />

      {/* Customer List Tab Content - Only show when this tab is selected */}
      {activeSubTab === "customer-list" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <CardDescription>
              View all customers converted from leads by sales agents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCustomers ? (
              <div className="py-16 text-center text-secondary-muted">
                Loading customers...
              </div>
            ) : customers.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">
                No converted customers found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer ID</TableHead>
                      <TableHead>Sales Agent</TableHead>
                      <TableHead>Customer Name</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Conversion Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-semibold text-primary-dark">
                          {customer.customer_id_formatted || "N/A"}
                        </TableCell>
                        <TableCell>
                          {customer.sales_agents ? (
                            <div>
                              <div className="font-medium">{customer.sales_agents.name}</div>
                              {customer.sales_agents.username && (
                                <div className="text-xs text-secondary-muted">
                                  @{customer.sales_agents.username}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-secondary-muted text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold">{customer.name}</TableCell>
                        <TableCell>{customer.phone_number}</TableCell>
                        <TableCell>
                          {customer.converted_at
                            ? new Date(customer.converted_at).toLocaleString()
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs">
                            Converted
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
