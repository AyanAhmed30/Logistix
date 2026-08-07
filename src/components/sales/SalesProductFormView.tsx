"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  Package,
  Save,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSalesProduct,
  getSalesProductById,
  getSalesProductCategories,
  getSalesProductUoms,
  setSalesProductActive,
  updateSalesProduct,
  uploadSalesProductImage,
  upsertSalesProductCategory,
  type SalesProductCategory,
  type SalesProductUom,
} from "@/app/actions/sales/products";
import { searchAccountingTaxes } from "@/app/actions/accounting/taxes";
import { getAccountingChartAccounts } from "@/app/actions/accounting/journal-entries";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { SalesPageSkeleton } from "@/components/sales/SalesSkeleton";
import { productCustomerTaxPercent } from "@/lib/product-accounting";
import { cn } from "@/lib/utils";

type Props = {
  productId: string | null;
  /** Product routes base (Sales or Accounting embed). */
  basePath?: string;
};

type TaxOpt = {
  id: string;
  name: string;
  code?: string | null;
  rate_value?: number;
  rate_type?: string | null;
  amount_type?: string | null;
  scope?: string | null;
};

type AccountOpt = {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  account_type?: string | null;
};

type TabKey = "general" | "inventory" | "accounting";

export function SalesProductFormView({
  productId,
  basePath = "/sales/products",
}: Props) {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(Boolean(productId));
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<TabKey>("general");

  const [name, setName] = useState("");
  const [defaultCode, setDefaultCode] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [uom, setUom] = useState("Units");
  const [listPrice, setListPrice] = useState("0");
  const [cost, setCost] = useState("0");
  const [description, setDescription] = useState("");
  const [descriptionSale, setDescriptionSale] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [saleOk, setSaleOk] = useState(true);
  const [purchaseOk, setPurchaseOk] = useState(true);
  const [productType, setProductType] = useState<"goods" | "service" | "combo">(
    "goods"
  );
  const [trackInventory, setTrackInventory] = useState(false);
  const [weight, setWeight] = useState("0");
  const [volume, setVolume] = useState("0");
  const [customerTaxIds, setCustomerTaxIds] = useState<string[]>([]);
  const [vendorTaxIds, setVendorTaxIds] = useState<string[]>([]);
  const [incomeAccountId, setIncomeAccountId] = useState<string | null>(null);
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null);

  const [categories, setCategories] = useState<SalesProductCategory[]>([]);
  const [uoms, setUoms] = useState<SalesProductUom[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [saleTaxes, setSaleTaxes] = useState<TaxOpt[]>([]);
  const [purchaseTaxes, setPurchaseTaxes] = useState<TaxOpt[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<AccountOpt[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<AccountOpt[]>([]);
  const [taxSearch, setTaxSearch] = useState("");
  const [vendorTaxSearch, setVendorTaxSearch] = useState("");
  const [incomeSearch, setIncomeSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cats, uomRes, saleTaxRes, purchTaxRes, incomeRes, expenseRes] =
        await Promise.all([
          getSalesProductCategories(),
          getSalesProductUoms(),
          searchAccountingTaxes({ scope: "sale", limit: 100 }),
          searchAccountingTaxes({ scope: "purchase", limit: 100 }),
          getAccountingChartAccounts(undefined, {
            types: ["income"],
            limit: 120,
          }),
          getAccountingChartAccounts(undefined, {
            types: ["expense"],
            limit: 120,
          }),
        ]);
      if (cancelled) return;
      if ("categories" in cats) setCategories(cats.categories || []);
      if ("uoms" in uomRes) setUoms(uomRes.uoms || []);
      if ("taxes" in saleTaxRes) setSaleTaxes((saleTaxRes.taxes as TaxOpt[]) || []);
      if ("taxes" in purchTaxRes)
        setPurchaseTaxes((purchTaxRes.taxes as TaxOpt[]) || []);
      if ("accounts" in incomeRes)
        setIncomeAccounts((incomeRes.accounts as AccountOpt[]) || []);
      if ("accounts" in expenseRes)
        setExpenseAccounts((expenseRes.accounts as AccountOpt[]) || []);

      if (productId) {
        const res = await getSalesProductById(productId);
        if (cancelled) return;
        if ("error" in res && res.error) {
          toast.error(res.error);
          setLoading(false);
          return;
        }
        if ("product" in res && res.product) {
          const p = res.product;
          setName(p.name);
          setDefaultCode(p.default_code || "");
          setCategoryId(p.category_id);
          setUom(p.uom || "Units");
          setListPrice(String(p.list_price));
          setCost(String(p.standard_price));
          setDescription(p.description || "");
          setDescriptionSale(p.description_sale || "");
          setImageUrl(p.image_url);
          setActive(p.active);
          setSaleOk(p.sale_ok !== false);
          setPurchaseOk(p.purchase_ok !== false);
          setProductType(p.product_type || "goods");
          setTrackInventory(Boolean(p.track_inventory));
          setWeight(String(p.weight || 0));
          setVolume(String(p.volume || 0));
          setCustomerTaxIds(p.customer_tax_ids || []);
          setVendorTaxIds(p.vendor_tax_ids || []);
          setIncomeAccountId(p.income_account_id);
          setExpenseAccountId(p.expense_account_id);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const salesTaxPreview = useMemo(() => {
    const selected = saleTaxes.filter((t) => customerTaxIds.includes(t.id));
    const rate = productCustomerTaxPercent({
      id: "preview",
      customer_taxes: selected,
    });
    const price = parseFloat(listPrice) || 0;
    const incl = Math.round(price * (1 + rate / 100) * 100) / 100;
    return { rate, incl };
  }, [saleTaxes, customerTaxIds, listPrice]);

  function toggleTax(id: string, kind: "customer" | "vendor") {
    if (kind === "customer") {
      setCustomerTaxIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else {
      setVendorTaxIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  }

  function save() {
    if (isAdminContext) {
      toast.info("Select a specific organization to save products.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name,
        default_code: defaultCode || null,
        category_id: categoryId,
        uom,
        list_price: parseFloat(listPrice) || 0,
        standard_price: parseFloat(cost) || 0,
        description: description || null,
        description_sale: descriptionSale || null,
        image_url: imageUrl,
        active,
        sale_ok: saleOk,
        purchase_ok: purchaseOk,
        product_type: productType,
        track_inventory: trackInventory,
        weight: parseFloat(weight) || 0,
        volume: parseFloat(volume) || 0,
        income_account_id: incomeAccountId,
        expense_account_id: expenseAccountId,
        customer_tax_ids: customerTaxIds,
        vendor_tax_ids: vendorTaxIds,
      };
      const res = productId
        ? await updateSalesProduct(productId, payload)
        : await createSalesProduct(payload);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(productId ? "Product saved" : "Product created");
      if (!productId && res.product) {
        router.replace(`${basePath}/${res.product.id}`);
      }
    });
  }

  function handleImage(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadSalesProductImage(productId || "new", fd);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("url" in res && res.url) {
        setImageUrl(res.url);
        toast.success("Image uploaded");
      }
    });
  }

  const filteredSaleTaxes = useMemo(() => {
    const q = taxSearch.trim().toLowerCase();
    if (!q) return saleTaxes;
    return saleTaxes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        String(t.code || "")
          .toLowerCase()
          .includes(q)
    );
  }, [saleTaxes, taxSearch]);

  const filteredPurchaseTaxes = useMemo(() => {
    const q = vendorTaxSearch.trim().toLowerCase();
    if (!q) return purchaseTaxes;
    return purchaseTaxes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        String(t.code || "")
          .toLowerCase()
          .includes(q)
    );
  }, [purchaseTaxes, vendorTaxSearch]);

  const filteredIncome = useMemo(() => {
    const q = incomeSearch.trim().toLowerCase();
    if (!q) return incomeAccounts;
    return incomeAccounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [incomeAccounts, incomeSearch]);

  const filteredExpense = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    if (!q) return expenseAccounts;
    return expenseAccounts.filter(
      (a) =>
        a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );
  }, [expenseAccounts, expenseSearch]);

  if (loading) {
    return (
      <div className="p-4">
        <SalesPageSkeleton rows={6} />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: "General Information" },
    { key: "inventory", label: "Inventory" },
    { key: "accounting", label: "Accounting" },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => router.push(basePath)}
        >
          <ArrowLeft className="h-4 w-4" />
          Products
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-[#017e84] hover:bg-[#016970] text-white"
          disabled={isPending}
          onClick={save}
        >
          <Save className="h-4 w-4" />
          Save
        </Button>
        {productId ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const res = await setSalesProductActive(productId, !active);
                if ("error" in res && res.error) {
                  toast.error(res.error);
                  return;
                }
                setActive(!active);
                toast.success(active ? "Product archived" : "Product restored");
              });
            }}
          >
            <Archive className="h-4 w-4" />
            {active ? "Archive" : "Unarchive"}
          </Button>
        ) : null}
      </div>

      {/* Odoo-style header: name + can be sold/purchased + image */}
      <div className="px-4 sm:px-6 pt-5 pb-3 grid grid-cols-1 lg:grid-cols-[1fr_140px] gap-4 border-b border-slate-100">
        <div className="min-w-0 space-y-3">
          <Input
            className="h-11 rounded-sm text-xl font-semibold border-0 border-b border-slate-200 shadow-none px-0 focus-visible:ring-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
          />
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-primary-dark cursor-pointer">
              <Checkbox
                checked={saleOk}
                onCheckedChange={(v) => setSaleOk(v === true)}
              />
              Sales
            </label>
            <label className="flex items-center gap-2 text-sm text-primary-dark cursor-pointer">
              <Checkbox
                checked={purchaseOk}
                onCheckedChange={(v) => setPurchaseOk(v === true)}
              />
              Purchase
            </label>
          </div>
        </div>
        <div className="space-y-2 justify-self-start lg:justify-self-end">
          <div className="h-[120px] w-[120px] rounded-sm border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-10 w-10 text-slate-300" />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0] || null)}
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 rounded-sm text-xs px-2"
              onClick={() => fileRef.current?.click()}
              disabled={isPending}
            >
              <Upload className="h-3 w-3" />
              {imageUrl ? "Replace" : "Upload"}
            </Button>
            {imageUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setImageUrl(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 border-b border-slate-200">
        <div className="flex gap-5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative py-2.5 text-sm whitespace-nowrap transition-colors",
                tab === t.key
                  ? "text-[#017e84] font-medium"
                  : "text-secondary-muted hover:text-primary-dark"
              )}
            >
              {t.label}
              {tab === t.key ? (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#017e84]" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {tab === "general" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-4 max-w-4xl">
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-secondary-muted">Product Type</Label>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(
                    [
                      ["goods", "Goods"],
                      ["service", "Service"],
                      ["combo", "Combo"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="product_type"
                        className="accent-[#017e84]"
                        checked={productType === value}
                        onChange={() => {
                          setProductType(value);
                          if (value === "service") setTrackInventory(false);
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              {productType === "goods" ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={trackInventory}
                    onCheckedChange={(v) => setTrackInventory(v === true)}
                  />
                  Track Inventory
                </label>
              ) : null}
              <div>
                <Label className="text-xs text-secondary-muted">
                  Internal Reference
                </Label>
                <Input
                  className="mt-1 h-9 rounded-sm"
                  value={defaultCode}
                  onChange={(e) => setDefaultCode(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">
                  Unit of Measure
                </Label>
                <Select value={uom} onValueChange={setUom}>
                  <SelectTrigger className="mt-1 h-9 rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(uoms.length
                      ? uoms.map((u) => ({ value: u.code, label: u.name }))
                      : [
                          { value: "Units", label: "Units" },
                          { value: "Piece", label: "Piece" },
                          { value: "Kg", label: "Kg" },
                          { value: "Box", label: "Box" },
                          { value: "Hour", label: "Hour" },
                        ]
                    ).map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Category</Label>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
                >
                  <SelectTrigger className="mt-1 h-9 rounded-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 flex gap-2">
                  <Input
                    className="h-8 rounded-sm"
                    placeholder="New category name"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-sm"
                    disabled={isPending || !newCategory.trim()}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await upsertSalesProductCategory({
                          name: newCategory.trim(),
                        });
                        if ("error" in res && res.error) {
                          toast.error(res.error);
                          return;
                        }
                        if ("category" in res && res.category) {
                          setCategories((prev) => [...prev, res.category!]);
                          setCategoryId(res.category.id);
                          setNewCategory("");
                          toast.success("Category created");
                        }
                      });
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs text-secondary-muted">Sales Price</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9 rounded-sm"
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value)}
                  />
                  <span className="text-xs text-secondary-muted whitespace-nowrap">
                    per {uom || "Units"}
                  </span>
                </div>
                {salesTaxPreview.rate > 0 ? (
                  <p className="mt-1 text-xs text-[#017e84]">
                    (= Rs. {salesTaxPreview.incl.toFixed(2)} Incl. Taxes)
                  </p>
                ) : null}
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Sales Taxes</Label>
                <Input
                  className="mt-1 h-8 rounded-sm text-xs"
                  placeholder="Search taxes…"
                  value={taxSearch}
                  onChange={(e) => setTaxSearch(e.target.value)}
                />
                <div className="mt-1 max-h-36 overflow-y-auto rounded-sm border border-slate-200 divide-y divide-slate-100">
                  {filteredSaleTaxes.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-secondary-muted">
                      No sale taxes found. Configure under Accounting → Taxes.
                    </p>
                  ) : (
                    filteredSaleTaxes.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={customerTaxIds.includes(t.id)}
                          onCheckedChange={() => toggleTax(t.id, "customer")}
                        />
                        <span className="truncate">
                          {t.name}
                          {t.rate_value != null
                            ? ` (${t.rate_value}${
                                t.rate_type === "fixed" ? "" : "%"
                              })`
                            : ""}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="mt-1 h-9 rounded-sm"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
            </div>

            <div className="lg:col-span-2 space-y-3 pt-2">
              <div>
                <Label className="text-xs text-secondary-muted uppercase tracking-wide">
                  Sales Description
                </Label>
                <Textarea
                  className="mt-1 min-h-[72px] rounded-sm"
                  value={descriptionSale}
                  onChange={(e) => setDescriptionSale(e.target.value)}
                  placeholder="Shown on quotations and invoices"
                />
              </div>
              <div>
                <Label className="text-xs text-secondary-muted uppercase tracking-wide">
                  Internal Notes
                </Label>
                <Textarea
                  className="mt-1 min-h-[72px] rounded-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}

        {tab === "inventory" ? (
          <div className="max-w-xl space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
              Logistics
            </h3>
            {!trackInventory && productType === "goods" ? (
              <p className="text-sm text-secondary-muted">
                Enable <span className="font-medium">Track Inventory</span> on
                General Information to prepare this product for stock moves.
              </p>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-secondary-muted">Weight</Label>
                <div className="mt-1 relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9 rounded-sm pr-10"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary-muted">
                    kg
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Volume</Label>
                <div className="mt-1 relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    className="h-9 rounded-sm pr-10"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary-muted">
                    m³
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "accounting" ? (
          <div className="max-w-3xl space-y-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-secondary-muted mb-3">
                Cost and Revenue
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Income Account
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-sm text-xs"
                    placeholder="Search income accounts…"
                    value={incomeSearch}
                    onChange={(e) => setIncomeSearch(e.target.value)}
                  />
                  <Select
                    value={incomeAccountId || "none"}
                    onValueChange={(v) =>
                      setIncomeAccountId(v === "none" ? null : v)
                    }
                  >
                    <SelectTrigger className="mt-1 h-9 rounded-sm">
                      <SelectValue placeholder="From Category / Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Default (Sales Revenue 4100)
                      </SelectItem>
                      {filteredIncome.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-secondary-muted">
                    Used when posting customer invoices / credit notes.
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-secondary-muted">
                    Expense Account
                  </Label>
                  <Input
                    className="mt-1 h-8 rounded-sm text-xs"
                    placeholder="Search expense accounts…"
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                  />
                  <Select
                    value={expenseAccountId || "none"}
                    onValueChange={(v) =>
                      setExpenseAccountId(v === "none" ? null : v)
                    }
                  >
                    <SelectTrigger className="mt-1 h-9 rounded-sm">
                      <SelectValue placeholder="From Category / Default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Default (COGS / Expense 5100)
                      </SelectItem>
                      {filteredExpense.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-secondary-muted">
                    Used on vendor bills and future inventory valuation.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-secondary-muted">
                  Customer Taxes
                </Label>
                <p className="text-[11px] text-secondary-muted mb-1">
                  Default taxes on quotations, sales orders, invoices & credit
                  notes.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-sm border border-slate-200 divide-y divide-slate-100">
                  {saleTaxes.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-secondary-muted">
                      No sale-scope taxes configured.
                    </p>
                  ) : (
                    saleTaxes.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={customerTaxIds.includes(t.id)}
                          onCheckedChange={() => toggleTax(t.id, "customer")}
                        />
                        <span className="truncate">{t.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">
                  Vendor Taxes
                </Label>
                <p className="text-[11px] text-secondary-muted mb-1">
                  Default taxes on vendor bills and refunds.
                </p>
                <Input
                  className="mb-1 h-8 rounded-sm text-xs"
                  placeholder="Search vendor taxes…"
                  value={vendorTaxSearch}
                  onChange={(e) => setVendorTaxSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto rounded-sm border border-slate-200 divide-y divide-slate-100">
                  {filteredPurchaseTaxes.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-secondary-muted">
                      No purchase-scope taxes configured.
                    </p>
                  ) : (
                    filteredPurchaseTaxes.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={vendorTaxIds.includes(t.id)}
                          onCheckedChange={() => toggleTax(t.id, "vendor")}
                        />
                        <span className="truncate">
                          {t.name}
                          {t.rate_value != null
                            ? ` (${t.rate_value}${
                                t.rate_type === "fixed" ? "" : "%"
                              })`
                            : ""}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
