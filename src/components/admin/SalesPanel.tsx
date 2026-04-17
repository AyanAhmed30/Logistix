"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { Users, UserSquare2 } from "lucide-react";
import { getAllLeadsForAdmin, type LeadWithSalesAgent } from "@/app/actions/leads";
import { getAllConvertedCustomersForAdmin, type ConvertedCustomerWithDetails } from "@/app/actions/customer_conversion";
import { getSalesAgentDirectoryForAdmin, type SalesAgentDirectoryRow } from "@/app/actions/admin_sales_agent_overview";
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
            <CardTitle>Leads</CardTitle>
            <CardDescription>
              View all leads created by sales agents.
            </CardDescription>
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
                    {leads.map((lead) => (
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
                    ))}
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
              Full performance and activity for each sales agent. Open a row for the detailed dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAgents ? (
              <div className="py-16 text-center text-secondary-muted">Loading sales agents...</div>
            ) : agentRows.length === 0 ? (
              <div className="py-16 text-center text-secondary-muted">No sales agents found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email / username</TableHead>
                      <TableHead className="text-right">Total leads</TableHead>
                      <TableHead className="text-right">Total inquiries</TableHead>
                      <TableHead className="w-[140px]"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentRows.map((row) => (
                      <TableRow key={row.id} className="cursor-pointer hover:bg-slate-50/80">
                        <TableCell className="font-semibold">
                          <Link
                            href={`/admin/dashboard/sales-agents/${row.id}`}
                            className="text-primary-accent hover:underline"
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {row.email ? (
                              <span className="text-slate-800">{row.email}</span>
                            ) : (
                              <span className="text-secondary-muted">—</span>
                            )}
                          </div>
                          {row.username ? (
                            <div className="text-xs text-secondary-muted font-mono">@{row.username}</div>
                          ) : (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">id {row.id.slice(0, 8)}…</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.total_leads}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.total_inquiries}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="rounded-sm" asChild>
                            <Link href={`/admin/dashboard/sales-agents/${row.id}`}>Open overview</Link>
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
      )}

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
