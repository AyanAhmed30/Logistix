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
  archiveAccountingConfigTax,
  createAccountingConfigTax,
  createAccountingTaxGroup,
  getAccountingConfigTaxDetail,
  getAccountingTaxGroups,
  restoreAccountingConfigTax,
  updateAccountingConfigTax,
  type AccountingTaxDetail,
  type AccountingTaxGroupItem,
} from "@/app/actions/accounting/taxes";
import { getAccountingChartAccounts } from "@/app/actions/accounting/journal-entries";
import {
  taxMasterTypeLabel,
  type TaxAmountType,
  type TaxMasterType,
} from "@/lib/accounting-tax-engine";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { taxId?: string };

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

export function AccountingTaxFormView({ taxId }: Props) {
  const router = useRouter();
  const { isAdminContext, organizationId } = useAdminOrganization();
  const isNew = !taxId;
  const [loading, setLoading] = useState(!isNew);
  const [isPending, startTransition] = useTransition();
  const [tax, setTax] = useState<AccountingTaxDetail | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [groups, setGroups] = useState<AccountingTaxGroupItem[]>([]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<TaxMasterType>("sales_tax");
  const [amountType, setAmountType] = useState<TaxAmountType>("percent");
  const [rateValue, setRateValue] = useState("18");
  const [isInclusive, setIsInclusive] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [taxGroupId, setTaxGroupId] = useState("");
  const [invoiceLabel, setInvoiceLabel] = useState("");
  const [description, setDescription] = useState("");
  const [sequence, setSequence] = useState("10");
  const [orgSpecific, setOrgSpecific] = useState(false);

  const load = useCallback(() => {
    if (!taxId) return;
    setLoading(true);
    startTransition(async () => {
      const [detailRes, accountsRes, groupsRes] = await Promise.all([
        getAccountingConfigTaxDetail(taxId),
        getAccountingChartAccounts(),
        getAccountingTaxGroups(),
      ]);
      if ("error" in detailRes && detailRes.error) {
        toast.error(detailRes.error);
        setLoading(false);
        return;
      }
      const t = detailRes.tax!;
      setTax(t);
      setName(t.name);
      setCode(t.code);
      setType(t.type);
      setAmountType(t.amount_type);
      setRateValue(String(t.rate_value));
      setIsInclusive(t.is_inclusive);
      setAccountId(t.account_id || "");
      setRefundAccountId(t.refund_account_id || "");
      setTaxGroupId(t.tax_group_id || "");
      setInvoiceLabel(t.invoice_label || "");
      setDescription(t.description || "");
      setSequence(String(t.sequence || 10));
      setAccounts((accountsRes.accounts as AccountOpt[]) || []);
      setGroups(groupsRes.groups || []);
      setLoading(false);
    });
  }, [taxId]);

  useEffect(() => {
    if (isNew) {
      startTransition(async () => {
        const [accountsRes, groupsRes] = await Promise.all([
          getAccountingChartAccounts(),
          getAccountingTaxGroups(),
        ]);
        setAccounts((accountsRes.accounts as AccountOpt[]) || []);
        setGroups(groupsRes.groups || []);
      });
      return;
    }
    load();
  }, [isNew, load]);

  function handleSave() {
    startTransition(async () => {
      const rate = Number(rateValue);
      if (isNew) {
        const res = await createAccountingConfigTax({
          name,
          code,
          type,
          rate_value: rate,
          amount_type: amountType,
          is_inclusive: isInclusive,
          account_id: accountId || null,
          refund_account_id: refundAccountId || null,
          tax_group_id: taxGroupId || null,
          invoice_label: invoiceLabel || null,
          description: description || null,
          sequence: Number(sequence) || 10,
          orgSpecific,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Tax created");
        router.replace(`/accounting/configuration/taxes/${res.taxId}`);
        return;
      }

      const res = await updateAccountingConfigTax(taxId!, {
        name,
        code,
        type,
        rate_value: rate,
        amount_type: amountType,
        is_inclusive: isInclusive,
        account_id: accountId || null,
        refund_account_id: refundAccountId || null,
        tax_group_id: taxGroupId || null,
        invoice_label: invoiceLabel || null,
        description: description || null,
        sequence: Number(sequence) || 10,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax saved");
      if (res.tax) setTax(res.tax);
    });
  }

  function handleArchiveToggle() {
    if (!taxId || !tax) return;
    startTransition(async () => {
      const res = tax.is_active
        ? await archiveAccountingConfigTax(taxId)
        : await restoreAccountingConfigTax(taxId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(tax.is_active ? "Tax archived" : "Tax restored");
      load();
    });
  }

  function handleQuickGroup() {
    const namePrompt = window.prompt("New tax group name");
    if (!namePrompt?.trim()) return;
    startTransition(async () => {
      const res = await createAccountingTaxGroup(namePrompt.trim());
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tax group created");
      const groupsRes = await getAccountingTaxGroups();
      setGroups(groupsRes.groups || []);
      if (res.groupId) setTaxGroupId(res.groupId);
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
            {isNew ? "New Tax" : tax?.name || "Tax"}
          </h2>
          {!isNew && tax ? (
            <p className="text-sm text-secondary-muted">
              {taxMasterTypeLabel(tax.type)}
              {tax.organization_name
                ? ` · ${tax.organization_name}`
                : " · Shared"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && tax ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              disabled={isPending}
              onClick={handleArchiveToggle}
            >
              {tax.is_active ? (
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
            onClick={() => router.push("/accounting/configuration/taxes")}
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

      {!isNew && tax && !tax.is_active ? (
        <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This tax is archived and will not appear in selection lists.
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 sm:p-5 space-y-6">
        <div>
          <SectionTitle>Basic Information</SectionTitle>
          <FormRow label="Tax Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. GST Sales 18%"
            />
          </FormRow>
          <FormRow label="Tax Code" tip="Unique within the organization">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. GST_S_18"
            />
          </FormRow>
          <FormRow label="Tax Type">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as TaxMasterType)}
            >
              <option value="sales_tax">Sales Tax</option>
              <option value="purchase_tax">Purchase Tax</option>
              <option value="withholding_tax">Withholding Tax</option>
            </select>
          </FormRow>
          <FormRow label="Tax Group">
            <div className="flex gap-2">
              <select
                className="h-8 flex-1 rounded-sm border border-slate-200 bg-white px-2 text-sm"
                value={taxGroupId}
                onChange={(e) => setTaxGroupId(e.target.value)}
              >
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-sm"
                onClick={handleQuickGroup}
              >
                New
              </Button>
            </div>
          </FormRow>
          <FormRow label="Label on Invoices">
            <Input
              value={invoiceLabel}
              onChange={(e) => setInvoiceLabel(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. GST 18%"
            />
          </FormRow>
        </div>

        <div>
          <SectionTitle>Computation</SectionTitle>
          <FormRow label="Amount Type">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={amountType}
              onChange={(e) =>
                setAmountType(e.target.value as TaxAmountType)
              }
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </FormRow>
          <FormRow label={amountType === "fixed" ? "Amount" : "Rate (%)"}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
          <FormRow
            label="Included in Price"
            tip="Tax included vs tax excluded pricing"
          >
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded-sm border-slate-300"
                checked={isInclusive}
                onChange={(e) => setIsInclusive(e.target.checked)}
              />
              Price includes tax
            </label>
          </FormRow>
          <FormRow label="Sequence">
            <Input
              type="number"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
        </div>

        <div>
          <SectionTitle>Accounting Distribution</SectionTitle>
          <FormRow
            label="Tax Account"
            tip="Posted to this Chart of Accounts account"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
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
            label="Refund Account"
            tip="Optional account for credit notes / refunds"
          >
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={refundAccountId}
              onChange={(e) => setRefundAccountId(e.target.value)}
            >
              <option value="">Same as tax account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </FormRow>
        </div>

        {isNew ? (
          <div>
            <SectionTitle>Organization</SectionTitle>
            <FormRow label="Scope">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded-sm border-slate-300"
                  checked={orgSpecific}
                  disabled={isAdminContext || !organizationId}
                  onChange={(e) => setOrgSpecific(e.target.checked)}
                />
                Organization-specific
              </label>
            </FormRow>
          </div>
        ) : null}

        <div>
          <SectionTitle>Description</SectionTitle>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-sm border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Optional notes"
          />
        </div>
      </div>
    </div>
  );
}
