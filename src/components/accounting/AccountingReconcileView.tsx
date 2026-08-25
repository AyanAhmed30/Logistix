"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Landmark,
  Link2,
  RefreshCw,
  Sparkles,
  Unlink,
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
  acceptAccountingReconciliationSuggestion,
  getAccountingBankReconciliationBootstrap,
  getAccountingJournalItemsToReconcile,
  getAccountingReconciliationSuggestions,
  getAccountingReconciliations,
  unreconcileAccountingReconciliation,
  type JournalItemToReconcile,
  type ReconciliationSuggestion,
} from "@/app/actions/accounting/reconciliation";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { useAccountingShell } from "@/components/accounting/AccountingShell";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";
import { journalEntrySourceHref } from "@/lib/accounting-journal-navigation";

type PartnerGroup = {
  key: string;
  partner: string;
  contactId: string | null;
  items: JournalItemToReconcile[];
  debit: number;
  credit: number;
  residual: number;
};

type AccountGroup = {
  key: string;
  accountLabel: string;
  accountCode: string;
  partners: PartnerGroup[];
  debit: number;
  credit: number;
  residual: number;
  count: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatDateShort(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildGroups(items: JournalItemToReconcile[]): AccountGroup[] {
  const byAccount = new Map<string, JournalItemToReconcile[]>();
  for (const item of items) {
    const key = item.account_id || `${item.account_code}|${item.account_name}`;
    const list = byAccount.get(key) || [];
    list.push(item);
    byAccount.set(key, list);
  }

  const groups: AccountGroup[] = [];
  for (const [accountKey, accountItems] of byAccount) {
    const first = accountItems[0];
    const accountLabel = first.account_code
      ? `${first.account_code} ${first.account_name}`
      : first.account_name || "Account";

    const byPartner = new Map<string, JournalItemToReconcile[]>();
    for (const item of accountItems) {
      const pKey = item.contact_id || item.partner_name || "—";
      const list = byPartner.get(pKey) || [];
      list.push(item);
      byPartner.set(pKey, list);
    }

    const partners: PartnerGroup[] = [];
    for (const [pKey, pItems] of byPartner) {
      partners.push({
        key: `${accountKey}::${pKey}`,
        partner: pItems[0].partner_name || "No Partner",
        contactId: pItems[0].contact_id,
        items: pItems,
        debit: round2(pItems.reduce((s, i) => s + i.debit, 0)),
        credit: round2(pItems.reduce((s, i) => s + i.credit, 0)),
        residual: round2(pItems.reduce((s, i) => s + i.residual, 0)),
      });
    }
    partners.sort((a, b) => a.partner.localeCompare(b.partner));

    groups.push({
      key: accountKey,
      accountLabel,
      accountCode: first.account_code,
      partners,
      debit: round2(accountItems.reduce((s, i) => s + i.debit, 0)),
      credit: round2(accountItems.reduce((s, i) => s + i.credit, 0)),
      residual: round2(accountItems.reduce((s, i) => s + i.residual, 0)),
      count: accountItems.length,
    });
  }

  groups.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  return groups;
}

export function AccountingReconcileView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { switchVersion } = useAdminOrganization();
  const { searchQuery, activeFilterId } = useAccountingShell();
  const debouncedSearch = useDebouncedValue(searchQuery, 280);
  const tabParam = searchParams.get("tab");
  const tab: "items" | "suggestions" | "history" | "bank" =
    tabParam === "suggestions" ||
    tabParam === "history" ||
    tabParam === "bank" ||
    tabParam === "items"
      ? tabParam
      : "items";
  const [items, setItems] = useState<JournalItemToReconcile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>(
    {}
  );
  const [expandedPartners, setExpandedPartners] = useState<Record<string, boolean>>(
    {}
  );
  const [suggestions, setSuggestions] = useState<ReconciliationSuggestion[]>([]);
  const [history, setHistory] = useState<
    {
      id: string;
      name: string;
      reconciliation_date: string;
      status: string;
      match_type: string;
      total_amount: number;
      created_by: string | null;
    }[]
  >([]);
  const [bankInfo, setBankInfo] = useState<{
    journals: { id: string; name: string; code: string }[];
    statements: unknown[];
  }>({ journals: [], statements: [] });
  const [isPending, startTransition] = useTransition();

  const withResidual =
    activeFilterId === "all" ||
    activeFilterId === "with_residual" ||
    !activeFilterId;
  const postedOnly =
    activeFilterId === "all" ||
    activeFilterId === "posted" ||
    activeFilterId === "with_residual" ||
    !activeFilterId;

  const loadItems = useCallback(() => {
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingJournalItemsToReconcile({
        search: debouncedSearch.trim() || undefined,
        withResidualOnly: withResidual,
        postedOnly,
        page: 1,
        pageSize: 200,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setItems([]);
        setTotal(0);
      } else {
        const list = res.items ?? [];
        setItems(list);
        setTotal(res.total ?? list.length);
        // Expand all groups by default (Odoo open groups)
        const acc: Record<string, boolean> = {};
        const part: Record<string, boolean> = {};
        for (const g of buildGroups(list)) {
          acc[g.key] = true;
          for (const p of g.partners) part[p.key] = true;
        }
        setExpandedAccounts(acc);
        setExpandedPartners(part);
      }
      setLoading(false);
    });
  }, [debouncedSearch, withResidual, postedOnly]);

  const loadSuggestions = useCallback(() => {
    startTransition(async () => {
      const res = await getAccountingReconciliationSuggestions();
      if ("error" in res && res.error) {
        toast.error(res.error);
        setSuggestions([]);
      } else {
        setSuggestions(res.suggestions ?? []);
      }
    });
  }, []);

  const loadHistory = useCallback(() => {
    startTransition(async () => {
      const res = await getAccountingReconciliations({ page: 1, pageSize: 30 });
      if ("error" in res && res.error) {
        toast.error(res.error);
        setHistory([]);
      } else {
        setHistory(res.reconciliations ?? []);
      }
    });
  }, []);

  const loadBank = useCallback(() => {
    startTransition(async () => {
      const res = await getAccountingBankReconciliationBootstrap();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setBankInfo({
        journals: (res.journals || []).map((j) => ({
          id: String(j.id),
          name: String(j.name || ""),
          code: String(j.code || ""),
        })),
        statements: res.statements || [],
      });
    });
  }, []);

  useEffect(() => {
    setSelected({});
  }, [debouncedSearch, activeFilterId, switchVersion]);

  useEffect(() => {
    if (tab === "items") loadItems();
    if (tab === "suggestions") loadSuggestions();
    if (tab === "history") loadHistory();
    if (tab === "bank") loadBank();
  }, [tab, loadItems, loadSuggestions, loadHistory, loadBank, switchVersion]);

  const groups = useMemo(() => buildGroups(items), [items]);

  const totals = useMemo(() => {
    return {
      debit: round2(items.reduce((s, i) => s + i.debit, 0)),
      credit: round2(items.reduce((s, i) => s + i.credit, 0)),
      residual: round2(items.reduce((s, i) => s + i.residual, 0)),
      count: items.length,
    };
  }, [items]);

  function toggleSelect(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAccount(key: string) {
    setExpandedAccounts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePartner(key: string) {
    setExpandedPartners((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openItem(item: JournalItemToReconcile) {
    if (item.source_type && item.source_id) {
      router.push(
        journalEntrySourceHref({
          entryId: item.journal_entry_id,
          sourceType: item.source_type,
          sourceId: item.source_id,
          isManual: false,
        })
      );
      return;
    }
    router.push(`/accounting/journal-entries/${item.journal_entry_id}`);
  }

  function handleAutoReconcileAll() {
    startTransition(async () => {
      const res = await getAccountingReconciliationSuggestions();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const list = res.suggestions ?? [];
      if (!list.length) {
        toast.info("No auto-reconcile matches found");
        return;
      }
      let ok = 0;
      for (const s of list.filter((x) => x.confidence >= 0.85)) {
        const r = await acceptAccountingReconciliationSuggestion({
          debit: {
            document_type: s.debit.document_type,
            document_id: s.debit.document_id,
            residual: s.debit.residual,
          },
          credits: s.credits.map((c) => ({
            document_type: c.document_type,
            document_id: c.document_id,
            residual: c.residual,
          })),
          amount: s.amount,
        });
        if (!("error" in r && r.error)) ok += 1;
      }
      toast.success(
        ok ? `Auto-reconciled ${ok} match${ok === 1 ? "" : "es"}` : "No matches applied"
      );
      loadItems();
    });
  }

  function handleAutoReconcilePartner(partnerItems: JournalItemToReconcile[]) {
    // Trigger suggestions filtered by partner, then accept high-confidence
    startTransition(async () => {
      const res = await getAccountingReconciliationSuggestions();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const partners = new Set(
        partnerItems.map((i) => String(i.partner_name || "").toLowerCase()).filter(Boolean)
      );
      const contactIds = new Set(
        partnerItems.map((i) => i.contact_id).filter(Boolean) as string[]
      );
      const matched = (res.suggestions || []).filter((s) => {
        const name = String(s.debit.partner_name || "").toLowerCase();
        const cid = s.debit.contact_id;
        return (
          (cid && contactIds.has(cid)) ||
          (name && partners.has(name)) ||
          s.confidence >= 0.95
        );
      });
      if (!matched.length) {
        toast.info("No matches for this partner");
        return;
      }
      let ok = 0;
      for (const s of matched) {
        const r = await acceptAccountingReconciliationSuggestion({
          debit: {
            document_type: s.debit.document_type,
            document_id: s.debit.document_id,
            residual: s.debit.residual,
          },
          credits: s.credits.map((c) => ({
            document_type: c.document_type,
            document_id: c.document_id,
            residual: c.residual,
          })),
          amount: s.amount,
        });
        if (!("error" in r && r.error)) ok += 1;
      }
      toast.success(`Auto-reconciled ${ok} match${ok === 1 ? "" : "es"}`);
      loadItems();
    });
  }

  function handleUnreconcile(id: string) {
    startTransition(async () => {
      const res = await unreconcileAccountingReconciliation(id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Unreconciled");
      loadHistory();
      loadItems();
    });
  }

  function handleAcceptSuggestion(s: ReconciliationSuggestion) {
    startTransition(async () => {
      const res = await acceptAccountingReconciliationSuggestion({
        debit: {
          document_type: s.debit.document_type,
          document_id: s.debit.document_id,
          residual: s.debit.residual,
        },
        credits: s.credits.map((c) => ({
          document_type: c.document_type,
          document_id: c.document_id,
          residual: c.residual,
        })),
        amount: s.amount,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Suggestion accepted");
      loadSuggestions();
      loadItems();
    });
  }

  return (
    <div className="space-y-3">
      {/* Odoo-style action row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleAutoReconcileAll}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Auto-reconcile
          </Button>
          <div className="flex items-center gap-1 ml-1">
            {(
              [
                ["items", "Journal Items"],
                ["suggestions", "Suggestions"],
                ["history", "History"],
                ["bank", "Bank"],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={id === "items" ? "/accounting/reconcile" : `/accounting/reconcile?tab=${id}`}
                data-testid={`reconcile-tab-${id}`}
                className={cn(
                  "h-7 px-2.5 rounded-sm text-xs font-medium border transition-colors inline-flex items-center",
                  tab === id
                    ? "border-[#017e84] bg-[#017e84]/10 text-[#017e84]"
                    : "border-transparent text-secondary-muted hover:bg-slate-50"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary-muted">
          <span>
            1-{Math.min(items.length, total)} / {total}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 rounded-sm"
            disabled={isPending}
            onClick={() => loadItems()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {tab === "items" ? (
        loading || (isPending && !items.length) ? (
          <AccountingTableSkeleton rows={10} cols={8} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
            {groups.length === 0 ? (
              <div className="p-10 text-center text-sm text-secondary-muted">
                No journal items to reconcile.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/90 border-b border-slate-200">
                      <TableHead className="w-10" />
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                        Date
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                        Journal Entry
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted min-w-[180px]">
                        Label
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted text-right">
                        Debit
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted text-right">
                        Credit
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted">
                        Matching
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted text-right">
                        Residual
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide text-secondary-muted text-right w-16">
                        Count
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((account) => {
                      const accOpen = expandedAccounts[account.key] !== false;
                      return (
                        <AccountBlock
                          key={account.key}
                          account={account}
                          accOpen={accOpen}
                          expandedPartners={expandedPartners}
                          selected={selected}
                          isPending={isPending}
                          onToggleAccount={() => toggleAccount(account.key)}
                          onTogglePartner={togglePartner}
                          onToggleSelect={toggleSelect}
                          onOpenItem={openItem}
                          onAutoReconcilePartner={handleAutoReconcilePartner}
                        />
                      );
                    })}

                    {/* Totals row — Odoo style */}
                    <TableRow className="bg-slate-50/80 border-t-2 border-slate-200 font-semibold">
                      <TableCell colSpan={4} />
                      <TableCell className="text-right tabular-nums text-sm text-primary-dark">
                        {formatMoney(totals.debit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-primary-dark">
                        {formatMoney(totals.credit)}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums text-sm text-primary-dark">
                        {formatMoney(totals.residual)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-secondary-muted">
                        {totals.count}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )
      ) : null}

      {tab === "suggestions" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-secondary-muted flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#017e84]" />
              Suggested matches
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              onClick={() => loadSuggestions()}
            >
              Refresh
            </Button>
          </div>
          {suggestions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-sm p-8 text-center text-sm text-secondary-muted">
              No suggestions right now.
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  data-testid="reconcile-suggestion"
                  className="bg-white border border-slate-200 rounded-sm p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium text-primary-dark">
                      {s.debit.document_number}{" "}
                      <span className="text-secondary-muted font-normal">↔</span>{" "}
                      {s.credits.map((c) => c.document_number).join(" + ")}
                    </div>
                    <div className="text-xs text-secondary-muted">
                      {s.debit.partner_name || "—"} · {s.reason} ·{" "}
                      {Math.round(s.confidence * 100)}%
                    </div>
                    <div className="text-xs tabular-nums">
                      {formatMoney(s.amount)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    data-testid="reconcile-accept"
                    className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                    disabled={isPending}
                    onClick={() => handleAcceptSuggestion(s)}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Accept
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary-muted">
              No reconciliations yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">{h.reconciliation_date}</TableCell>
                    <TableCell className="text-sm font-medium">{h.name}</TableCell>
                    <TableCell className="text-sm capitalize">{h.match_type}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 capitalize">
                        {h.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatMoney(h.total_amount)}
                    </TableCell>
                    <TableCell className="text-sm text-secondary-muted">
                      {h.created_by || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-sm text-xs"
                        disabled={isPending}
                        onClick={() => handleUnreconcile(h.id)}
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        Unreconcile
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}

      {tab === "bank" ? (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Landmark className="h-5 w-5 text-[#017e84] mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-primary-dark">
                Bank Reconciliation
              </h3>
              <p className="text-xs text-secondary-muted mt-1 max-w-xl">
                Ready for bank statement imports. Match statement lines to
                payments without redesigning this module.
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase text-secondary-muted mb-2">
              Bank Journals
            </p>
            {bankInfo.journals.length === 0 ? (
              <p className="text-sm text-secondary-muted">No bank journals found.</p>
            ) : (
              <ul className="space-y-1">
                {bankInfo.journals.map((j) => (
                  <li
                    key={j.id}
                    className="text-sm border border-slate-100 rounded-sm px-3 py-2"
                  >
                    <span className="font-mono text-[#017e84]">{j.code}</span>
                    {" — "}
                    {j.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountBlock({
  account,
  accOpen,
  expandedPartners,
  selected,
  isPending,
  onToggleAccount,
  onTogglePartner,
  onToggleSelect,
  onOpenItem,
  onAutoReconcilePartner,
}: {
  account: AccountGroup;
  accOpen: boolean;
  expandedPartners: Record<string, boolean>;
  selected: Record<string, boolean>;
  isPending: boolean;
  onToggleAccount: () => void;
  onTogglePartner: (key: string) => void;
  onToggleSelect: (id: string) => void;
  onOpenItem: (item: JournalItemToReconcile) => void;
  onAutoReconcilePartner: (items: JournalItemToReconcile[]) => void;
}) {
  return (
    <>
      {/* Account group header */}
      <TableRow className="bg-[#f8fafb] hover:bg-[#f1f5f6] border-b border-slate-100">
        <TableCell className="py-2">
          <button
            type="button"
            className="text-secondary-muted hover:text-primary-dark"
            onClick={onToggleAccount}
            aria-label={accOpen ? "Collapse" : "Expand"}
          >
            {accOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </TableCell>
        <TableCell colSpan={3} className="py-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-primary-dark">
              {account.accountLabel}
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                onAutoReconcilePartner(account.partners.flatMap((p) => p.items))
              }
              className="text-sm font-medium text-[#017e84] hover:underline"
            >
              Auto-reconcile
            </button>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm font-medium py-2">
          {formatMoney(account.debit)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm font-medium py-2">
          {formatMoney(account.credit)}
        </TableCell>
        <TableCell className="py-2" />
        <TableCell className="text-right tabular-nums text-sm font-medium py-2">
          {formatMoney(account.residual)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm text-secondary-muted py-2">
          {account.count}
        </TableCell>
      </TableRow>

      {accOpen
        ? account.partners.map((partner) => {
            const pOpen = expandedPartners[partner.key] !== false;
            return (
              <PartnerBlock
                key={partner.key}
                partner={partner}
                pOpen={pOpen}
                selected={selected}
                isPending={isPending}
                onTogglePartner={() => onTogglePartner(partner.key)}
                onToggleSelect={onToggleSelect}
                onOpenItem={onOpenItem}
                onAutoReconcilePartner={onAutoReconcilePartner}
              />
            );
          })
        : null}
    </>
  );
}

function PartnerBlock({
  partner,
  pOpen,
  selected,
  isPending,
  onTogglePartner,
  onToggleSelect,
  onOpenItem,
  onAutoReconcilePartner,
}: {
  partner: PartnerGroup;
  pOpen: boolean;
  selected: Record<string, boolean>;
  isPending: boolean;
  onTogglePartner: () => void;
  onToggleSelect: (id: string) => void;
  onOpenItem: (item: JournalItemToReconcile) => void;
  onAutoReconcilePartner: (items: JournalItemToReconcile[]) => void;
}) {
  return (
    <>
      {/* Partner group header */}
      <TableRow className="bg-white hover:bg-slate-50/80 border-b border-slate-50">
        <TableCell className="py-1.5 pl-6">
          <button
            type="button"
            className="text-secondary-muted hover:text-primary-dark"
            onClick={onTogglePartner}
          >
            {pOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </TableCell>
        <TableCell colSpan={3} className="py-1.5">
          <div className="flex flex-wrap items-center gap-3 pl-2">
            <span className="text-sm font-medium text-primary-dark">
              {partner.partner}
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={() => onAutoReconcilePartner(partner.items)}
              className="text-sm font-medium text-[#017e84] hover:underline"
            >
              Auto-reconcile
            </button>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm py-1.5">
          {formatMoney(partner.debit)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm py-1.5">
          {formatMoney(partner.credit)}
        </TableCell>
        <TableCell className="py-1.5" />
        <TableCell className="text-right tabular-nums text-sm py-1.5">
          {formatMoney(partner.residual)}
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm text-secondary-muted py-1.5">
          {partner.items.length}
        </TableCell>
      </TableRow>

      {pOpen
        ? partner.items.map((item) => (
            <TableRow
              key={item.id}
              className={cn(
                "hover:bg-[#017e84]/5 border-b border-slate-50",
                selected[item.id] && "bg-[#017e84]/10"
              )}
            >
              <TableCell className="pl-10 py-1.5">
                <input
                  type="checkbox"
                  checked={Boolean(selected[item.id])}
                  onChange={() => onToggleSelect(item.id)}
                  className="accent-[#017e84]"
                />
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm py-1.5 text-secondary-muted">
                {formatDateShort(item.entry_date)}
              </TableCell>
              <TableCell className="py-1.5">
                <button
                  type="button"
                  className="text-sm font-medium text-[#017e84] hover:underline"
                  onClick={() => onOpenItem(item)}
                >
                  {item.source_number || item.journal_entry_number}
                </button>
              </TableCell>
              <TableCell className="text-sm py-1.5 max-w-[220px] truncate text-primary-dark">
                {item.label || "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm py-1.5">
                {item.debit > 0.004 ? formatMoney(item.debit) : ""}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm py-1.5">
                {item.credit > 0.004 ? formatMoney(item.credit) : ""}
              </TableCell>
              <TableCell className="text-sm py-1.5 text-secondary-muted">
                {item.matching || ""}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium py-1.5">
                {formatMoney(item.residual)}
              </TableCell>
              <TableCell className="py-1.5" />
            </TableRow>
          ))
        : null}
    </>
  );
}
