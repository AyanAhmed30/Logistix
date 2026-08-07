"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAccountingAssetCategories,
  saveAccountingAssetCategory,
  type AccountingAssetCategory,
} from "@/app/actions/accounting/assets";
import { getAccountingJournals, getAccountingChartAccounts } from "@/app/actions/accounting/journal-entries";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";

export function AccountingAssetCategoriesView() {
  const router = useRouter();
  const { isAdminContext } = useAdminOrganization();
  const [categories, setCategories] = useState<AccountingAssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingAssetCategory | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState("straight_line");
  const [period, setPeriod] = useState("monthly");
  const [life, setLife] = useState("36");
  const [journalId, setJournalId] = useState("");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [deprAccountId, setDeprAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [journals, setJournals] = useState<{ id: string; code: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all([
      getAccountingAssetCategories(),
      getAccountingJournals(),
      getAccountingChartAccounts(),
    ]).then(([cats, jrn, acc]) => {
      if ("error" in cats && cats.error) toast.error(cats.error);
      else setCategories(cats.categories || []);
      if (!("error" in jrn)) {
        setJournals(
          (jrn.journals || []).map((j) => ({
            id: String(j.id),
            code: String(j.code || ""),
            name: String(j.name || ""),
          }))
        );
      }
      if (!("error" in acc)) {
        setAccounts(
          (acc.accounts || []).map((a) => ({
            id: String(a.id),
            code: String(a.code || ""),
            name: String(a.name || ""),
          }))
        );
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    if (isAdminContext) {
      toast.info("Select a specific organization.");
      return;
    }
    setEditing(null);
    setName("");
    setCode("");
    setMethod("straight_line");
    setPeriod("monthly");
    setLife("36");
    setJournalId("");
    setAssetAccountId("");
    setDeprAccountId("");
    setExpenseAccountId("");
    setOpen(true);
  }

  function openEdit(c: AccountingAssetCategory) {
    setEditing(c);
    setName(c.name);
    setCode(c.code || "");
    setMethod(c.depreciation_method);
    setPeriod(c.method_period);
    setLife(String(c.useful_life_months));
    setJournalId(c.journal_id || "");
    setAssetAccountId(c.asset_account_id || "");
    setDeprAccountId(c.depreciation_account_id || "");
    setExpenseAccountId(c.expense_account_id || "");
    setOpen(true);
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveAccountingAssetCategory({
        id: editing?.id,
        name,
        code: code || null,
        depreciation_method: method as "straight_line" | "declining_balance" | "manual",
        method_period: period as "monthly" | "yearly",
        useful_life_months: parseInt(life, 10) || 36,
        journal_id: journalId || null,
        asset_account_id: assetAccountId || null,
        depreciation_account_id: deprAccountId || null,
        expense_account_id: expenseAccountId || null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(editing ? "Category updated" : "Category created");
      setOpen(false);
      load();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 rounded-sm"
          onClick={() => router.push("/accounting/assets")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Assets
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
          onClick={openNew}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Category
        </Button>
      </div>

      {loading ? (
        <AccountingTableSkeleton rows={8} cols={5} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Useful Life</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-[#017e84]/5"
                  onClick={() => openEdit(c)}
                >
                  <TableCell className="font-medium text-[#017e84]">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm">{c.code || "—"}</TableCell>
                  <TableCell className="text-sm capitalize">
                    {c.depreciation_method.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{c.method_period}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {c.useful_life_months} mo
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Category" : "New Asset Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-9 rounded-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="h-9 w-full rounded-sm border border-slate-200 px-2 text-sm"
                >
                  <option value="straight_line">Straight Line</option>
                  <option value="declining_balance">Declining Balance</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Period</Label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="h-9 w-full rounded-sm border border-slate-200 px-2 text-sm"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Useful Life (months)</Label>
              <Input value={life} onChange={(e) => setLife(e.target.value)} className="h-9 rounded-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Journal</Label>
              <select
                value={journalId}
                onChange={(e) => setJournalId(e.target.value)}
                className="h-9 w-full rounded-sm border border-slate-200 px-2 text-sm"
              >
                <option value="">—</option>
                {journals.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} — {j.name}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ["Asset Account", assetAccountId, setAssetAccountId],
                ["Accum. Depreciation", deprAccountId, setDeprAccountId],
                ["Expense Account", expenseAccountId, setExpenseAccountId],
              ] as const
            ).map(([label, val, setVal]) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <select
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  className="h-9 w-full rounded-sm border border-slate-200 px-2 text-sm"
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-8 rounded-sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
              disabled={isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
