"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Package, Search } from "lucide-react";
import {
  searchSalesProductsForQuotation,
  type SalesProduct,
} from "@/app/actions/sales/products";

type Props = {
  valueName: string;
  disabled?: boolean;
  onSelect: (product: SalesProduct | null, freeText?: string) => void;
};

/** Odoo-style product search for quotation order lines. */
export function SalesProductLinePicker({
  valueName,
  disabled = false,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(valueName || "");
  const [results, setResults] = useState<SalesProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) setQuery(valueName || "");
  }, [valueName, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function runSearch(q: string) {
    setLoading(true);
    startTransition(async () => {
      const res = await searchSalesProductsForQuotation(q, 25);
      setLoading(false);
      if ("products" in res) setResults(res.products || []);
      else setResults([]);
    });
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-secondary-muted pointer-events-none" />
        <Input
          className="h-8 rounded-sm pl-7"
          value={query}
          disabled={disabled}
          placeholder="Search product…"
          onFocus={() => {
            setOpen(true);
            runSearch(query);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => runSearch(v), 220);
            onSelect(null, v);
          }}
        />
      </div>

      {open && !disabled ? (
        <div className="absolute z-40 mt-1 w-[min(360px,70vw)] max-h-56 overflow-y-auto rounded-sm border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-secondary-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-secondary-muted">
              No products found. Create products under Sales → Products.
            </div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-[#017e84]/5 flex items-start gap-2 border-b border-slate-100 last:border-0"
                onClick={() => {
                  onSelect(p);
                  setQuery(p.name);
                  setOpen(false);
                }}
              >
                <div className="h-8 w-8 rounded-sm bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
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
                <div className="min-w-0">
                  <div className="text-sm font-medium text-primary-dark truncate">
                    {p.name}
                  </div>
                  <div className="text-[11px] text-secondary-muted truncate">
                    {[p.default_code, p.uom, `$${Number(p.list_price).toFixed(2)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
