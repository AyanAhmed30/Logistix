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
  Upload,
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
  getAccountingCoaAccounts,
  exportAccountingCoaAccountsCsv,
  importAccountingCoaAccountsCsv,
  type AccountingCoaListItem,
} from "@/app/actions/accounting/chart-of-accounts";
import {
  coaAccountTypeLabel,
  coaClassificationLabel,
  COA_ACCOUNT_TYPES_BY_CLASSIFICATION,
  type CoaClassification,
} from "@/lib/accounting-chart-of-accounts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type GroupBy = "none" | "classification" | "account_type" | "organization";

function formatUpdated(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AccountingChartOfAccountsView() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [accounts, setAccounts] = useState<AccountingCoaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [classification, setClassification] = useState("all");
  const [accountType, setAccountType] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  const statusFilter =
    activeFilterId === "archived" || activeFilterId === "all"
      ? (activeFilterId as "archived" | "all")
      : "active";

  const accountTypeOptions = useMemo(() => {
    if (classification === "all" || classification === "view") {
      return Object.values(COA_ACCOUNT_TYPES_BY_CLASSIFICATION).flat();
    }
    return (
      COA_ACCOUNT_TYPES_BY_CLASSIFICATION[
        classification as Exclude<CoaClassification, "view">
      ] || []
    );
  }, [classification]);

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingCoaAccounts({
        search: debouncedSearch.trim() || undefined,
        classification,
        accountType,
        status: statusFilter,
        groupBy,
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setAccounts([]);
        setTotal(0);
      } else {
        setAccounts(res.accounts ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info(
            "Run enhance_accounting_chart_of_accounts_foundation.sql in Supabase."
          );
        }
      }
      setLoading(false);
    });
  }, [
    page,
    debouncedSearch,
    statusFilter,
    classification,
    accountType,
    groupBy,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    statusFilter,
    classification,
    accountType,
    groupBy,
    switchVersion,
  ]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: null as string | null, rows: accounts }];
    }
    const map = new Map<string, AccountingCoaListItem[]>();
    for (const a of accounts) {
      let key = "—";
      if (groupBy === "classification") key = a.type || "—";
      if (groupBy === "account_type") key = a.account_type || "—";
      if (groupBy === "organization") {
        key = a.organization_name || (a.organization_id ? "—" : "Shared");
      }
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({
        key,
        label:
          groupBy === "classification"
            ? coaClassificationLabel(key)
            : groupBy === "account_type"
              ? coaAccountTypeLabel(key)
              : key,
        rows,
      }));
  }, [accounts, groupBy]);

  function handleNew() {
    router.push("/accounting/configuration/chart-of-accounts/new");
  }

  function handleExport() {
    startTransition(async () => {
      const res = await exportAccountingCoaAccountsCsv();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.csv || ""], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported chart of accounts");
    });
  }

  function handleImportFile(file: File) {
    startTransition(async () => {
      const text = await file.text();
      const res = await importAccountingCoaAccountsCsv(text);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const errs = res.errors?.length || 0;
      toast.success(
        `Import done: ${res.created || 0} created, ${res.updated || 0} updated${
          errs ? `, ${errs} row error(s)` : ""
        }`
      );
      if (errs && res.errors?.[0]) toast.message(res.errors[0]);
      load();
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Single source of truth for all accounting postings.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-secondary-muted">
            {total} account{total === 1 ? "" : "s"}
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
            variant="outline"
            className="h-8 rounded-sm"
            disabled={isPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) handleImportFile(f);
            }}
          />
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleNew}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-secondary-muted">Classification</label>
        <select
          className="h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm"
          value={classification}
          onChange={(e) => {
            setClassification(e.target.value);
            setAccountType("all");
          }}
        >
          <option value="all">All</option>
          <option value="asset">Assets</option>
          <option value="liability">Liabilities</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expenses</option>
          <option value="view">View / Group</option>
        </select>

        <label className="text-xs text-secondary-muted ml-2">Type</label>
        <select
          className="h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm min-w-[160px]"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          <option value="all">All</option>
          {accountTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label className="text-xs text-secondary-muted ml-2">Group By</label>
        <select
          className="h-8 rounded-sm border border-slate-200 bg-white px-2 text-sm"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="none">None</option>
          <option value="classification">Classification</option>
          <option value="account_type">Account Type</option>
          <option value="organization">Organization</option>
        </select>
      </div>

      {loading || isPending ? (
        <AccountingTableSkeleton rows={12} cols={8} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {accounts.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No accounts match the current filters.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={handleNew}
              >
                Create Account
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Account Group</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Reconcile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
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
                      {group.rows.map((a) => (
                        <TableRow
                          key={a.id}
                          className="cursor-pointer hover:bg-[#017e84]/5"
                          onClick={() =>
                            router.push(
                              `/accounting/configuration/chart-of-accounts/${a.id}`
                            )
                          }
                        >
                          <TableCell className="font-medium text-[#017e84] whitespace-nowrap tabular-nums">
                            {a.code}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "max-w-[220px] truncate font-medium",
                              a.depth > 0 && "pl-5"
                            )}
                          >
                            {a.name}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {coaAccountTypeLabel(a.account_type) !== "—"
                              ? coaAccountTypeLabel(a.account_type)
                              : coaClassificationLabel(a.type)}
                          </TableCell>
                          <TableCell className="text-sm text-secondary-muted max-w-[160px] truncate">
                            {a.parent_name
                              ? `${a.parent_code || ""} ${a.parent_name}`.trim()
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {a.organization_name || "Shared"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {a.allow_reconciliation ? "Yes" : "No"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex rounded-sm border px-1.5 py-0.5 text-[11px] font-medium",
                                a.is_active
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : "bg-slate-100 text-slate-600 border-slate-300"
                              )}
                            >
                              {a.is_active ? "Active" : "Archived"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-secondary-muted whitespace-nowrap">
                            {formatUpdated(a.updated_at)}
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
