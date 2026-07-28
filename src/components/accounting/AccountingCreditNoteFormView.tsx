"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileDown, Printer, Wallet } from "lucide-react";
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
import {
  cancelAccountingCreditNote,
  getAccountingCreditNoteDetail,
  issueAccountingRefund,
  postAccountingCreditNote,
  type AccountingCreditNoteDetail,
} from "@/app/actions/accounting/credit-notes";
import { generateAccountingCreditNotePdf } from "@/lib/accounting-credit-note-pdf";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";

type Props = { creditNoteId: string };

const btnSecondary =
  "h-8 rounded-sm border-slate-200 text-primary-dark hover:bg-slate-50";
const btnPrimary = "h-8 rounded-sm bg-[#017e84] hover:bg-[#016a6f] text-white";

export function AccountingCreditNoteFormView({ creditNoteId }: Props) {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [detail, setDetail] = useState<AccountingCreditNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "bank_transfer" | "cheque">(
    "bank_transfer"
  );
  const [refundReference, setRefundReference] = useState("");
  const [refundNotes, setRefundNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAccountingCreditNoteDetail(creditNoteId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setDetail(null);
    } else if (res.creditNote) {
      setDetail(res.creditNote);
      const remaining =
        (res.creditNote.total_amount || 0) - (res.creditNote.amount_refunded || 0);
      setRefundAmount(String(Math.max(0, remaining)));
      setRefundDate(new Date().toISOString().slice(0, 10));
      window.dispatchEvent(
        new CustomEvent("accounting:document-title", {
          detail: { title: res.creditNote.credit_note_number },
        })
      );
    }
    setLoading(false);
  }, [creditNoteId]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  function handlePost() {
    startTransition(async () => {
      const res = await postAccountingCreditNote(creditNoteId);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Credit note posted");
        if (res.creditNote) setDetail(res.creditNote);
        else void load();
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountingCreditNote(creditNoteId);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Credit note cancelled");
        if (res.creditNote) setDetail(res.creditNote);
        else void load();
      }
    });
  }

  async function runPdf(mode: "preview" | "print" | "download") {
    if (!detail) return;
    setPdfBusy(true);
    try {
      await generateAccountingCreditNotePdf(detail, {
        openInNewTab: mode === "preview",
        openPrintDialog: mode === "print",
        download: mode === "download",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate credit note PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  function handleRefund() {
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    startTransition(async () => {
      const res = await issueAccountingRefund({
        creditNoteId,
        amount,
        refund_date: refundDate || undefined,
        payment_method: refundMethod,
        reference: refundReference || undefined,
        notes: refundNotes || undefined,
      });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Refund issued");
        setRefundOpen(false);
        void load();
      }
    });
  }

  if (loading) {
    return <AccountingFormSkeleton />;
  }
  if (!detail) {
    return (
      <div className="p-4 text-sm text-secondary-muted">
        Credit note not found.{" "}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm ml-2"
          onClick={() => router.push("/accounting/credit-notes")}
        >
          Back
        </Button>
      </div>
    );
  }

  const isDraft = detail.status === "draft";
  const isPosted = detail.status === "posted";
  const remaining = Math.max(
    0,
    (detail.total_amount || 0) - (detail.amount_refunded || 0)
  );
  const canRefund = isPosted && remaining > 0.004 && !isAdminContext;

  return (
    <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
      <div className="px-3 sm:px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            onClick={() => router.push("/accounting/credit-notes")}
          >
            Back
          </Button>
          {isDraft && !isAdminContext ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending}
              onClick={handlePost}
            >
              Post
            </Button>
          ) : null}
          {canRefund ? (
            <Button
              size="sm"
              className={btnPrimary}
              disabled={isPending}
              onClick={() => setRefundOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" />
              Issue Refund
            </Button>
          ) : null}
          {isDraft || isPosted ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("preview")}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("print")}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={btnSecondary}
                disabled={pdfBusy}
                onClick={() => void runPdf("download")}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" />
                PDF
              </Button>
            </>
          ) : null}
          {isDraft && !isAdminContext ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSecondary}
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          ) : null}
        </div>
        <span className="text-xs uppercase tracking-wide px-2 py-1 rounded-sm bg-slate-100 text-secondary-muted capitalize">
          {detail.status}
          {detail.refund_type ? ` · ${detail.refund_type}` : ""}
        </span>
      </div>

      <div className="px-3 sm:px-4 py-3 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-primary-dark">
          {detail.credit_note_number}
        </h1>
        <p className="text-xs text-secondary-muted mt-0.5">
          Credit Note
          {detail.customer_lead_id ? (
            <span className="ml-2 font-mono">#{detail.customer_lead_id}</span>
          ) : null}
          {detail.invoice_id && detail.invoice_number ? (
            <span className="ml-2">
              · Invoice{" "}
              <Link
                href={`/accounting/invoices/${detail.invoice_id}`}
                className="text-[#017e84] hover:underline"
              >
                {detail.invoice_number}
              </Link>
            </span>
          ) : null}
        </p>
      </div>

      <div className="px-3 sm:px-4 py-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-secondary-muted">Customer:</span>{" "}
            {detail.contact_id ? (
              <Link
                href={`/accounting/customers/${detail.contact_id}`}
                className="text-[#017e84] hover:underline"
              >
                {detail.customer_name}
              </Link>
            ) : (
              detail.customer_name
            )}
          </p>
          <p>
            <span className="text-secondary-muted">Date:</span>{" "}
            {detail.credit_note_date || "—"}
          </p>
          <p>
            <span className="text-secondary-muted">Organization:</span>{" "}
            {detail.organization_name || "—"}
          </p>
          <p>
            <span className="text-secondary-muted">Salesperson:</span>{" "}
            {detail.salesperson_name || "—"}
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-secondary-muted">Reason:</span>{" "}
            {detail.reason || "—"}
          </p>
          <p>
            <span className="text-secondary-muted">Total:</span>{" "}
            <span className="font-semibold">{formatMoney(detail.total_amount)}</span>
          </p>
          <p>
            <span className="text-secondary-muted">Refunded:</span>{" "}
            {formatMoney(detail.amount_refunded)}
          </p>
          <p>
            <span className="text-secondary-muted">Remaining:</span>{" "}
            <span className="font-semibold text-[#017e84]">
              {formatMoney(remaining)}
            </span>
          </p>
        </div>
      </div>

      <div className="px-3 sm:px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Disc%</TableHead>
              <TableHead className="text-right">Tax%</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="font-medium">{l.product_name}</div>
                  {l.description ? (
                    <div className="text-xs text-secondary-muted">{l.description}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.quantity} {l.uom}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(l.unit_price)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.discount}</TableCell>
                <TableCell className="text-right tabular-nums">{l.taxes}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatMoney(l.line_total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-end">
          <div className="text-sm space-y-1 min-w-[200px]">
            <div className="flex justify-between gap-6">
              <span className="text-secondary-muted">Untaxed</span>
              <span>{formatMoney(detail.untaxed_amount)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-secondary-muted">Tax</span>
              <span>{formatMoney(detail.tax_amount)}</span>
            </div>
            <div className="flex justify-between gap-6 font-semibold border-t pt-1">
              <span>Total</span>
              <span>{formatMoney(detail.total_amount)}</span>
            </div>
          </div>
        </div>
        {detail.customer_notes || detail.notes ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
            {detail.customer_notes ? (
              <div>
                <Label className="text-xs text-secondary-muted">Customer Notes</Label>
                <Textarea readOnly value={detail.customer_notes} className="mt-1 rounded-sm" />
              </div>
            ) : null}
            {detail.notes ? (
              <div>
                <Label className="text-xs text-secondary-muted">Internal Notes</Label>
                <Textarea readOnly value={detail.notes} className="mt-1 rounded-sm" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-secondary-muted">
              Remaining credit: {formatMoney(remaining)}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Refund Date</Label>
              <Input
                type="date"
                value={refundDate}
                onChange={(e) => setRefundDate(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Method</Label>
              <Select
                value={refundMethod}
                onValueChange={(v) =>
                  setRefundMethod(v as "cash" | "bank_transfer" | "cheque")
                }
              >
                <SelectTrigger className="h-8 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input
                value={refundReference}
                onChange={(e) => setRefundReference(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-8 rounded-sm"
              onClick={() => setRefundOpen(false)}
            >
              Close
            </Button>
            <Button
              className={btnPrimary}
              disabled={isPending}
              onClick={handleRefund}
            >
              Confirm Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
