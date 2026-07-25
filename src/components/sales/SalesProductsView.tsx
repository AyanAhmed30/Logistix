"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Package,
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
  getSalesProducts,
  type SalesProduct,
} from "@/app/actions/sales/products";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useSalesShell } from "@/components/sales/SalesShell";
import {
  SalesEmptyState,
  SalesPageSkeleton,
} from "@/components/sales/SalesSkeleton";
import { formatMoney } from "@/lib/sales-quotation-form";

const PAGE_SIZE = 40;

export function SalesProductsView() {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useSalesShell();
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const activeFilter =
    activeFilterId === "archived"
      ? "archived"
      : activeFilterId === "all"
        ? "all"
        : "active";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSalesProducts({
      search: searchQuery,
      active: activeFilter,
      page,
      pageSize: PAGE_SIZE,
    });
    if ("error" in res && res.error && !("products" in res)) {
      toast.error(res.error);
      setProducts([]);
      setTotal(0);
    } else if ("products" in res) {
      setProducts(res.products);
      setTotal(res.total);
      if (res.error) toast.message(res.error);
    }
    setLoading(false);
  }, [searchQuery, activeFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeFilter, switchVersion]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleNew() {
    if (isAdminContext) {
      toast.info("Select a specific organization to create products.");
      return;
    }
    router.push("/sales/products/new");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
            onClick={handleNew}
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
          <div className="inline-flex rounded-sm border border-slate-200 bg-white p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-7 px-2 rounded-sm ${
                viewMode === "list" ? "bg-slate-100 text-[#017e84]" : ""
              }`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`h-7 px-2 rounded-sm ${
                viewMode === "kanban" ? "bg-slate-100 text-[#017e84]" : ""
              }`}
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <span className="text-sm text-secondary-muted">
          {total} product{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden min-h-[320px]">
        {loading ? (
          <div className="p-4">
            <SalesPageSkeleton rows={8} />
          </div>
        ) : products.length === 0 ? (
          <SalesEmptyState
            title="No products found"
            description="Create a product with New to use it on quotations."
            action={
              <Button
                size="sm"
                className="h-8 bg-[#017e84] hover:bg-[#016970] text-white rounded-sm"
                onClick={handleNew}
              >
                New Product
              </Button>
            }
          />
        ) : viewMode === "kanban" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-3">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/sales/products/${p.id}`)}
                className="text-left rounded-sm border border-slate-200 bg-white overflow-hidden hover:border-[#017e84]/40 transition-colors"
              >
                <div className="h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-slate-300" />
                  )}
                </div>
                <div className="p-3">
                  <div className="font-medium text-primary-dark truncate">
                    {p.name}
                  </div>
                  <div className="text-xs text-secondary-muted mt-0.5">
                    {p.default_code || "No SKU"}
                  </div>
                  <div className="text-sm font-semibold text-[#017e84] mt-2 tabular-nums">
                    {formatMoney(p.list_price)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="w-14" />
                  <TableHead>Name</TableHead>
                  <TableHead>Internal Reference</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Sales Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-[#017e84]/5"
                    onClick={() => router.push(`/sales/products/${p.id}`)}
                  >
                    <TableCell>
                      <div className="h-9 w-9 rounded-sm bg-slate-100 overflow-hidden flex items-center justify-center">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-4 w-4 text-secondary-muted" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-primary-dark">
                      {p.name}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {p.default_code || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">
                      {p.category_name || "—"}
                    </TableCell>
                    <TableCell className="text-secondary-muted">{p.uom}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.list_price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-secondary-muted">
                      {formatMoney(p.standard_price)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-sm border px-2 py-0.5 text-[11px] font-medium ${
                          p.active
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {p.active ? "Active" : "Archived"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
