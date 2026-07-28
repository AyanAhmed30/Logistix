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
import type { AccountingInvoiceDetail } from "@/app/actions/accounting/invoices";
import { formatMoney } from "@/lib/sales-quotation-form";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: AccountingInvoiceDetail;
  mode: "full" | "partial";
};

export function AccountingCreateCreditNoteDialog({
  open,
  onOpenChange,
  invoice,
  mode,
}: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const isPartial = mode === "partial";

  useEffect(() => {
    if (!open) return;
    const sel: Record<string, boolean> = {};
    const qty: Record<string, string> = {};
    for (const l of invoice.lines) {
      sel[l.id] = true;
      qty[l.id] = String(l.quantity);
    }
    setSelected(sel);
    setQuantities(qty);
    setReason(isPartial ? "Partial return / refund" : "Full refund / credit");
  }, [open, invoice.lines, isPartial]);

  function toggleLine(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSubmit() {
    const lineIds = invoice.lines
      .filter((l) => selected[l.id])
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

    startTransition(async () => {
      const res = await createCreditNoteFromInvoice(invoice.id, {
        reason: reason.trim() || undefined,
        lineIds: isPartial || lineIds.length < invoice.lines.length ? lineIds : undefined,
        quantities: qtyMap,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Credit note created");
      onOpenChange(false);
      if (res.creditNoteId) {
        router.push(`/accounting/credit-notes/${res.creditNoteId}`);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isPartial ? "Partial Credit Note / Return" : "Create Credit Note"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-secondary-muted">
            Invoice {invoice.invoice_number} · {invoice.customer_name}
            {invoice.customer_lead_id ? (
              <span className="font-mono"> · #{invoice.customer_lead_id}</span>
            ) : null}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-sm min-h-[60px]"
              placeholder="Reason for credit / return"
            />
          </div>
          <div className="border border-slate-200 rounded-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  {isPartial ? <TableHead className="w-10" /> : null}
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Credit Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.lines.map((l) => (
                  <TableRow key={l.id}>
                    {isPartial ? (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[l.id])}
                          onChange={() => toggleLine(l.id)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-sm">{l.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {l.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={quantities[l.id] ?? String(l.quantity)}
                        disabled={isPartial && !selected[l.id]}
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
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-8 rounded-sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f]"
            disabled={isPending}
            onClick={handleSubmit}
          >
            {isPartial ? "Create Partial Credit Note" : "Create Credit Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
