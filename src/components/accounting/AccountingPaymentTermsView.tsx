"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ensureDefaultAccountingPaymentTerms,
  getAccountingConfigPaymentTerms,
  type AccountingPaymentTermListItem,
} from "@/app/actions/accounting/payment-terms";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

export function AccountingPaymentTermsView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [terms, setTerms] = useState<AccountingPaymentTermListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const seededRef = useRef(false);

  const statusFilter =
    activeFilterId === "archived" || activeFilterId === "all"
      ? (activeFilterId as "archived" | "all")
      : "active";

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      if (!seededRef.current) {
        seededRef.current = true;
        await ensureDefaultAccountingPaymentTerms();
      }
      const res = await getAccountingConfigPaymentTerms({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setTerms([]);
        setTotal(0);
      } else {
        setTerms(res.terms ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info(
            "Run enhance_accounting_payment_terms_foundation.sql in Supabase."
          );
        }
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Central payment policy engine for due dates, receivables, and aging.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} term{total === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={() =>
              router.push("/accounting/configuration/payment-terms/new")
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={6} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {terms.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No payment terms yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() =>
                  router.push("/accounting/configuration/payment-terms/new")
                }
              >
                Create Payment Term
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Payment Term</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() =>
                        router.push(
                          `/accounting/configuration/payment-terms/${t.id}`
                        )
                      }
                    >
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-[#017e84] font-medium whitespace-nowrap">
                        {t.code || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{t.summary}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {t.line_count}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {t.organization_name || "Shared"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
                            t.is_active
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-slate-100 text-slate-600 border-slate-300"
                          )}
                        >
                          {t.is_active ? "Active" : "Archived"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page <= 1 || isPending}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            Page {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={page >= totalPages || isPending}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
