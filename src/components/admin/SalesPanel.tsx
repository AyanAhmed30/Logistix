"use client";

import { useEffect, useState } from "react";
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
import { UserCog, Users } from "lucide-react";
import { SalesAgentPanel } from "@/components/admin/SalesAgentPanel";
import { getAllLeadsForAdmin, type LeadWithSalesAgent } from "@/app/actions/leads";
import { toast } from "sonner";

type SalesSubTab = "sales-agent" | "customer-list" | "leads";

export function SalesPanel() {
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("sales-agent");
  const [leads, setLeads] = useState<LeadWithSalesAgent[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);

  useEffect(() => {
    if (activeSubTab === "leads") {
      fetchLeads();
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

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeSubTab === "sales-agent" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("sales-agent")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "sales-agent" ? "default" : "outline"}
        >
          <UserCog className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Sales Agent</span>
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
          variant={activeSubTab === "leads" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("leads")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "leads" ? "default" : "outline"}
        >
          <span className="sidebar-text">Leads</span>
        </Button>
      </div>

      {/* Sales Agent Tab */}
      {activeSubTab === "sales-agent" && <SalesAgentPanel />}

      {/* Customer List Tab */}
      {activeSubTab === "customer-list" && (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <CardDescription>
              This section is empty for now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-16 text-center text-secondary-muted">
              Customer List functionality coming soon...
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leads Tab */}
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
    </div>
  );
}
