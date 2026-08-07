"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
} from "lucide-react";
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
  ensureDefaultAccountingTaxes,
  exportAccountingConfigTaxesCsv,
  getAccountingConfigTaxes,
  type AccountingTaxListItem,
} from "@/app/actions/accounting/taxes";
import { taxMasterTypeLabel } from "@/lib/accounting-tax-engine";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

type GroupBy = "none" | "type" | "group";

export function AccountingTaxesView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [taxes, setTaxes] = useState<AccountingTaxListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [typeFilter, setTypeFilter] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
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
        await ensureDefaultAccountingTaxes();
      }
      const res = await getAccountingConfigTaxes({
        search: debouncedSearch.trim() || undefined,
        type: typeFilter,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setTaxes([]);
        setTotal(0);
      } else {
        setTaxes(res.taxes ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info(
            "Run enhance_accounting_taxes_foundation.sql in Supabase."
          );
        }
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, statusFilter, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, groupBy, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: null as string | null, rows: taxes }];
    }
    const map = new Map<string, AccountingTaxListItem[]>();
    for (const t of taxes) {
      let key = "—";
      if (groupBy === "type") key = t.type || "—";
      if (groupBy === "group") key = t.tax_group_name || "No Group";
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({
        key,
        label: groupBy === "type" ? taxMasterTypeLabel(key) : key,
        rows,
      }));
  }, [taxes, groupBy]);

  function handleExport() {
    startTransition(async () => {
      const res = await exportAccountingConfigTaxesCsv();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.csv || ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taxes-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported taxes");
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Central tax engine for invoices, bills, credit notes, and returns.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} tax{total === 1 ? "" : "es"}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            disabled={isPending}
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Export
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={() => router.push("/accounting/configuration/taxes/new")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-secondary-muted">Type</label>
        <select
          className="h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="sales_tax">Sales</option>
          <option value="purchase_tax">Purchase</option>
          <option value="withholding_tax">Withholding</option>
        </select>

        <label className="text-xs text-secondary-muted ml-2">Group By</label>
        <select
          className="h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="none">None</option>
          <option value="type">Type</option>
          <option value="group">Tax Group</option>
        </select>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={8} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {taxes.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No taxes match the current filters.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={() =>
                  router.push("/accounting/configuration/taxes/new")
                }
              >
                Create Tax
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Tax Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Computation</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Tax Account</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((group) => (
                    <Fragment key={group.key}>
                      {group.label ? (
                        <TableRow className="bg-slate-50">
                          <TableCell
                            colSpan={8}
                            className="text-xs font-semibold uppercase tracking-wide text-secondary-muted"
                          >
                            {group.label}
                            <span className="ml-2 font-normal normal-case">
                              ({group.rows.length})
                            </span>
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {group.rows.map((t) => (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer hover:bg-[#017e84]/5"
                          onClick={() =>
                            router.push(
                              `/accounting/configuration/taxes/${t.id}`
                            )
                          }
                        >
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {t.name}
                          </TableCell>
                          <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                            {t.code}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {taxMasterTypeLabel(t.type)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.tax_group_name || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.amount_type === "fixed"
                              ? "Fixed"
                              : t.is_inclusive
                                ? "Included"
                                : "Excluded"}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {t.amount_type === "fixed"
                              ? t.rate_value.toFixed(2)
                              : `${t.rate_value}%`}
                          </TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate">
                            {t.account_code
                              ? `${t.account_code} ${t.account_name || ""}`.trim()
                              : "—"}
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
                    </Fragment>
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
