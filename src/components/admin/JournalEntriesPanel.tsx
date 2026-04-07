"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelJournalEntry,
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntries,
  postJournalEntry,
  updateJournalEntry,
  type JournalEntry,
  type JournalEntryLineInput,
  type JournalEntryStatus,
} from "@/app/actions/journal_entries";
import type { JournalType } from "@/app/actions/journals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

type JournalOption = {
  id: string;
  name: string;
  code: string;
  type: JournalType;
  is_active: boolean;
};

type AccountOption = {
  id: string;
  name: string;
  code: string;
  type: string;
  is_active: boolean;
};

type EditableLine = {
  localId: string;
  account_id: string;
  partner_reference: string;
  description: string;
  debit_amount: string;
  credit_amount: string;
};

type EntryFormState = {
  id: string | null;
  reference: string;
  entry_date: string;
  journal_id: string;
  status: JournalEntryStatus;
  lines: EditableLine[];
};

const STATUS_OPTIONS: { value: JournalEntryStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "cancelled", label: "Cancelled" },
];

function createEmptyLine(): EditableLine {
  return {
    localId: crypto.randomUUID(),
    account_id: "",
    partner_reference: "",
    description: "",
    debit_amount: "",
    credit_amount: "",
  };
}

function createEmptyForm(): EntryFormState {
  return {
    id: null,
    reference: "",
    entry_date: new Date().toISOString().slice(0, 10),
    journal_id: "",
    status: "draft",
    lines: [createEmptyLine(), createEmptyLine()],
  };
}

function formatStatus(status: JournalEntryStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function buildLinePayload(lines: EditableLine[]): JournalEntryLineInput[] {
  return lines.map((line) => ({
    account_id: line.account_id,
    partner_reference: line.partner_reference || null,
    description: line.description,
    debit_amount: Number(line.debit_amount || 0),
    credit_amount: Number(line.credit_amount || 0),
  }));
}

export function JournalEntriesPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [journals, setJournals] = useState<JournalOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<JournalEntryStatus | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState<EntryFormState>(createEmptyForm);
  const [isPending, startTransition] = useTransition();

  const loadEntries = useCallback(async (filter: JournalEntryStatus | "all" = statusFilter) => {
    setIsLoading(true);
    try {
      const result = await getJournalEntries(filter);
      if ("error" in result) {
        setLoadError(result.error || "Failed to load journal entries.");
        setEntries([]);
        setJournals([]);
        setAccounts([]);
      } else {
        setLoadError(null);
        setEntries(result.entries || []);
        setJournals((result.journals || []) as JournalOption[]);
        setAccounts((result.accounts || []) as AccountOption[]);
      }
    } catch {
      setLoadError("Failed to load journal entries.");
      setEntries([]);
      setJournals([]);
      setAccounts([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadEntries(statusFilter);
  }, [loadEntries, statusFilter]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return entries;
    }

    return entries.filter((entry) => {
      return (
        entry.reference.toLowerCase().includes(query) ||
        (entry.journal_name || "").toLowerCase().includes(query) ||
        (entry.journal_code || "").toLowerCase().includes(query) ||
        entry.status.toLowerCase().includes(query)
      );
    });
  }, [entries, searchQuery]);

  const totalDebit = useMemo(
    () =>
      form.lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0).toFixed(2),
    [form.lines]
  );

  const totalCredit = useMemo(
    () =>
      form.lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0).toFixed(2),
    [form.lines]
  );

  function resetForm() {
    setForm(createEmptyForm());
  }

  function openCreateDialog() {
    setSelectedEntry(null);
    resetForm();
    setEditorOpen(true);
  }

  function openEntry(entry: JournalEntry) {
    setSelectedEntry(entry);
  }

  function handleEdit(entry: JournalEntry) {
    if (entry.status === "posted") {
      toast.error("Posted entries cannot be modified.");
      return;
    }

    setSelectedEntry(entry);
    setForm({
      id: entry.id,
      reference: entry.reference,
      entry_date: entry.entry_date,
      journal_id: entry.journal_id,
      status: entry.status,
      lines: entry.lines.map((line) => ({
        localId: line.id,
        account_id: line.account_id,
        partner_reference: line.partner_reference || "",
        description: line.description || "",
        debit_amount: line.debit_amount ? String(line.debit_amount) : "",
        credit_amount: line.credit_amount ? String(line.credit_amount) : "",
      })),
    });
    setEditorOpen(true);
  }

  function updateLine(localId: string, updates: Partial<EditableLine>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.localId === localId ? { ...line, ...updates } : line
      ),
    }));
  }

  function addLine() {
    setForm((current) => ({
      ...current,
      lines: [...current.lines, createEmptyLine()],
    }));
  }

  function removeLine(localId: string) {
    setForm((current) => {
      if (current.lines.length <= 2) {
        return current;
      }
      return {
        ...current,
        lines: current.lines.filter((line) => line.localId !== localId),
      };
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      const payload = {
        id: form.id ?? undefined,
        reference: form.reference,
        entry_date: form.entry_date,
        journal_id: form.journal_id,
        lines: buildLinePayload(form.lines),
      };

      const result = form.id
        ? await updateJournalEntry(payload)
        : await createJournalEntry(payload);

      if ("error" in result) {
        toast.error(result.error || "Unable to save journal entry.");
        return;
      }

      toast.success(form.id ? "Journal entry updated successfully." : "Journal entry created.");
      setEditorOpen(false);
      resetForm();
      await loadEntries(statusFilter);
    });
  }

  function handlePost(entry: JournalEntry) {
    startTransition(async () => {
      const result = await postJournalEntry(entry.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to post journal entry.");
        return;
      }
      toast.success("Journal entry posted successfully.");
      await loadEntries(statusFilter);
    });
  }

  function handleCancel(entry: JournalEntry) {
    startTransition(async () => {
      const result = await cancelJournalEntry(entry.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to cancel journal entry.");
        return;
      }
      toast.success("Journal entry cancelled successfully.");
      await loadEntries(statusFilter);
    });
  }

  function handleDelete(entry: JournalEntry) {
    const confirmed = window.confirm(`Delete journal entry "${entry.reference}"?`);
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      const result = await deleteJournalEntry(entry.id);
      if ("error" in result) {
        toast.error(result.error || "Unable to delete journal entry.");
        return;
      }
      toast.success("Journal entry deleted successfully.");
      if (selectedEntry?.id === entry.id) {
        setSelectedEntry(null);
      }
      await loadEntries(statusFilter);
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Journal Entries</CardTitle>
              <CardDescription className="mt-1">
                Odoo-style journal entry engine with strict double-entry validation.
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
                onClick={() => loadEntries(statusFilter)}
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
                placeholder="Search journal entries..."
                className="w-full md:w-80"
              />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as JournalEntryStatus | "all")}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-slate-500">
              {isLoading ? "Loading entries..." : `${filteredEntries.length} entry(s)`}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {loadError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Journal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total Debit</TableHead>
                    <TableHead>Total Credit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                        {isLoading ? "Loading journal entries..." : "No journal entries found."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className={selectedEntry?.id === entry.id ? "bg-slate-50" : ""}
                      >
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => openEntry(entry)}
                            className="font-medium text-left text-slate-900 hover:underline"
                          >
                            {entry.reference}
                          </button>
                        </TableCell>
                        <TableCell>{entry.entry_date}</TableCell>
                        <TableCell>{entry.journal_code ? `${entry.journal_code} - ${entry.journal_name}` : "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{formatStatus(entry.status)}</Badge>
                        </TableCell>
                        <TableCell>{formatAmount(entry.total_debit)}</TableCell>
                        <TableCell>{formatAmount(entry.total_credit)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(entry)}
                              disabled={isPending || entry.status === "posted"}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handlePost(entry)}
                              disabled={isPending || entry.status !== "draft"}
                            >
                              Post
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Card className="border shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Entry Details</CardTitle>
                <CardDescription>
                  Review lines and totals for the selected journal entry.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedEntry ? (
                  <div className="text-sm text-slate-500">Select a journal entry to see details.</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 text-sm">
                      <div>
                        <span className="font-medium text-slate-900">Reference: </span>
                        <span className="text-slate-600">{selectedEntry.reference}</span>
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">Date: </span>
                        <span className="text-slate-600">{selectedEntry.entry_date}</span>
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">Journal: </span>
                        <span className="text-slate-600">
                          {selectedEntry.journal_code
                            ? `${selectedEntry.journal_code} - ${selectedEntry.journal_name}`
                            : "-"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Debit</TableHead>
                            <TableHead>Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedEntry.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell>
                                {line.account_code && line.account_name
                                  ? `${line.account_code} - ${line.account_name}`
                                  : "-"}
                              </TableCell>
                              <TableCell>{formatAmount(line.debit_amount)}</TableCell>
                              <TableCell>{formatAmount(line.credit_amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="rounded-md bg-slate-50 p-3 text-sm">
                      <div>Total Debit: {formatAmount(selectedEntry.total_debit)}</div>
                      <div>Total Credit: {formatAmount(selectedEntry.total_credit)}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleEdit(selectedEntry)}
                        disabled={isPending || selectedEntry.status === "posted"}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePost(selectedEntry)}
                        disabled={isPending || selectedEntry.status !== "draft"}
                      >
                        Post
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCancel(selectedEntry)}
                        disabled={isPending || selectedEntry.status !== "draft"}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleDelete(selectedEntry)}
                        disabled={isPending || selectedEntry.status === "posted"}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Journal Entry" : "Create Journal Entry"}</DialogTitle>
            <DialogDescription>
              Every entry must be balanced. Total debit must exactly equal total credit before it
              can be saved and posted.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="entry-reference">Reference</Label>
                <Input
                  id="entry-reference"
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reference: event.target.value }))
                  }
                  placeholder="Enter reference"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="entry-date">Date</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={form.entry_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, entry_date: event.target.value }))
                  }
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>Journal</Label>
                <Select
                  value={form.journal_id}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, journal_id: value }))
                  }
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select journal" />
                  </SelectTrigger>
                  <SelectContent>
                    {journals
                      .filter((journal) => journal.is_active)
                      .map((journal) => (
                        <SelectItem key={journal.id} value={journal.id}>
                          {journal.code} - {journal.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Entry Lines</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Line
                </Button>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Partner is optional for most accounts. For receivable/payable lines, use partner
                reference format: <span className="font-medium">customer:NAME</span> or{" "}
                <span className="font-medium">vendor:NAME</span>.
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="text-right">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.lines.map((line, index) => (
                      <TableRow key={line.localId}>
                        <TableCell className="min-w-52">
                          <Select
                            value={line.account_id || "none"}
                            onValueChange={(value) =>
                              updateLine(line.localId, {
                                account_id: value === "none" ? "" : value,
                              })
                            }
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select account</SelectItem>
                              {accounts
                                .filter((account) => account.is_active && account.type !== "view")
                                .map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.code} - {account.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="min-w-36">
                          <Input
                            value={line.partner_reference}
                            onChange={(event) =>
                              updateLine(line.localId, { partner_reference: event.target.value })
                            }
                            placeholder="Optional partner"
                            disabled={isPending}
                          />
                        </TableCell>
                        <TableCell className="min-w-48">
                          <Input
                            value={line.description}
                            onChange={(event) =>
                              updateLine(line.localId, { description: event.target.value })
                            }
                            placeholder={`Line ${index + 1} description`}
                            disabled={isPending}
                          />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit_amount}
                            onChange={(event) =>
                              updateLine(line.localId, {
                                debit_amount: event.target.value,
                                credit_amount:
                                  Number(event.target.value || 0) > 0 ? "" : line.credit_amount,
                              })
                            }
                            disabled={isPending}
                          />
                        </TableCell>
                        <TableCell className="min-w-28">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit_amount}
                            onChange={(event) =>
                              updateLine(line.localId, {
                                credit_amount: event.target.value,
                                debit_amount:
                                  Number(event.target.value || 0) > 0 ? "" : line.debit_amount,
                              })
                            }
                            disabled={isPending}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line.localId)}
                            disabled={isPending || form.lines.length <= 2}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Total Debit: {totalDebit}
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Total Credit: {totalCredit}
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Balance: {Number(totalDebit) === Number(totalCredit) ? "Balanced" : "Not Balanced"}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={isPending}>
                <Save className="mr-2 h-4 w-4" />
                {form.id
                  ? isPending
                    ? "Updating..."
                    : "Update Entry"
                  : isPending
                    ? "Creating..."
                    : "Create Entry"}
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
