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
import { getAccountingVendors } from "@/app/actions/accounting/vendors";
import type { ContactWithRelations } from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

export function AccountingVendorsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, setSearchQuery } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const urlQuery = searchParams.get("q") || "";
  const [vendors, setVendors] = useState<ContactWithRelations[]>([]);
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
      const res = await getAccountingVendors({
        search: query || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setVendors([]);
        setTotal(0);
      } else {
        setVendors(res.vendors ?? []);
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
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white font-medium"
            onClick={() => router.push("/accounting/vendors/new")}
          >
            New
          </Button>
          <p className="text-sm text-secondary-muted">
            Contacts marked as Vendors — shared with Contacts module.
          </p>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} vendor{total === 1 ? "" : "s"}
        </span>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={8} cols={6} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {vendors.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No vendors found. Mark contacts as Vendor, or create one.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() => router.push("/accounting/vendors/new")}
              >
                New Vendor
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Vendor ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => router.push(`/accounting/vendors/${v.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        {v.lead_id_formatted || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {v.company_type === "company" ? (
                            <Building2 className="h-4 w-4 text-[#017e84]" />
                          ) : (
                            <UserRound className="h-4 w-4 text-[#017e84]" />
                          )}
                          {v.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-secondary-muted">
                        {v.company_name || "—"}
                      </TableCell>
                      <TableCell className="text-secondary-muted">
                        {v.email || "—"}
                      </TableCell>
                      <TableCell className="text-secondary-muted">
                        {v.phone || v.mobile || "—"}
                      </TableCell>
                      <TableCell className="text-secondary-muted">
                        {v.country || "—"}
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
