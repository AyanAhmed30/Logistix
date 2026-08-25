"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
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
  createAccountingAsset,
  getAccountingAssets,
  type AccountingAssetListItem,
} from "@/app/actions/accounting/assets";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "fully_depreciated":
      return "bg-sky-50 text-sky-800 border-sky-200";
    case "disposed":
      return "bg-slate-100 text-slate-700 border-slate-300";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-amber-50 text-amber-800 border-amber-200";
  }
}

function statusLabel(status: string) {
  if (status === "fully_depreciated") return "Fully Depreciated";
  return status.replace(/_/g, " ");
}

export function AccountingAssetsView() {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const [assets, setAssets] = useState<AccountingAssetListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingAssets({
        search: debouncedSearch.trim() || undefined,
        status: activeFilterId || "all",
        page,
        pageSize: PAGE_SIZE,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setAssets([]);
        setTotal(0);
      } else {
        setAssets(res.assets ?? []);
        setTotal(res.total ?? 0);
        if ("migrationRequired" in res && res.migrationRequired) {
          toast.info("Run create_accounting_assets_module.sql to enable Assets.");
        }
      }
      setLoading(false);
    });
  }, [page, debouncedSearch, activeFilterId]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    load();
  }, [load, switchVersion]);

  function handleNew() {
    startTransition(async () => {
      const res = await createAccountingAsset();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if (res.assetId) {
        router.push(`/accounting/assets/${res.assetId}`);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary-muted">
          Fixed assets with automatic depreciation and journal entries.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            onClick={() => router.push("/accounting/assets/categories")}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1" />
            Categories
          </Button>
          <span className="text-sm text-secondary-muted">
            {total} asset{total === 1 ? "" : "s"}
          </span>
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

      {loading || isPending ? (
        <AccountingTableSkeleton rows={10} cols={9} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {assets.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted space-y-3">
              <p>No assets yet.</p>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                onClick={handleNew}
              >
                Create Asset
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Acquisition</TableHead>
                    <TableHead className="text-right">Original Cost</TableHead>
                    <TableHead className="text-right">Book Value</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Life</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Organization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer hover:bg-[#017e84]/5"
                      onClick={() => router.push(`/accounting/assets/${a.id}`)}
                    >
                      <TableCell className="font-medium text-[#017e84] whitespace-nowrap">
                        {a.asset_number}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {a.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.category_name || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {a.acquisition_date}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatMoney(a.original_value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">
                        {formatMoney(a.book_value)}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {a.depreciation_method.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {a.useful_life_months} mo
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold capitalize",
                            statusBadge(a.status)
                          )}
                        >
                          {statusLabel(a.status)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm text-secondary-muted">
                        {a.organization_name || "—"}
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
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-secondary-muted">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
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
