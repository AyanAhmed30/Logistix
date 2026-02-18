"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAllConvertedCustomersForSalesAgent,
  type ConvertedCustomerWithDetails,
} from "@/app/actions/customer_conversion";
import { getLeadComments, type LeadComment } from "@/app/actions/leads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

export function CustomerListPanel() {
  const [customers, setCustomers] = useState<ConvertedCustomerWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ConvertedCustomerWithDetails | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setIsLoading(true);
    try {
      const result = await getAllConvertedCustomersForSalesAgent();
      if ("error" in result) {
        toast.error(result.error || "Unable to load customers");
        setCustomers([]);
      } else {
        setCustomers(result.customers || []);
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
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
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>
            View all customers converted from leads. Click the comments icon to view full comment history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-16 text-center text-secondary-muted">
              Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="py-16 text-center text-secondary-muted">
              No converted customers found. Convert leads from the Pipeline tab to see them here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Name</TableHead>
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
