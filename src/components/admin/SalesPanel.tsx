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
import { UserCog, Users, MessageSquare } from "lucide-react";
import { SalesAgentPanel } from "@/components/admin/SalesAgentPanel";
import { getAllLeadsForAdmin, getLeadComments, type LeadWithSalesAgent, type LeadComment } from "@/app/actions/leads";
import { getAllConvertedCustomersForAdmin, type ConvertedCustomerWithDetails } from "@/app/actions/customer_conversion";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SalesSubTab = "sales-agent" | "customer-list" | "leads";

export function SalesPanel() {
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>("sales-agent");
  const [leads, setLeads] = useState<LeadWithSalesAgent[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [customers, setCustomers] = useState<ConvertedCustomerWithDetails[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ConvertedCustomerWithDetails | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    if (activeSubTab === "leads") {
      fetchLeads();
    } else if (activeSubTab === "customer-list") {
      fetchCustomers();
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

  async function handleViewComments(customer: ConvertedCustomerWithDetails) {
    if (!customer.lead_id) return;
    
    setSelectedCustomer(customer);
    setCommentsOpen(true);
    setCommentsLoading(true);
    
    try {
      const result = await getLeadComments(customer.lead_id);
      if ("error" in result) {
        toast.error(result.error || "Unable to load comments");
        setComments([]);
      } else {
        setComments(result.comments || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
      setComments([]);
    } finally {
      setCommentsLoading(false);
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
              View all customers converted from leads by sales agents. Click the comments icon to view full comment history.
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
                      <TableHead>Comments</TableHead>
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
                              {customer.sales_agents.code && (
                                <div className="text-xs text-secondary-muted">
                                  Code: {customer.sales_agents.code}
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
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleViewComments(customer)}
                          >
                            <MessageSquare className="h-4 w-4" />
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

      {/* Comments Dialog */}
      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Comments - {selectedCustomer?.name || "Customer"}
            </DialogTitle>
            <DialogDescription>
              Full comment history for this customer (from lead conversion).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {commentsLoading ? (
              <div className="text-center py-8 text-sm text-secondary-muted">
                Loading comments...
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-sm text-secondary-muted">
                No comments found for this customer.
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <Card key={comment.id} className="p-3">
                    <div className="space-y-2">
                      <p className="text-sm text-primary-dark whitespace-pre-wrap">
                        {comment.comment}
                      </p>
                      <span className="text-xs text-secondary-muted">
                        {new Date(comment.created_at).toLocaleString()}
                        {comment.updated_at !== comment.created_at && " (edited)"}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
