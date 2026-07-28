"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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
import { Building2, ChevronLeft, ChevronRight, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAccountingCustomers } from "@/app/actions/accounting/customers";
import type { ContactWithRelations } from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

export function AccountingCustomersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, setSearchQuery } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);

  const urlQuery = searchParams.get("q") || "";
  const [customers, setCustomers] = useState<ContactWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (urlQuery) setSearchQuery(urlQuery);
  }, [urlQuery, setSearchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, urlQuery, switchVersion]);

  const load = useCallback(() => {
    setLoading(true);
    const query = (urlQuery || debouncedSearch).trim();
    startTransition(async () => {
      const res = await getAccountingCustomers({
        search: query || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setCustomers([]);
        setTotal(0);
      } else {
        setCustomers(res.customers ?? []);
        setTotal(res.total ?? 0);
      }
      setLoading(false);
    });
  }, [urlQuery, debouncedSearch, page]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Shared with Contacts — no duplicate customer records.
        </p>
        <span className="text-sm text-secondary-muted">
          {total} customer{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={6} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          {customers.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted">
              No customers found. Create customers in Contacts first.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() =>
                        router.push(`/accounting/customers/${customer.id}`)
                      }
                    >
                      <TableCell className="font-mono text-sm text-primary-dark">
                        {customer.lead_id_formatted || "—"}
                      </TableCell>
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
                        {customer.phone || customer.mobile || "—"}
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
      )}

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
