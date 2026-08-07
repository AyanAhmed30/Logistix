"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createCreditNoteFromInvoice } from "@/app/actions/accounting/credit-notes";
import { getAccountingJournals } from "@/app/actions/accounting/journal-entries";
import type { AccountingInvoiceDetail } from "@/app/actions/accounting/invoices";
import { formatMoney } from "@/lib/sales-quotation-form";

type CreditMethod = "full_refund" | "partial_refund" | "cancel_invoice";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: AccountingInvoiceDetail;
  /** Prefer full; partial preselects Partial Refund. */
  mode?: "full" | "partial";
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AccountingCreateCreditNoteDialog({
  open,
  onOpenChange,
  invoice,
  mode = "full",
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reversalDate, setReversalDate] = useState(todayIso());
  const [journalId, setJournalId] = useState("");
  const [journals, setJournals] = useState<
    { id: string; name: string; code: string; type?: string | null }[]
  >([]);
  const [creditMethod, setCreditMethod] = useState<CreditMethod>("full_refund");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const isPartial = creditMethod === "partial_refund";

  useEffect(() => {
    if (!open) return;
    setReversalDate(todayIso());
    setCreditMethod(mode === "partial" ? "partial_refund" : "full_refund");
    setReason(
      mode === "partial"
        ? "Partial refund"
        : `Reversal of: ${invoice.invoice_number}`
    );
    const sel: Record<string, boolean> = {};
    const qty: Record<string, string> = {};
    for (const l of invoice.lines) {
      sel[l.id] = true;
      qty[l.id] = String(l.quantity);
    }
    setSelected(sel);
    setQuantities(qty);

    void getAccountingJournals().then((res) => {
      if ("error" in res && res.error) {
        setJournals([]);
        return;
      }
      const list = (res.journals || []).map((j) => ({
        id: String(j.id),
        name: String(j.name || ""),
        code: String(j.code || ""),
        type: j.type ? String(j.type) : null,
      }));
      setJournals(list);
      const sales =
        list.find((j) => /sale/i.test(j.type || "")) ||
        list.find((j) => /sj|sales/i.test(`${j.code} ${j.name}`)) ||
        list[0];
      setJournalId(sales?.id || "");
    });
  }, [open, invoice.lines, invoice.invoice_number, mode]);

  function toggleLine(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function runReverse(kind: "reverse" | "reverse_and_create") {
    const lineIds = invoice.lines
      .filter((l) => (isPartial ? selected[l.id] : true))
      .map((l) => l.id);
    if (!lineIds.length) {
      toast.error("Select at least one line");
      return;
    }
    const qtyMap: Record<string, number> = {};
    for (const id of lineIds) {
      const q = Number(quantities[id]);
      if (!Number.isFinite(q) || q <= 0) {
        toast.error("Enter valid quantities for selected lines");
        return;
      }
      qtyMap[id] = q;
    }

    const autoPost =
      kind === "reverse_and_create" || creditMethod === "cancel_invoice";
    const createReplacementInvoice = kind === "reverse_and_create";

    startTransition(async () => {
      const res = await createCreditNoteFromInvoice(invoice.id, {
        reason: reason.trim() || undefined,
        reversalDate,
        journalId: journalId || null,
        creditMethod,
        lineIds:
          isPartial || lineIds.length < invoice.lines.length
            ? lineIds
            : undefined,
        quantities: qtyMap,
        autoPost,
        createReplacementInvoice,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        if (res.creditNoteId) {
          onOpenChange(false);
          router.push(`/accounting/credit-notes/${res.creditNoteId}`);
        }
        return;
      }
      toast.success(
        createReplacementInvoice
          ? "Credit note posted — draft invoice created"
          : autoPost
            ? "Credit note posted"
            : "Draft credit note created"
      );
      onOpenChange(false);
      if (res.replacementInvoiceId) {
        router.push(`/accounting/invoices/${res.replacementInvoiceId}`);
        return;
      }
      if (res.creditNoteId) {
        router.push(`/accounting/credit-notes/${res.creditNoteId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credit Note</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-secondary-muted">
            Invoice {invoice.invoice_number} · {invoice.customer_name}
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Credit Method</Label>
            <div className="space-y-1.5">
              {(
                [
                  ["full_refund", "Full Refund"],
                  ["partial_refund", "Partial Refund"],
                  ["cancel_invoice", "Cancel Invoice"],
                ] as const
              ).map(([id, label]) => (
                <label
                  key={id}
                  className="flex items-center gap-2 text-sm text-primary-dark cursor-pointer"
                >
                  <input
                    type="radio"
                    name="credit-method"
                    checked={creditMethod === id}
                    onChange={() => setCreditMethod(id)}
                    className="accent-[#017e84]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reason displayed on Credit Note</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-sm min-h-[64px]"
              placeholder="Reason for credit note"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Journal</Label>
              <select
                value={journalId}
                onChange={(e) => setJournalId(e.target.value)}
                className="h-9 w-full rounded-sm border border-slate-200 bg-white px-2 text-sm"
              >
                {journals.length === 0 ? (
                  <option value="">Sales Journal</option>
                ) : null}
                {journals.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code ? `${j.code} — ${j.name}` : j.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reversal Date</Label>
              <Input
                type="date"
                value={reversalDate}
                onChange={(e) => setReversalDate(e.target.value)}
                className="h-9 rounded-sm"
              />
            </div>
          </div>

          {isPartial ? (
            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="w-10" />
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Credit Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[l.id])}
                          onChange={() => toggleLine(l.id)}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{l.product_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {l.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={quantities[l.id] ?? String(l.quantity)}
                          disabled={!selected[l.id]}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [l.id]: e.target.value,
                            }))
                          }
                          className="h-8 w-20 ml-auto rounded-sm text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatMoney(l.unit_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            className="h-8 rounded-sm order-last sm:order-first"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              className="h-8 rounded-sm border-[#017e84] text-[#017e84] hover:bg-[#017e84]/5"
              disabled={isPending}
              onClick={() => runReverse("reverse")}
            >
              Reverse
            </Button>
            {creditMethod !== "cancel_invoice" ? (
              <Button
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f] text-white"
                disabled={isPending}
                onClick={() => runReverse("reverse_and_create")}
              >
                Reverse and Create Invoice
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
