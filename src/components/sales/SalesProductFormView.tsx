"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Archive, Package, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { SalesPageSkeleton } from "@/components/sales/SalesSkeleton";

type Props = { productId: string | null };

export function SalesProductFormView({ productId }: Props) {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(Boolean(productId));
  const fileRef = useRef<HTMLInputElement | null>(null);

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
  const [categories, setCategories] = useState<SalesProductCategory[]>([]);
  const [uoms, setUoms] = useState<SalesProductUom[]>([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cats, uomRes] = await Promise.all([
        getSalesProductCategories(),
        getSalesProductUoms(),
      ]);
      if (cancelled) return;
      if ("categories" in cats) setCategories(cats.categories || []);
      if ("uoms" in uomRes) setUoms(uomRes.uoms || []);

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
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

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
        router.replace(`/sales/products/${res.product.id}`);
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

  if (loading) {
    return (
      <div className="p-4">
        <SalesPageSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50/80">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => router.push("/sales/products")}
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

      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <div className="space-y-2">
          <div className="h-48 w-full max-w-[200px] rounded-sm border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-12 w-12 text-slate-300" />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImage(e.target.files?.[0] || null)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-sm"
              onClick={() => fileRef.current?.click()}
              disabled={isPending}
            >
              <Upload className="h-3.5 w-3.5" />
              {imageUrl ? "Replace" : "Upload"}
            </Button>
            {imageUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setImageUrl(null)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 max-w-2xl">
          <div>
            <Label className="text-xs text-secondary-muted">Product Name</Label>
            <Input
              className="mt-1 h-9 rounded-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-secondary-muted">
                Internal Reference (SKU)
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
          </div>

          <div>
            <Label className="text-xs text-secondary-muted">Category</Label>
            <div className="mt-1 flex gap-2">
              <Select
                value={categoryId || "none"}
                onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9 rounded-sm flex-1">
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
            </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-secondary-muted">Sales Price</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 h-9 rounded-sm"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
              />
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

          <div>
            <Label className="text-xs text-secondary-muted">
              Sales Description
            </Label>
            <Textarea
              className="mt-1 min-h-[80px] rounded-sm"
              value={descriptionSale}
              onChange={(e) => setDescriptionSale(e.target.value)}
              placeholder="Shown on quotations"
            />
          </div>
          <div>
            <Label className="text-xs text-secondary-muted">
              Internal Description
            </Label>
            <Textarea
              className="mt-1 min-h-[80px] rounded-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
