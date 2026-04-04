"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createJournal,
  getJournals,
  setJournalActiveState,
  updateJournal,
  type Journal,
  type JournalType,
} from "@/app/actions/journals";
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

type AccountOption = {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
};

type JournalFormState = {
  id: string | null;
  name: string;
  code: string;
  type: JournalType;
  default_debit_account_id: string;
  default_credit_account_id: string;
  is_active: boolean;
};

const JOURNAL_TYPE_OPTIONS: { value: JournalType; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "purchase", label: "Purchase" },
  { value: "bank", label: "Bank" },
  { value: "cash", label: "Cash" },
  { value: "general", label: "General" },
];

function createEmptyForm(): JournalFormState {
  return {
    id: null,
    name: "",
    code: "",
    type: "general",
    default_debit_account_id: "",
    default_credit_account_id: "",
    is_active: true,
  };
}

function formatJournalType(type: JournalType) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function JournalsPanel() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<JournalType | "all">("all");
  const [form, setForm] = useState<JournalFormState>(createEmptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadJournals = useCallback(async (filter: JournalType | "all" = typeFilter) => {
    setIsLoading(true);
    try {
      const result = await getJournals(filter);
      if ("error" in result) {
        setLoadError(result.error || "Failed to load journals.");
        setJournals([]);
        setAccounts([]);
      } else {
        setLoadError(null);
        setJournals(result.journals || []);
        setAccounts((result.accounts || []) as AccountOption[]);
      }
    } catch {
      setLoadError("Failed to load journals.");
      setJournals([]);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    loadJournals(typeFilter);
  }, [loadJournals, typeFilter]);

  const filteredJournals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return journals;
    }

    return journals.filter((journal) => {
      return (
        journal.name.toLowerCase().includes(query) ||
        journal.code.toLowerCase().includes(query) ||
        journal.type.toLowerCase().includes(query) ||
        (journal.default_debit_account_name || "").toLowerCase().includes(query) ||
        (journal.default_credit_account_name || "").toLowerCase().includes(query)
      );
    });
  }, [journals, searchQuery]);

  function resetForm() {
    setForm(createEmptyForm());
  }

  function openCreateDialog() {
    resetForm();
    setEditorOpen(true);
  }

  function handleEdit(journal: Journal) {
    setForm({
      id: journal.id,
      name: journal.name,
      code: journal.code,
      type: journal.type,
      default_debit_account_id: journal.default_debit_account_id || "",
      default_credit_account_id: journal.default_credit_account_id || "",
      is_active: journal.is_active,
    });
    setEditorOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const payload = {
        id: form.id ?? undefined,
        name: form.name,
        code: form.code,
        type: form.type,
        default_debit_account_id: form.default_debit_account_id || null,
        default_credit_account_id: form.default_credit_account_id || null,
        is_active: form.is_active,
      };

      const result = form.id ? await updateJournal(payload) : await createJournal(payload);

      if ("error" in result) {
        toast.error(result.error || "Unable to save journal.");
        return;
      }

      toast.success(form.id ? "Journal updated successfully." : "Journal created successfully.");
      setEditorOpen(false);
      resetForm();
      await loadJournals(typeFilter);
    });
  }

  function handleToggleActive(journal: Journal) {
    const nextState = !journal.is_active;
    const confirmed = window.confirm(
      nextState
        ? `Activate journal "${journal.name}"?`
        : `Deactivate journal "${journal.name}"?`
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await setJournalActiveState(journal.id, nextState);
      if ("error" in result) {
        toast.error(result.error || "Unable to update journal status.");
        return;
      }

      toast.success(
        nextState ? "Journal activated successfully." : "Journal deactivated successfully."
      );
      await loadJournals(typeFilter);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Journals</CardTitle>
              <CardDescription className="mt-1">
                Odoo-style journal list for simple accounting setup.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openCreateDialog} disabled={isPending}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => loadJournals(typeFilter)}
                disabled={isLoading}
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search journals..."
                className="w-full md:w-80"
              />
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as JournalType | "all")}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {JOURNAL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-slate-500">
              {isLoading ? "Loading journals..." : `${filteredJournals.length} journal(s)`}
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
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Journal</TableHead>
                  <TableHead className="w-32">Type</TableHead>
                  <TableHead>Default Debit Account</TableHead>
                  <TableHead>Default Credit Account</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-48 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJournals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      {isLoading ? "Loading journals..." : "No journals found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredJournals.map((journal) => (
                    <TableRow key={journal.id}>
                      <TableCell className="font-medium">{journal.code}</TableCell>
                      <TableCell className="font-medium text-slate-900">{journal.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatJournalType(journal.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {journal.default_debit_account_code && journal.default_debit_account_name
                          ? `${journal.default_debit_account_code} - ${journal.default_debit_account_name}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {journal.default_credit_account_code && journal.default_credit_account_name
                          ? `${journal.default_credit_account_code} - ${journal.default_credit_account_name}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={journal.is_active ? "" : "text-slate-500"}
                        >
                          {journal.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(journal)}
                            disabled={isPending}
                          >
                            <Edit2 className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(journal)}
                            disabled={isPending}
                          >
                            <Power className="mr-1 h-3.5 w-3.5" />
                            {journal.is_active ? "Deactivate" : "Activate"}
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
            <DialogTitle>{form.id ? "Edit Journal" : "Create Journal"}</DialogTitle>
            <DialogDescription>
              Journals organize transactions by purpose. You can set default fallback accounts and
              disable journals instead of deleting them.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="journal-name">Journal Name</Label>
                <Input
                  id="journal-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Enter journal name"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="journal-code">Journal Code</Label>
                <Input
                  id="journal-code"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                  }
                  placeholder="e.g. SJ"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Journal Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, type: value as JournalType }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select journal type" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURNAL_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="journal-active"
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
                    Disable journals instead of deleting them.
                  </p>
                </div>
              </label>

              <div className="space-y-2">
                <Label>Default Debit Account</Label>
                <Select
                  value={form.default_debit_account_id || "none"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      default_debit_account_id: value === "none" ? "" : value,
                    }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select default debit account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default account</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Credit Account</Label>
                <Select
                  value={form.default_credit_account_id || "none"}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      default_credit_account_id: value === "none" ? "" : value,
                    }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select default credit account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default account</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Journal type guidance: bank and cash journals should use liquidity accounts, sales
              journals should use income-related credit accounts, and purchase journals should use
              expense-related debit accounts.
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 h-4 w-4" />
                {form.id
                  ? isPending
                    ? "Updating..."
                    : "Update Journal"
                  : isPending
                    ? "Creating..."
                    : "Create Journal"}
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
