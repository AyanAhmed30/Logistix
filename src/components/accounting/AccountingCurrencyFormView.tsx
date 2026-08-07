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
import {
  Archive,
  ArchiveRestore,
  HelpCircle,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAccountingConfigCurrency,
  createAccountingConfigCurrency,
  deleteAccountingExchangeRate,
  getAccountingConfigCurrencyDetail,
  restoreAccountingConfigCurrency,
  updateAccountingConfigCurrency,
  upsertAccountingExchangeRate,
  type AccountingCurrencyDetail,
} from "@/app/actions/accounting/currencies";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";
import type { CurrencySymbolPosition } from "@/lib/accounting-currencies";

type Props = { currencyId?: string };

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

export function AccountingCurrencyFormView({ currencyId }: Props) {
  const router = useRouter();
  const isNew = !currencyId;
  const [loading, setLoading] = useState(!isNew);
  const [isPending, startTransition] = useTransition();
  const [currency, setCurrency] = useState<AccountingCurrencyDetail | null>(
    null
  );

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [rounding, setRounding] = useState("0.01");
  const [symbolPosition, setSymbolPosition] =
    useState<CurrencySymbolPosition>("before");
  const [sequence, setSequence] = useState("100");
  const [notes, setNotes] = useState("");
  const [isBase, setIsBase] = useState(false);
  const [initialRate, setInitialRate] = useState("");
  const [initialRateDate, setInitialRateDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const [rateDate, setRateDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [rateValue, setRateValue] = useState("");
  const [rateSource, setRateSource] = useState("manual");

  const load = useCallback(() => {
    if (!currencyId) return;
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingConfigCurrencyDetail(currencyId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLoading(false);
        return;
      }
      const c = res.currency!;
      setCurrency(c);
      setCode(c.code);
      setName(c.name);
      setSymbol(c.symbol || "");
      setDecimalPlaces(String(c.decimal_places));
      setRounding(String(c.rounding));
      setSymbolPosition(c.symbol_position);
      setSequence(String(c.sequence));
      setNotes(c.notes || "");
      setIsBase(c.is_base);
      setLoading(false);
    });
  }, [currencyId]);

  useEffect(() => {
    if (!isNew) load();
  }, [isNew, load]);

  function handleSave() {
    startTransition(async () => {
      if (isNew) {
        const res = await createAccountingConfigCurrency({
          code,
          name,
          symbol,
          decimal_places: Number(decimalPlaces) || 2,
          rounding: Number(rounding) || 0.01,
          symbol_position: symbolPosition,
          sequence: Number(sequence) || 100,
          notes: notes || null,
          is_base: isBase,
          initial_rate: initialRate ? Number(initialRate) : null,
          initial_rate_date: initialRateDate || null,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Currency created");
        router.replace(`/accounting/configuration/currencies/${res.currencyId}`);
        return;
      }

      const res = await updateAccountingConfigCurrency(currencyId!, {
        name,
        symbol,
        decimal_places: Number(decimalPlaces) || 2,
        rounding: Number(rounding) || 0.01,
        symbol_position: symbolPosition,
        sequence: Number(sequence) || 100,
        notes: notes || null,
        is_base: isBase,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Currency saved");
      load();
    });
  }

  function handleArchiveToggle() {
    if (!currencyId || !currency) return;
    startTransition(async () => {
      const res = currency.is_active
        ? await archiveAccountingConfigCurrency(currencyId)
        : await restoreAccountingConfigCurrency(currencyId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(currency.is_active ? "Currency archived" : "Currency restored");
      load();
    });
  }

  function handleAddRate() {
    if (!currencyId || currency?.is_base) return;
    startTransition(async () => {
      const res = await upsertAccountingExchangeRate({
        currency_id: currencyId,
        rate_date: rateDate,
        rate_to_base: Number(rateValue),
        source: rateSource || "manual",
        rate_type: "manual",
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Exchange rate saved");
      setRateValue("");
      load();
    });
  }

  function handleDeleteRate(rateId: string) {
    startTransition(async () => {
      const res = await deleteAccountingExchangeRate(rateId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Rate deleted");
      load();
    });
  }

  if (loading) {
    return <AccountingTableSkeleton rows={8} cols={2} />;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            {isNew ? "New Currency" : code}
          </h2>
          {!isNew && currency ? (
            <p className="text-sm text-secondary-muted">{currency.name}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && currency ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              disabled={isPending || currency.is_base}
              onClick={handleArchiveToggle}
            >
              {currency.is_active ? (
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
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
            disabled={isPending}
            onClick={handleSave}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 md:p-5 space-y-6">
        <div>
          <SectionTitle>Currency</SectionTitle>
          <FormRow label="Code" tip="ISO 4217 code (e.g. USD, PKR, AED, SAR)">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!isNew}
              className="h-8 rounded-sm uppercase"
              maxLength={3}
              placeholder="USD"
            />
          </FormRow>
          <FormRow label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="US Dollar"
            />
          </FormRow>
          <FormRow label="Symbol">
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="$"
            />
          </FormRow>
          <FormRow label="Symbol Position">
            <select
              className="h-8 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              value={symbolPosition}
              onChange={(e) =>
                setSymbolPosition(e.target.value as CurrencySymbolPosition)
              }
            >
              <option value="before">Before amount</option>
              <option value="after">After amount</option>
            </select>
          </FormRow>
          <FormRow
            label="Decimal Places"
            tip="Monetary precision for this currency"
          >
            <Input
              type="number"
              min={0}
              max={6}
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
          <FormRow label="Rounding" tip="Rounding unit (e.g. 0.01)">
            <Input
              type="number"
              step="0.0001"
              min={0.000001}
              value={rounding}
              onChange={(e) => setRounding(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
          <FormRow label="Sequence">
            <Input
              type="number"
              value={sequence}
              onChange={(e) => setSequence(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
          <FormRow
            label="Company Base"
            tip="System base currency for rate storage (usually PKR). One base only."
          >
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded-sm border-slate-300"
                checked={isBase}
                onChange={(e) => setIsBase(e.target.checked)}
              />
              This is the base currency
            </label>
          </FormRow>
          <FormRow label="Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 rounded-sm"
            />
          </FormRow>
        </div>

        {isNew && !isBase ? (
          <div>
            <SectionTitle>Initial Exchange Rate</SectionTitle>
            <p className="text-xs text-secondary-muted mb-2">
              Rate = units of base currency per 1 unit of this currency (e.g. 1
              USD = 278 PKR → rate 278).
            </p>
            <FormRow label="Rate Date">
              <Input
                type="date"
                value={initialRateDate}
                onChange={(e) => setInitialRateDate(e.target.value)}
                className="h-8 rounded-sm"
              />
            </FormRow>
            <FormRow label="Rate → Base">
              <Input
                type="number"
                step="0.00000001"
                min={0}
                value={initialRate}
                onChange={(e) => setInitialRate(e.target.value)}
                className="h-8 rounded-sm"
                placeholder="278.00"
              />
            </FormRow>
          </div>
        ) : null}

        {!isNew && currency && !currency.is_base ? (
          <div>
            <SectionTitle>Exchange Rates</SectionTitle>
            <p className="text-xs text-secondary-muted mb-3">
              Historical rates power invoices, bills, payments, and journal
              entries. Online sync can write here later without redesign.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-3">
              <Input
                type="date"
                value={rateDate}
                onChange={(e) => setRateDate(e.target.value)}
                className="h-8 rounded-sm"
              />
              <Input
                type="number"
                step="0.00000001"
                min={0}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
                className="h-8 rounded-sm"
                placeholder="Rate → base"
              />
              <Input
                value={rateSource}
                onChange={(e) => setRateSource(e.target.value)}
                className="h-8 rounded-sm"
                placeholder="Source"
              />
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                disabled={isPending || !rateValue}
                onClick={handleAddRate}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>

            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Rate → Base
                    </th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {currency.rates.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-secondary-muted"
                      >
                        No rates yet. Add a manual rate to enable conversions.
                      </td>
                    </tr>
                  ) : (
                    currency.rates.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{r.rate_date}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.rate_to_base.toLocaleString(undefined, {
                            maximumFractionDigits: 8,
                          })}
                        </td>
                        <td className="px-3 py-2 text-secondary-muted">
                          {r.source || "—"}
                        </td>
                        <td className="px-3 py-2 text-secondary-muted">
                          {r.rate_type}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-slate-400 hover:text-red-600"
                            onClick={() => handleDeleteRate(r.id)}
                            disabled={isPending}
                            title="Delete rate"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!isNew && currency?.is_base ? (
          <p className="text-sm text-secondary-muted">
            Base currency rate is always 1. Other currencies store{" "}
            <span className="font-medium">rate → base</span> (how many{" "}
            {code} per 1 foreign unit).
          </p>
        ) : null}
      </div>
    </div>
  );
}
