"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAllConvertedCustomersForSalesAgent,
  type ConvertedCustomerWithDetails,
} from "@/app/actions/customer_conversion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CustomerListPanel() {
  const [customers, setCustomers] = useState<ConvertedCustomerWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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


  return (
    <div className="space-y-6">
      <Card className="bg-white border shadow-sm">
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>
            View all customers converted from leads.
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
