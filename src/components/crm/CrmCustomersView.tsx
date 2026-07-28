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
import { getCrmCustomers } from "@/app/actions/crm/customers";
import type { ContactWithRelations } from "@/app/actions/contacts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useCrmShell } from "@/components/crm/CrmShell";
import { CrmEmptyState, CrmPageSkeleton } from "@/components/crm/CrmSkeleton";

const PAGE_SIZE = 40;

export function CrmCustomersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, setSearchQuery, activeFilterId } = useCrmShell();

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
    void getCrmCustomers(query || undefined).then((res) => {
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

  const filtered = useMemo(() => {
    if (activeFilterId !== "all") return customers;
    return customers;
  }, [customers, activeFilterId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function handleNew() {
    if (isAdminContext) {
      toast.info(
        "Select a specific organization from the company switcher to create a contact."
      );
      return;
    }
    router.push("/crm/customers/new");
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
          {filtered.length} contact{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4">
            <CrmPageSkeleton rows={6} />
          </div>
        ) : paged.length === 0 ? (
          <CrmEmptyState
            title="No contacts found"
            description="Create a contact with New, or add contacts in Admin → Contacts."
            action={
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
                onClick={handleNew}
              >
                <Plus className="h-4 w-4" />
                New Contact
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-[100px]">Customer ID</TableHead>
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
                    onClick={() => router.push(`/crm/customers/${customer.id}`)}
                  >
                    <TableCell className="font-mono text-sm text-secondary-muted">
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

      {filtered.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm text-secondary-muted">
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-slate-200 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
