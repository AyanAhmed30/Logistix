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
import { Archive, ArchiveRestore, HelpCircle, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  archiveAccountingConfigPaymentTerm,
  createAccountingConfigPaymentTerm,
  getAccountingConfigPaymentTermDetail,
  restoreAccountingConfigPaymentTerm,
  updateAccountingConfigPaymentTerm,
  type AccountingPaymentTermDetail,
} from "@/app/actions/accounting/payment-terms";
import {
  computePaymentSchedule,
  type PaymentTermDelayType,
  type PaymentTermValueType,
} from "@/lib/accounting-payment-terms";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingTableSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { termId?: string };

type LineDraft = {
  key: string;
  sequence: number;
  value_amount_type: PaymentTermValueType;
  value_amount: string;
  nb_days: string;
  delay_type: PaymentTermDelayType;
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

function newLine(partial?: Partial<LineDraft>): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sequence: 10,
    value_amount_type: "percent",
    value_amount: "100",
    nb_days: "0",
    delay_type: "days_after",
    ...partial,
  };
}

export function AccountingPaymentTermFormView({ termId }: Props) {
  const router = useRouter();
  const { isAdminContext, organizationId } = useAdminOrganization();
  const isNew = !termId;
  const [loading, setLoading] = useState(!isNew);
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState<AccountingPaymentTermDetail | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [sequence, setSequence] = useState("10");
  const [orgSpecific, setOrgSpecific] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([
    newLine({ nb_days: "30", value_amount: "100" }),
  ]);
  const [previewDate, setPreviewDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );

  const load = useCallback(() => {
    if (!termId) return;
    setLoading(true);
    startTransition(async () => {
      const res = await getAccountingConfigPaymentTermDetail(termId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        setLoading(false);
        return;
      }
      const t = res.term!;
      setTerm(t);
      setName(t.name);
      setCode(t.code || "");
      setNote(t.note || "");
      setSequence(String(t.sequence || 10));
      setLines(
        t.lines.length
          ? t.lines.map((l) =>
              newLine({
                sequence: l.sequence,
                value_amount_type: l.value_amount_type,
                value_amount: String(l.value_amount),
                nb_days: String(l.nb_days),
                delay_type: l.delay_type,
              })
            )
          : [newLine()]
      );
      setLoading(false);
    });
  }, [termId]);

  useEffect(() => {
    if (!isNew) load();
  }, [isNew, load]);

  const preview = computePaymentSchedule({
    documentDate: previewDate,
    totalAmount: 1000,
    term: {
      id: termId || "preview",
      name: name || "Preview",
      lines: lines.map((l, i) => ({
        sequence: l.sequence || (i + 1) * 10,
        value_amount_type: l.value_amount_type,
        value_amount: Number(l.value_amount) || 0,
        nb_days: Number(l.nb_days) || 0,
        delay_type: l.delay_type,
      })),
    },
  });

  function handleSave() {
    startTransition(async () => {
      const payloadLines = lines.map((l, i) => ({
        sequence: l.sequence || (i + 1) * 10,
        value_amount_type: l.value_amount_type,
        value_amount: Number(l.value_amount) || 0,
        nb_days: Number(l.nb_days) || 0,
        delay_type: l.delay_type,
      }));

      if (isNew) {
        const res = await createAccountingConfigPaymentTerm({
          name,
          code: code || null,
          note: note || null,
          sequence: Number(sequence) || 10,
          orgSpecific,
          lines: payloadLines,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Payment term created");
        router.replace(`/accounting/configuration/payment-terms/${res.termId}`);
        return;
      }

      const res = await updateAccountingConfigPaymentTerm(termId!, {
        name,
        code: code || null,
        note: note || null,
        sequence: Number(sequence) || 10,
        lines: payloadLines,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment term saved");
      if (res.term) setTerm(res.term);
    });
  }

  function handleArchiveToggle() {
    if (!termId || !term) return;
    startTransition(async () => {
      const res = term.is_active
        ? await archiveAccountingConfigPaymentTerm(termId)
        : await restoreAccountingConfigPaymentTerm(termId);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(term.is_active ? "Term archived" : "Term restored");
      load();
    });
  }

  if (loading) return <AccountingTableSkeleton rows={8} cols={2} />;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {isNew ? "New Payment Term" : term?.name || "Payment Term"}
          </h2>
          {!isNew && term ? (
            <p className="text-sm text-secondary-muted">
              {term.summary}
              {term.organization_name
                ? ` · ${term.organization_name}`
                : " · Shared"}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && term ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              disabled={isPending}
              onClick={handleArchiveToggle}
            >
              {term.is_active ? (
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
              router.push("/accounting/configuration/payment-terms")
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

      <div className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 sm:p-5 space-y-6">
        <div>
          <SectionTitle>Basic Information</SectionTitle>
          <FormRow label="Payment Term">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. 30 Days"
            />
          </FormRow>
          <FormRow label="Code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="e.g. NET30"
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
          <FormRow label="Description">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 rounded-sm"
              placeholder="Optional note"
            />
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
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Payment Schedule</SectionTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-sm"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  newLine({
                    sequence: (prev.length + 1) * 10,
                    value_amount: "0",
                    nb_days: "0",
                  }),
                ])
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Line
            </Button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">Due</th>
                  <th className="px-2 py-2 text-left font-medium">Type</th>
                  <th className="px-2 py-2 text-left font-medium">Value</th>
                  <th className="px-2 py-2 text-left font-medium">Days</th>
                  <th className="px-2 py-2 text-left font-medium">Delay</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.key} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 text-secondary-muted">
                      #{idx + 1}
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="h-8 w-full rounded-sm border border-slate-200 px-1"
                        value={line.value_amount_type}
                        onChange={(e) => {
                          const v = e.target.value as PaymentTermValueType;
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, value_amount_type: v }
                                : l
                            )
                          );
                        }}
                      >
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.value_amount}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, value_amount: e.target.value }
                                : l
                            )
                          )
                        }
                        className="h-8 rounded-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        value={line.nb_days}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, nb_days: e.target.value }
                                : l
                            )
                          )
                        }
                        className="h-8 rounded-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        className="h-8 w-full rounded-sm border border-slate-200 px-1"
                        value={line.delay_type}
                        onChange={(e) => {
                          const v = e.target.value as PaymentTermDelayType;
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === line.key
                                ? { ...l, delay_type: v }
                                : l
                            )
                          );
                        }}
                      >
                        <option value="days_after">Days after date</option>
                        <option value="days_after_end_of_month">
                          Days after end of month
                        </option>
                        <option value="days_end_of_month">
                          End of next month
                        </option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== line.key)
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <SectionTitle>Due Date Preview</SectionTitle>
          <FormRow label="Document Date">
            <Input
              type="date"
              value={previewDate}
              onChange={(e) => setPreviewDate(e.target.value)}
              className="h-8 rounded-sm max-w-[200px]"
            />
          </FormRow>
          <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm space-y-1">
            <p>
              Document due date:{" "}
              <span className="font-medium text-[#017e84]">
                {preview.due_date || "—"}
              </span>
            </p>
            {preview.schedule.map((s, i) => (
              <p key={i} className="text-secondary-muted">
                Installment {i + 1}: {s.due_date}
                {s.percent ? ` · ${s.percent}%` : ""}
                {s.amount ? ` · ${s.amount.toFixed(2)}` : ""}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
