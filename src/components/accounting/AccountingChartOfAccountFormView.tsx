"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
  archiveAccountingCoaAccount,
  createAccountingCoaAccount,
  getAccountingCoaAccountDetail,
  getAccountingCoaParentOptions,
  restoreAccountingCoaAccount,
  updateAccountingCoaAccount,
  type AccountingCoaDetail,
} from "@/app/actions/accounting/chart-of-accounts";
import { searchAccountingTaxes } from "@/app/actions/accounting/taxes";
import {
  COA_ACCOUNT_TYPES_BY_CLASSIFICATION,
  coaClassificationLabel,
  defaultAccountTypeForClassification,
  type CoaAccountType,
  type CoaClassification,
} from "@/lib/accounting-chart-of-accounts";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import { cn } from "@/lib/utils";

type Props = {
  accountId?: string;
};

type TaxOpt = {
  id: string;
  name: string;
  code: string;
  rate_value?: number;
};

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

const CLASSIFICATIONS: CoaClassification[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
  "view",
];

export function AccountingChartOfAccountFormView({ accountId }: Props) {
  const router = useRouter();
  const { isAdminContext, organizationId } = useAdminOrganization();
  const isNew = !accountId;
  const [loading, setLoading] = useState(!isNew);
  const [isPending, startTransition] = useTransition();
  const [account, setAccount] = useState<AccountingCoaDetail | null>(null);
  const [parents, setParents] = useState<
    { id: string; code: string; name: string; type: string }[]
  >([]);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [classification, setClassification] = useState<CoaClassification>("expense");
  const [accountType, setAccountType] = useState<CoaAccountType>("expense");
  const [parentId, setParentId] = useState("");
  const [allowReconciliation, setAllowReconciliation] = useState(false);
  const [notes, setNotes] = useState("");
  const [orgSpecific, setOrgSpecific] = useState(false);
  const [defaultTaxId, setDefaultTaxId] = useState("");
  const [taxOptions, setTaxOptions] = useState<TaxOpt[]>([]);
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankCurrency, setBankCurrency] = useState("PKR");

  const typeOptions = useMemo(() => {
    if (classification === "view") return [];
    return COA_ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || [];
  }, [classification]);

  const load = useCallback(() => {
    if (!accountId) return;
    setLoading(true);
    startTransition(async () => {
      const [detailRes, parentRes, taxesRes] = await Promise.all([
        getAccountingCoaAccountDetail(accountId),
        getAccountingCoaParentOptions({ excludeId: accountId }),
        searchAccountingTaxes({ limit: 100 }),
      ]);
      if ("error" in detailRes && detailRes.error) {
        toast.error(detailRes.error);
        setLoading(false);
        return;
      }
      const a = detailRes.account!;
      setAccount(a);
      setCode(a.code);
      setName(a.name);
      setClassification(a.type);
      setAccountType(
        (a.account_type as CoaAccountType) ||
          defaultAccountTypeForClassification(a.type)
      );
      setParentId(a.parent_id || "");
      setAllowReconciliation(a.allow_reconciliation);
      setNotes(a.notes || "");
      setDefaultTaxId(a.default_tax_id || "");
      setBankAccountNumber(a.bank_account_number || "");
      setBankCurrency(a.bank_currency || "PKR");
      setParents(parentRes.parents || []);
      setTaxOptions((taxesRes.taxes as TaxOpt[]) || []);
      setLoading(false);
    });
  }, [accountId]);

  useEffect(() => {
    if (isNew) {
      startTransition(async () => {
        const [parentRes, taxesRes] = await Promise.all([
          getAccountingCoaParentOptions(),
          searchAccountingTaxes({ limit: 100 }),
        ]);
        setParents(parentRes.parents || []);
        setTaxOptions((taxesRes.taxes as TaxOpt[]) || []);
      });
      return;
    }
    load();
  }, [isNew, load]);

  useEffect(() => {
    if (classification === "view") {
      setAccountType("view");
      setAllowReconciliation(false);
      return;
    }
    const opts = COA_ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || [];
    if (!opts.some((o) => o.value === accountType)) {
      setAccountType(opts[0]?.value || "expense");
    }
  }, [classification, accountType]);

  function handleSave() {
    startTransition(async () => {
      if (isNew) {
        const res = await createAccountingCoaAccount({
          code,
          name,
          type: classification,
          account_type: classification === "view" ? "view" : accountType,
          parent_id: parentId || null,
          allow_reconciliation: allowReconciliation,
          default_tax_id: defaultTaxId || null,
          notes: notes || null,
          bank_account_number:
            accountType === "bank" ? bankAccountNumber || null : null,
          bank_currency: accountType === "bank" ? bankCurrency || "PKR" : null,
          orgSpecific,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Account created");
        router.replace(
          `/accounting/configuration/chart-of-accounts/${res.accountId}`
        );
        return;
      }

      const res = await updateAccountingCoaAccount(accountId!, {
        code,
        name,
        type: classification,
        account_type: classification === "view" ? "view" : accountType,
        parent_id: parentId || null,
        allow_reconciliation: allowReconciliation,
        default_tax_id: defaultTaxId || null,
        notes: notes || null,
        bank_account_number:
          accountType === "bank" ? bankAccountNumber || null : null,
        bank_currency: accountType === "bank" ? bankCurrency || "PKR" : null,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Account saved");
      if (res.account) {
        setAccount(res.account);
      }
    });
  }

  function handleArchiveToggle() {
    if (!accountId || !account) return;
    startTransition(async () => {
      const res = account.is_active
        ? await archiveAccountingCoaAccount(accountId)
        : await restoreAccountingCoaAccount(accountId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(account.is_active ? "Account archived" : "Account restored");
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
            {isNew ? "New Account" : account?.name || "Account"}
          </h2>
          {!isNew && account ? (
            <p className="text-sm text-secondary-muted">
              {coaClassificationLabel(account.type)}
              {account.organization_name
                ? ` · ${account.organization_name}`
                : " · Shared"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && account ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              disabled={isPending}
              onClick={handleArchiveToggle}
            >
              {account.is_active ? (
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
            onClick={() =>
              router.push("/accounting/configuration/chart-of-accounts")
            }
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

      {!isNew && account && !account.is_active ? (
        <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This account is archived and will not appear in selection lists.
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 sm:p-5 space-y-6">
        <div>
          <SectionTitle>Basic Information</SectionTitle>
          <FormRow label="Account Code" tip="Unique within the organization">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. 110000"
            />
          </FormRow>
          <FormRow label="Account Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. Cash"
            />
          </FormRow>
        </div>

        <div>
          <SectionTitle>Classification</SectionTitle>
          <FormRow label="Classification">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={classification}
              onChange={(e) =>
                setClassification(e.target.value as CoaClassification)
              }
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {coaClassificationLabel(c)}
                </option>
              ))}
            </select>
          </FormRow>
          {classification !== "view" ? (
            <FormRow label="Account Type">
              <select
                className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
                value={accountType}
                onChange={(e) =>
                  setAccountType(e.target.value as CoaAccountType)
                }
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormRow>
          ) : (
            <p className="text-xs text-secondary-muted pl-[38%] -mt-1 mb-2">
              View accounts are used as parent groups and cannot be posted to.
            </p>
          )}
          <FormRow
            label="Parent Account"
            tip="Nest under a View / Group account"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">—</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow
            label="Allow Reconciliation"
            tip="Used by payments and bank reconciliation"
          >
            <label
              className={cn(
                "inline-flex items-center gap-2 text-sm",
                classification === "view" && "opacity-50"
              )}
            >
              <input
                type="checkbox"
                className="rounded-sm border-slate-300"
                checked={allowReconciliation}
                disabled={classification === "view"}
                onChange={(e) => setAllowReconciliation(e.target.checked)}
              />
              Allow reconciliation
            </label>
          </FormRow>
          <FormRow
            label="Default Tax"
            tip="Optional default tax from the Tax Engine"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={defaultTaxId}
              onChange={(e) => setDefaultTaxId(e.target.value)}
            >
              <option value="">—</option>
              {taxOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} {t.name}
                  {t.rate_value != null ? ` (${t.rate_value}%)` : ""}
                </option>
              ))}
            </select>
          </FormRow>
          {accountType === "bank" ? (
            <>
              <FormRow
                label="Account Number"
                tip="Stored securely; invoices/PDFs show a masked ending only"
              >
                <Input
                  className="h-8 rounded-sm"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="e.g. 1234567890123"
                />
              </FormRow>
              <FormRow label="Currency">
                <Input
                  className="h-8 rounded-sm uppercase"
                  value={bankCurrency}
                  onChange={(e) => setBankCurrency(e.target.value.toUpperCase())}
                  placeholder="PKR"
                  maxLength={6}
                />
              </FormRow>
            </>
          ) : null}
        </div>

        {isNew ? (
          <div>
            <SectionTitle>Organization</SectionTitle>
            <FormRow
              label="Scope"
              tip="Shared accounts are available to all organizations"
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
