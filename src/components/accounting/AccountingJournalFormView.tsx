"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, HelpCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAccountingConfigJournal,
  createAccountingConfigJournal,
  getAccountingConfigJournalDetail,
  restoreAccountingConfigJournal,
  updateAccountingConfigJournal,
  type AccountingJournalDetail,
} from "@/app/actions/accounting/journals";
import { getAccountingChartAccounts } from "@/app/actions/accounting/journal-entries";
import {
  ACCOUNTING_JOURNAL_CURRENCIES,
  ACCOUNTING_JOURNAL_TYPES,
  accountingJournalTypeLabel,
  defaultSequencePrefix,
  type AccountingJournalType,
} from "@/lib/accounting-journals";
import { searchAccountingCurrencies } from "@/app/actions/accounting/currencies";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { journalId?: string };

type AccountOpt = { id: string; code: string; name: string; type: string };

function Tip({ text }: { text: string }) {
  return (
    <span title={text} className="ml-1 inline-flex text-slate-400">
      <HelpCircle className="h-3.5 w-3.5" />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-secondary-muted mb-3">
      {children}
    </p>
  );
}

function FormRow({
  label,
  tip,
  children,
}: {
  label: string;
  tip?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,38%)_1fr] gap-x-3 items-center min-h-9 py-1">
      <div className="flex items-center text-sm text-secondary-muted">
        <span>{label}</span>
        {tip ? <Tip text={tip} /> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function AccountingJournalFormView({ journalId }: Props) {
  const router = useRouter();
  const { isAdminContext, organizationId } = useAdminOrganization();
  const isNew = !journalId;
  const [loading, setLoading] = useState(!isNew);
  const [isPending, startTransition] = useTransition();
  const [journal, setJournal] = useState<AccountingJournalDetail | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<AccountingJournalType>("sales");
  const [currency, setCurrency] = useState("PKR");
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([
    ...ACCOUNTING_JOURNAL_CURRENCIES,
  ]);
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [sequencePrefix, setSequencePrefix] = useState("");
  const [notes, setNotes] = useState("");
  const [orgSpecific, setOrgSpecific] = useState(false);

  const load = useCallback(() => {
    if (!journalId) return;
    setLoading(true);
    startTransition(async () => {
      const [detailRes, accountsRes, currenciesRes] = await Promise.all([
        getAccountingConfigJournalDetail(journalId),
        getAccountingChartAccounts(),
        searchAccountingCurrencies({ activeOnly: true, limit: 100 }),
      ]);
      if ("error" in detailRes && detailRes.error) {
        toast.error(detailRes.error);
        setLoading(false);
        return;
      }
      const j = detailRes.journal!;
      setJournal(j);
      setName(j.name);
      setCode(j.code);
      setType(j.type);
      setCurrency(j.currency || "PKR");
      setDebitAccountId(j.default_debit_account_id || "");
      setCreditAccountId(j.default_credit_account_id || "");
      setSequencePrefix(j.sequence_prefix || "");
      setNotes(j.notes || "");
      setAccounts((accountsRes.accounts as AccountOpt[]) || []);
      if ("currencies" in currenciesRes && currenciesRes.currencies?.length) {
        const codes = currenciesRes.currencies.map((c) => c.code);
        if (j.currency && !codes.includes(j.currency)) {
          codes.unshift(j.currency);
        }
        setCurrencyOptions(codes);
      }
      setLoading(false);
    });
  }, [journalId]);

  useEffect(() => {
    if (isNew) {
      startTransition(async () => {
        const [accountsRes, currenciesRes] = await Promise.all([
          getAccountingChartAccounts(),
          searchAccountingCurrencies({ activeOnly: true, limit: 100 }),
        ]);
        setAccounts((accountsRes.accounts as AccountOpt[]) || []);
        setSequencePrefix(defaultSequencePrefix("", "sales"));
        if ("currencies" in currenciesRes && currenciesRes.currencies?.length) {
          setCurrencyOptions(currenciesRes.currencies.map((c) => c.code));
          const base =
            currenciesRes.currencies.find((c) => c.is_base)?.code || "PKR";
          setCurrency(base);
        }
      });
      return;
    }
    load();
  }, [isNew, load]);

  useEffect(() => {
    if (isNew && !sequencePrefix) {
      setSequencePrefix(defaultSequencePrefix(code, type));
    }
  }, [type, code, isNew, sequencePrefix]);

  function handleSave() {
    startTransition(async () => {
      if (isNew) {
        const res = await createAccountingConfigJournal({
          name,
          code,
          type,
          currency,
          default_debit_account_id: debitAccountId || null,
          default_credit_account_id: creditAccountId || null,
          sequence_prefix: sequencePrefix || null,
          notes: notes || null,
          orgSpecific,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Journal created");
        router.replace(`/accounting/configuration/journals/${res.journalId}`);
        return;
      }

      const res = await updateAccountingConfigJournal(journalId!, {
        name,
        code,
        type,
        currency,
        default_debit_account_id: debitAccountId || null,
        default_credit_account_id: creditAccountId || null,
        sequence_prefix: sequencePrefix || null,
        notes: notes || null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Journal saved");
      load();
    });
  }

  function handleArchiveToggle() {
    if (!journalId || !journal) return;
    startTransition(async () => {
      const res = journal.is_active
        ? await archiveAccountingConfigJournal(journalId)
        : await restoreAccountingConfigJournal(journalId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(journal.is_active ? "Journal archived" : "Journal restored");
      load();
    });
  }

  if (loading) {
    return <AccountingTableSkeleton rows={8} cols={2} />;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isNew ? "New Journal" : journal?.name || "Journal"}
          </h2>
          {!isNew && journal ? (
            <p className="text-sm text-secondary-muted">
              {accountingJournalTypeLabel(journal.type)}
              {journal.organization_name
                ? ` · ${journal.organization_name}`
                : " · Shared"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && journal ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              disabled={isPending}
              onClick={handleArchiveToggle}
            >
              {journal.is_active ? (
                <>
                  <Archive className="h-3.5 w-3.5 mr-1" />
                  Archive
                </>
              ) : (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                  Restore
                </>
              )}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            onClick={() => router.push("/accounting/configuration/journals")}
          >
            Back
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {!isNew && journal && !journal.is_active ? (
        <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This journal is archived and cannot be used for new transactions.
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 sm:p-5 space-y-6">
        <div>
          <SectionTitle>Basic Information</SectionTitle>
          <FormRow label="Journal Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. Sales Journal"
            />
          </FormRow>
          <FormRow label="Journal Code" tip="Unique within the organization">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. SJ"
            />
          </FormRow>
          <FormRow label="Journal Type">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={type}
              onChange={(e) =>
                setType(e.target.value as AccountingJournalType)
              }
            >
              {ACCOUNTING_JOURNAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormRow>
        </div>

        <div>
          <SectionTitle>Accounting</SectionTitle>
          <FormRow
            label="Default Debit Account"
            tip="From Chart of Accounts"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={debitAccountId}
              onChange={(e) => setDebitAccountId(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow
            label="Default Credit Account"
            tip="From Chart of Accounts"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={creditAccountId}
              onChange={(e) => setCreditAccountId(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </FormRow>
        </div>

        <div>
          <SectionTitle>Currency & Sequence</SectionTitle>
          <FormRow label="Currency" tip="From Currency Engine (Configuration → Currencies)">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow
            label="Sequence Prefix"
            tip="Used for journal document numbering"
          >
            <Input
              value={sequencePrefix}
              onChange={(e) => setSequencePrefix(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. SJ"
            />
          </FormRow>
          {!isNew && journal ? (
            <FormRow label="Next Number">
              <Input
                value={String(journal.next_number)}
                disabled
                className="h-8 rounded-sm bg-slate-50"
              />
            </FormRow>
          ) : null}
        </div>

        {isNew ? (
          <div>
            <SectionTitle>Organization</SectionTitle>
            <FormRow
              label="Scope"
              tip="Shared journals are available to all organizations"
            >
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded-sm border-slate-300"
                  checked={orgSpecific}
                  disabled={isAdminContext || !organizationId}
                  onChange={(e) => setOrgSpecific(e.target.checked)}
                />
                Organization-specific
                {isAdminContext ? (
                  <span className="text-xs text-secondary-muted">
                    (select an organization in the header)
                  </span>
                ) : null}
              </label>
            </FormRow>
          </div>
        ) : null}

        <div>
          <SectionTitle>Notes</SectionTitle>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-sm border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Optional internal notes"
          />
        </div>
      </div>
    </div>
  );
}
