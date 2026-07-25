"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, ChevronLeft, ChevronRight, Plus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSalesCustomers } from "@/app/actions/sales/customers";
import type { ContactWithRelations } from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import { SalesEmptyState, SalesPageSkeleton } from "@/components/sales/SalesSkeleton";

const PAGE_SIZE = 40;

/**
 * Sales Customers — Contacts module records with customer_rank > 0,
 * rendered inside the Sales layout (no duplicate Contacts store).
 */
export function SalesCustomersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, setSearchQuery } = useSalesShell();

  const urlQuery = searchParams.get("q") || "";
  const [customers, setCustomers] = useState<ContactWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (urlQuery) setSearchQuery(urlQuery);
  }, [urlQuery, setSearchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query = (urlQuery || searchQuery).trim();
    void getSalesCustomers(query || undefined).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setCustomers([]);
      } else if ("customers" in res) {
        setCustomers(res.customers ?? []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [urlQuery, searchQuery, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = useMemo(
    () => customers.slice(pageStart, pageStart + PAGE_SIZE),
    [customers, pageStart]
  );

  function handleNew() {
    if (isAdminContext) {
      toast.info(
        "Select a specific organization from the company switcher to create a contact."
      );
      return;
    }
    router.push("/sales/customers/new");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
          onClick={handleNew}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
        <span className="text-sm text-secondary-muted">
          {customers.length} customer{customers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <SalesPageSkeleton rows={6} />
          </div>
        ) : paged.length === 0 ? (
          <SalesEmptyState
            title="No customers found"
            description="Mark contacts as customers in Contacts, or create one with New."
            action={
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
                onClick={handleNew}
              >
                <Plus className="h-4 w-4" />
                New Customer
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer hover:bg-[#017e84]/5"
                    onClick={() =>
                      router.push(`/sales/customers/${customer.id}`)
                    }
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-primary-dark">
                        {customer.company_type === "company" ? (
                          <Building2 className="h-4 w-4 text-[#017e84]" />
                        ) : (
                          <UserRound className="h-4 w-4 text-[#017e84]" />
                        )}
                        {customer.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {customer.company_name || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {customer.email || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {customer.phone || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {customer.country || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {customers.length > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
