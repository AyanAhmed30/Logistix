"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createChartOfAccount,
  getChartOfAccounts,
  setChartOfAccountActiveState,
  updateChartOfAccount,
  type ChartOfAccount,
} from "@/app/actions/chart_of_accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit2, Plus, Power, RefreshCcw, Save } from "lucide-react";

type AccountTypeOption = ChartOfAccount["type"];

type AccountFormState = {
  id: string | null;
  name: string;
  code: string;
  type: AccountTypeOption;
  parent_id: string;
  allow_reconciliation: boolean;
  is_active: boolean;
};

const ACCOUNT_TYPE_OPTIONS: { value: AccountTypeOption; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "view", label: "View" },
];

function createEmptyForm(): AccountFormState {
  return {
    id: null,
    name: "",
    code: "",
    type: "asset",
    parent_id: "",
    allow_reconciliation: false,
    is_active: true,
  };
}

function formatAccountType(type: AccountTypeOption) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getNormalBalanceLabel(type: AccountTypeOption) {
  if (type === "asset" || type === "expense") {
    return "Debit";
  }
  if (type === "liability" || type === "equity" || type === "income") {
    return "Credit";
  }
  return "N/A";
}

export function ChartOfAccountsPanel() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState<AccountFormState>(createEmptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getChartOfAccounts();
      if ("error" in result) {
        setLoadError(result.error || "Failed to load chart of accounts.");
        setAccounts([]);
      } else {
        setLoadError(null);
        setAccounts(result.accounts || []);
      }
    } catch {
      setLoadError("Failed to load chart of accounts.");
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const parentOptions = useMemo(
    () => accounts.filter((account) => account.type === "view" && account.id !== form.id),
    [accounts, form.id]
  );

  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return accounts;
    }

    return accounts.filter((account) => {
      return (
        account.name.toLowerCase().includes(query) ||
        account.code.toLowerCase().includes(query) ||
        account.type.toLowerCase().includes(query) ||
        (account.parent_name || "").toLowerCase().includes(query)
      );
    });
  }, [accounts, searchQuery]);

  function resetForm() {
    setForm(createEmptyForm());
  }

  function openCreateDialog() {
    resetForm();
    setEditorOpen(true);
  }

  function handleEdit(account: ChartOfAccount) {
    setForm({
      id: account.id,
      name: account.name,
      code: account.code,
      type: account.type,
      parent_id: account.parent_id || "",
      allow_reconciliation: account.allow_reconciliation,
      is_active: account.is_active,
    });
    setEditorOpen(true);
  }

  function handleTypeChange(value: AccountTypeOption) {
    setForm((current) => ({
      ...current,
      type: value,
      allow_reconciliation: value === "view" ? false : current.allow_reconciliation,
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const payload = {
        id: form.id ?? undefined,
        name: form.name,
        code: form.code,
        type: form.type,
        parent_id: form.parent_id || null,
        allow_reconciliation: form.allow_reconciliation,
        is_active: form.is_active,
      };

      const result = form.id
        ? await updateChartOfAccount(payload)
        : await createChartOfAccount(payload);

      if ("error" in result) {
        toast.error(result.error || "Unable to save account.");
        return;
      }

      toast.success(form.id ? "Account updated successfully." : "Account created successfully.");
      setEditorOpen(false);
      resetForm();
      await loadAccounts();
    });
  }

  function handleToggleActive(account: ChartOfAccount) {
    const nextState = !account.is_active;
    const confirmed = window.confirm(
      nextState
        ? `Activate account "${account.name}"?`
        : `Deactivate account "${account.name}"?`
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await setChartOfAccountActiveState(account.id, nextState);
      if ("error" in result) {
        toast.error(result.error || "Unable to update account status.");
        return;
      }

      toast.success(
        nextState ? "Account activated successfully." : "Account deactivated successfully."
      );
      await loadAccounts();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Chart of Accounts</CardTitle>
              <CardDescription className="mt-1">
                Odoo-style simple list view for account setup.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openCreateDialog} disabled={isPending}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
              <Button type="button" variant="outline" onClick={loadAccounts} disabled={isLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search accounts..."
              className="w-full md:w-80"
            />
            <div className="text-xs text-slate-500">
              {isLoading ? "Loading accounts..." : `${filteredAccounts.length} account(s)`}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loadError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead className="w-40">Parent</TableHead>
                  <TableHead className="w-36">Reconciliation</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-48 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      {isLoading ? "Loading chart of accounts..." : "No accounts found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.code}</TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${account.depth * 18}px` }}
                        >
                          <span className="font-medium text-slate-900">{account.name}</span>
                          {!account.can_post ? (
                            <Badge variant="outline" className="text-[10px]">
                              View
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{formatAccountType(account.type)}</TableCell>
                      <TableCell className="text-slate-600">
                        {account.parent_name || "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {account.allow_reconciliation ? "Yes" : "No"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={account.is_active ? "" : "text-slate-500"}
                        >
                          {account.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(account)}
                            disabled={isPending}
                          >
                            <Edit2 className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(account)}
                            disabled={isPending}
                          >
                            <Power className="mr-1 h-3.5 w-3.5" />
                            {account.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Account" : "Create Account"}</DialogTitle>
            <DialogDescription>
              Keep setup simple. Parent accounts must be view accounts, and normal accounting rules
              remain unchanged.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="coa-name">Account Name</Label>
                <Input
                  id="coa-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Enter account name"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="coa-code">Account Code</Label>
                <Input
                  id="coa-code"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                  }
                  placeholder="e.g. 1100"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={handleTypeChange} disabled={isPending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Parent Account</Label>
                <Select
                  value={form.parent_id || "none"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      parent_id: value === "none" ? "" : value,
                    }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select parent account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent</SelectItem>
                    {parentOptions.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="coa-reconciliation"
                  checked={form.type === "view" ? false : form.allow_reconciliation}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      allow_reconciliation:
                        current.type === "view" ? false : Boolean(checked),
                    }))
                  }
                  disabled={isPending || form.type === "view"}
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium text-slate-900">
                    Allow reconciliation
                  </span>
                  <p className="text-xs text-slate-500">
                    Enable this for payable and receivable style accounts.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="coa-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      is_active: Boolean(checked),
                    }))
                  }
                  disabled={isPending}
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium text-slate-900">Active</span>
                  <p className="text-xs text-slate-500">
                    Disable instead of deleting important accounts.
                  </p>
                </div>
              </label>
            </div>

            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Normal balance: {getNormalBalanceLabel(form.type)}
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 h-4 w-4" />
                {form.id
                  ? isPending
                    ? "Updating..."
                    : "Update Account"
                  : isPending
                    ? "Creating..."
                    : "Create Account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditorOpen(false);
                  resetForm();
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
