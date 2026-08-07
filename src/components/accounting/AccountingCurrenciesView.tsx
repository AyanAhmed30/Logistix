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
  ensureDefaultAccountingCurrencies,
  getAccountingConfigCurrencies,
  type AccountingCurrencyListItem,
} from "@/app/actions/accounting/currencies";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

const PAGE_SIZE = 40;

export function AccountingCurrenciesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [currencies, setCurrencies] = useState<AccountingCurrencyListItem[]>(
    []
  );
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
        await ensureDefaultAccountingCurrencies();
      }
      const res = await getAccountingConfigCurrencies({
        search: debouncedSearch.trim() || undefined,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setCurrencies([]);
        setTotal(0);
      } else {
        setCurrencies(res.currencies ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info(
            "Run enhance_accounting_currencies_foundation.sql in Supabase."
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
          Central currency &amp; exchange-rate engine for all accounting
          transactions.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} currenc{total === 1 ? "y" : "ies"}
          </span>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={() =>
              router.push("/accounting/configuration/currencies/new")
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={7} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {currencies.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No currencies yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() =>
                  router.push("/accounting/configuration/currencies/new")
                }
              >
                Create Currency
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Rate → Base</TableHead>
                    <TableHead>Rate Date</TableHead>
                    <TableHead>Precision</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currencies.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() =>
                        router.push(
                          `/accounting/configuration/currencies/${c.id}`
                        )
                      }
                    >
                      <TableCell className="font-medium text-sm">
                        {c.code}
                        {c.is_base ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-[#017e84]">
                            Base
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm">{c.symbol || "—"}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums">
                        {c.is_base
                          ? "1"
                          : c.latest_rate != null
                            ? c.latest_rate.toLocaleString(undefined, {
                                maximumFractionDigits: 8,
                              })
                            : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-secondary-muted">
                        {c.latest_rate_date || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.decimal_places}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.is_active ? (
                          <span className="text-emerald-700">Active</span>
                        ) : (
                          <span className="text-slate-400">Archived</span>
                        )}
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
            variant="outline"
            size="sm"
            className="h-8 rounded-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            {page} / {totalPages}
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
