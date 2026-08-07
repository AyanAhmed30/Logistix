"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  MoreHorizontal,
  Plus,
  Printer,
  Trash2,
  Wallet,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  getAccountingBillDetail,
  type AccountingBillDetail,
  type AccountingBillLine,
} from "@/app/actions/accounting/bills";
import {
  cancelAccountingBill,
  duplicateAccountingBill,
  logAccountingBillPdfAction,
  postAccountingBill,
  resetAccountingBillToDraft,
  updateAccountingBill,
} from "@/app/actions/accounting/bill-workflow";
import { registerVendorBillPayment } from "@/app/actions/accounting/vendor-payments";
import { createVendorRefundFromBill } from "@/app/actions/accounting/vendor-refunds";
import { CustomerPicker } from "@/components/admin/quotations/CustomerPicker";
import { AccountingInvoiceStatusBar } from "@/components/accounting/AccountingInvoiceStatusBar";
import { AccountingBillChatter } from "@/components/accounting/AccountingBillChatter";
import { AccountingActivitiesPanel } from "@/components/accounting/AccountingActivitiesPanel";
import { AccountingFormSkeleton } from "@/components/accounting/AccountingSkeleton";
import { generateAccountingBillPdf } from "@/lib/accounting-bill-pdf";
import { computeBillLineTotal, computeBillTotals } from "@/lib/accounting-bill-math";
import { computeDueDateFromTerms } from "@/lib/accounting-due-dates";
import { searchAccountingPaymentTerms } from "@/app/actions/accounting/payment-terms";
import { formatMoney } from "@/lib/sales-quotation-form";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import type { AccountingPaymentMethod } from "@/lib/accounting-payments";
import { SalesProductLinePicker } from "@/components/sales/SalesProductLinePicker";

type Props = { billId: string };

type EditLine = AccountingBillLine & { _key: string };

function blankLine(seq: number): EditLine {
  return {
    id: `tmp-${seq}`,
    _key: `tmp-${seq}-${Math.random()}`,
    sequence: seq,
    product_id: null,
    product_name: "",
    description: null,
    quantity: 1,
    uom: "Units",
    unit_price: 0,
    discount: 0,
    taxes: 0,
    line_total: 0,
  };
}

export function AccountingBillFormView({ billId }: Props) {
  const router = useRouter();
  const { switchVersion, isAdminContext } = useAdminOrganization();
  const [detail, setDetail] = useState<AccountingBillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [chatterKey, setChatterKey] = useState(0);

  const [vendorName, setVendorName] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [vendorLeadId, setVendorLeadId] = useState<string | null>(null);
  const [billingAddress, setBillingAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Immediate");
  const [paymentTermId, setPaymentTermId] = useState("");
  const [termOptions, setTermOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [dueDateManual, setDueDateManual] = useState(false);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] =
    useState<AccountingPaymentMethod>("bank_transfer");
  const [payRef, setPayRef] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAccountingBillDetail(billId);
    if ("error" in res && res.error) {
      toast.error(res.error);
      setDetail(null);
    } else if (res.bill) {
      const b = res.bill;
      setDetail(b);
      setVendorName(b.vendor_name || "");
      setContactId(b.contact_id);
      setVendorLeadId(b.vendor_lead_id);
      setBillingAddress(b.billing_address || "");
      setContactPerson(b.contact_person_name || "");
      setEmail(b.email || "");
      setPhone(b.phone || "");
      setBillDate(b.bill_date || "");
      setDueDate(b.due_date || "");
      setPaymentTerms(b.payment_terms || "Immediate");
      setPaymentTermId(
        (b as { payment_term_id?: string | null }).payment_term_id || ""
      );
      setDueDateManual(false);
      setReference(b.reference || "");
      setNotes(b.notes || "");
      setVendorNotes(b.vendor_notes || "");
      setLines(
        b.lines.length
          ? b.lines.map((l) => ({ ...l, _key: l.id }))
          : [blankLine(10)]
      );
      setPayAmount(String(Math.max(0, b.amount_residual || 0)));
      setPayDate(new Date().toISOString().slice(0, 10));
    }
    setLoading(false);
  }, [billId]);

  useEffect(() => {
    void load();
  }, [load, switchVersion]);

  useEffect(() => {
    void searchAccountingPaymentTerms({ limit: 80 }).then((res) => {
      if (res.terms) {
        setTermOptions(
          res.terms.map((t) => ({ id: String(t.id), name: String(t.name) }))
        );
      }
    });
  }, [switchVersion]);

  const isDraft = detail?.status === "draft";
  const isPosted =
    detail?.status === "posted" || detail?.status === "paid";

  const totals = useMemo(() => computeBillTotals(lines), [lines]);

  function updateLine(key: string, patch: Partial<EditLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const next = { ...l, ...patch };
        next.line_total = computeBillLineTotal(next);
        return next;
      })
    );
  }

  function buildPayload() {
    return {
      vendor_name: vendorName,
      contact_id: contactId,
      vendor_lead_id: vendorLeadId,
      billing_address: billingAddress || null,
      contact_person_name: contactPerson || null,
      email: email || null,
      phone: phone || null,
      bill_date: billDate,
      due_date: dueDate || null,
      payment_terms: paymentTerms,
      payment_term_id: paymentTermId || null,
      reference: reference || null,
      notes: notes || null,
      vendor_notes: vendorNotes || null,
      lines: lines.map((l, idx) => ({
        sequence: (idx + 1) * 10,
        product_id: l.product_id || null,
        product_name: l.product_name,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom,
        unit_price: l.unit_price,
        discount: l.discount,
        taxes: l.taxes,
        line_total: computeBillLineTotal(l),
      })),
    };
  }

  function save(then?: () => void) {
    startTransition(async () => {
      const res = await updateAccountingBill(billId, buildPayload());
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Bill saved");
      if ("bill" in res && res.bill) setDetail(res.bill);
      setChatterKey((k) => k + 1);
      then?.();
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      if (isDraft) {
        const saveRes = await updateAccountingBill(billId, buildPayload());
        if ("error" in saveRes && saveRes.error) {
          toast.error(saveRes.error);
          return;
        }
      }
      const res = await postAccountingBill(billId);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Bill posted");
        if (res.bill) setDetail(res.bill);
        setChatterKey((k) => k + 1);
      }
    });
  }

  function handlePayment() {
    const amount = parseFloat(payAmount);
    startTransition(async () => {
      const res = await registerVendorBillPayment(billId, {
        payment_date: payDate,
        amount,
        payment_method: payMethod,
        reference: payRef || null,
      });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Payment registered");
        setPayOpen(false);
        if (res.bill) setDetail(res.bill);
        setChatterKey((k) => k + 1);
        void load();
      }
    });
  }

  async function handlePdf(mode: "preview" | "print") {
    if (!detail) return;
    try {
      await generateAccountingBillPdf(detail, {
        openInNewTab: mode === "preview",
        openPrintDialog: mode === "print",
      });
      await logAccountingBillPdfAction(
        billId,
        mode === "print" ? "printed" : "previewed"
      );
      setChatterKey((k) => k + 1);
    } catch {
      toast.error("Failed to generate PDF");
    }
  }

  if (loading) return <AccountingFormSkeleton />;
  if (!detail) {
    return (
      <div className="p-6">
        <Button variant="outline" size="sm" onClick={() => router.push("/accounting/bills")}>
          Back to Bills
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-200 bg-slate-50/80">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={() => router.push("/accounting/bills")}
          >
            <ArrowLeft className="h-4 w-4" />
            Bills
          </Button>
          <span className="font-semibold text-primary-dark">{detail.bill_number}</span>
          <div className="ml-auto">
            <AccountingInvoiceStatusBar
              status={detail.status}
              paymentState={detail.payment_state}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200">
          {isDraft ? (
            <>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
                disabled={isPending || isAdminContext}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-sm"
                disabled={isPending}
                onClick={() => save()}
              >
                Save
              </Button>
            </>
          ) : null}
          {isPosted ? (
            <Button
              size="sm"
              className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white gap-1"
              disabled={isPending || (detail.amount_residual || 0) <= 0.004}
              onClick={() => setPayOpen(true)}
            >
              <Wallet className="h-3.5 w-3.5" />
              Register Payment
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm gap-1"
            onClick={() => void handlePdf("preview")}
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm gap-1"
            onClick={() => void handlePdf("print")}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 rounded-sm px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isPosted ? (
                <DropdownMenuItem
                  onClick={() => {
                    startTransition(async () => {
                      const res = await createVendorRefundFromBill(billId);
                      if ("error" in res && res.error) toast.error(res.error);
                      else if (res.refundId)
                        router.push(`/accounting/vendor-refunds/${res.refundId}`);
                    });
                  }}
                >
                  Create Refund
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => {
                  startTransition(async () => {
                    const res = await duplicateAccountingBill(billId);
                    if ("error" in res && res.error) toast.error(res.error);
                    else if (res.billId)
                      router.push(`/accounting/bills/${res.billId}`);
                  });
                }}
              >
                Duplicate
              </DropdownMenuItem>
              {detail.status === "posted" || detail.status === "cancelled" ? (
                <DropdownMenuItem
                  onClick={() => {
                    startTransition(async () => {
                      const res = await resetAccountingBillToDraft(billId);
                      if ("error" in res && res.error) toast.error(res.error);
                      else {
                        toast.success("Reset to draft");
                        void load();
                      }
                    });
                  }}
                >
                  Reset to Draft
                </DropdownMenuItem>
              ) : null}
              {detail.status !== "cancelled" ? (
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => {
                    startTransition(async () => {
                      const res = await cancelAccountingBill(billId);
                      if ("error" in res && res.error) toast.error(res.error);
                      else {
                        toast.success("Bill cancelled");
                        void load();
                      }
                    });
                  }}
                >
                  Cancel
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-200">
          {contactId ? (
            <button
              type="button"
              onClick={() => router.push(`/accounting/vendors/${contactId}`)}
              className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-secondary-muted hover:border-[#017e84]/40"
            >
              <span className="block text-sm font-semibold text-[#017e84]">Vendor</span>
              Profile
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/accounting/vendor-payments")}
            className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-secondary-muted hover:border-[#017e84]/40"
          >
            <span className="block text-sm font-semibold text-[#017e84]">
              {formatMoney(detail.amount_paid)}
            </span>
            Payments
          </button>
          <button
            type="button"
            onClick={() => router.push("/accounting/vendors/products")}
            className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-secondary-muted hover:border-[#017e84]/40"
          >
            <span className="block text-sm font-semibold text-[#017e84]">
              {lines.filter((l) => l.product_name).length}
            </span>
            Products
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 p-4">
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-secondary-muted">Vendor</Label>
              {isDraft ? (
                <CustomerPicker
                  contactId={contactId}
                  customerName={vendorName}
                  contactScope="vendor"
                  placeholder="Find a vendor…"
                  onSelect={(p) => {
                    setContactId(p.contact_id);
                    setVendorName(p.name);
                    setVendorLeadId(p.lead_id_formatted || null);
                    setEmail(p.email || "");
                    setPhone(p.phone || "");
                  }}
                />
              ) : (
                <p className="text-sm font-medium">{vendorName || "—"}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-secondary-muted">Vendor ID</Label>
                <p className="text-sm font-mono">{vendorLeadId || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-secondary-muted">Contact</Label>
                {isDraft ? (
                  <Input
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="h-8 rounded-sm"
                  />
                ) : (
                  <p className="text-sm">{contactPerson || "—"}</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Billing Address</Label>
              {isDraft ? (
                <Textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  className="min-h-[64px] rounded-sm text-sm"
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{billingAddress || "—"}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 content-start">
            <div>
              <Label className="text-xs text-secondary-muted">Bill Date</Label>
              {isDraft ? (
                <Input
                  type="date"
                  value={billDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBillDate(next);
                    if (!dueDateManual) {
                      const auto = computeDueDateFromTerms(next, paymentTerms);
                      if (auto) setDueDate(auto);
                    }
                  }}
                  className="h-8 rounded-sm"
                />
              ) : (
                <p className="text-sm">{billDate || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Due Date</Label>
              {isDraft ? (
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDateManual(true);
                    setDueDate(e.target.value);
                  }}
                  className="h-8 rounded-sm"
                />
              ) : (
                <p className="text-sm">{dueDate || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Payment Terms</Label>
              {isDraft ? (
                <Select
                  value={paymentTermId || paymentTerms}
                  onValueChange={(val) => {
                    const term = termOptions.find((t) => t.id === val);
                    if (term) {
                      setPaymentTermId(term.id);
                      setPaymentTerms(term.name);
                    } else {
                      setPaymentTermId("");
                      setPaymentTerms(val);
                    }
                    setDueDateManual(false);
                    const label = term?.name || val;
                    const auto = computeDueDateFromTerms(billDate, label);
                    if (auto) setDueDate(auto);
                  }}
                >
                  <SelectTrigger className="h-8 rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {termOptions.length > 0 ? (
                      termOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="Immediate">Immediate</SelectItem>
                        <SelectItem value="15 Days">15 Days</SelectItem>
                        <SelectItem value="30 Days">30 Days</SelectItem>
                        <SelectItem value="45 Days">45 Days</SelectItem>
                        <SelectItem value="60 Days">60 Days</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{paymentTerms || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Reference</Label>
              {isDraft ? (
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-8 rounded-sm"
                />
              ) : (
                <p className="text-sm">{reference || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Organization</Label>
              <p className="text-sm">{detail.organization_name || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-secondary-muted">Amount Due</Label>
              <p className="text-sm font-semibold text-[#017e84]">
                {formatMoney(detail.amount_residual)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>Product</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">Qty</TableHead>
                <TableHead className="w-20">UOM</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-20">Disc%</TableHead>
                <TableHead className="w-20">Tax%</TableHead>
                <TableHead className="text-right w-28">Total</TableHead>
                {isDraft ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l._key}>
                  <TableCell>
                    {isDraft ? (
                      <SalesProductLinePicker
                        valueName={l.product_name}
                        forPurchase
                        onSelect={(product, freeText) => {
                          if (product) {
                            updateLine(l._key, {
                              product_id: product.id,
                              product_name: product.name,
                              description:
                                product.description ||
                                product.description_sale ||
                                product.name,
                              uom: product.uom || l.uom,
                              unit_price: product.standard_price || 0,
                              taxes: product.purchase_tax_rate || 0,
                            });
                          } else if (typeof freeText === "string") {
                            updateLine(l._key, {
                              product_id: null,
                              product_name: freeText,
                            });
                          }
                        }}
                      />
                    ) : (
                      l.product_name || "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        value={l.description || ""}
                        onChange={(e) =>
                          updateLine(l._key, { description: e.target.value })
                        }
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      l.description || "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        type="number"
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(l._key, {
                            quantity: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      l.quantity
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        value={l.uom}
                        onChange={(e) => updateLine(l._key, { uom: e.target.value })}
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      l.uom
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        type="number"
                        value={l.unit_price}
                        onChange={(e) =>
                          updateLine(l._key, {
                            unit_price: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      formatMoney(l.unit_price)
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        type="number"
                        value={l.discount}
                        onChange={(e) =>
                          updateLine(l._key, {
                            discount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      l.discount
                    )}
                  </TableCell>
                  <TableCell>
                    {isDraft ? (
                      <Input
                        type="number"
                        value={l.taxes}
                        onChange={(e) =>
                          updateLine(l._key, {
                            taxes: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-sm"
                      />
                    ) : (
                      l.taxes
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(computeBillLineTotal(l))}
                  </TableCell>
                  {isDraft ? (
                    <TableCell>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600"
                        onClick={() =>
                          setLines((prev) => prev.filter((x) => x._key !== l._key))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isDraft ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 mt-2 rounded-sm gap-1"
              onClick={() =>
                setLines((prev) => [...prev, blankLine((prev.length + 1) * 10)])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add a line
            </Button>
          ) : null}
          <div className="flex justify-end mt-3 text-sm space-y-1 flex-col items-end">
            <p>
              Untaxed:{" "}
              <span className="tabular-nums font-medium">
                {formatMoney(totals.untaxed_amount)}
              </span>
            </p>
            <p>
              Tax:{" "}
              <span className="tabular-nums font-medium">
                {formatMoney(totals.tax_amount)}
              </span>
            </p>
            <p className="text-base font-semibold text-[#017e84]">
              Total: {formatMoney(totals.total_amount)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 p-4 border-t border-slate-200">
          <div>
            <Label className="text-xs text-secondary-muted">Internal Notes</Label>
            {isDraft ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[72px] rounded-sm text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{notes || "—"}</p>
            )}
          </div>
          <div>
            <Label className="text-xs text-secondary-muted">Vendor Notes</Label>
            {isDraft ? (
              <Textarea
                value={vendorNotes}
                onChange={(e) => setVendorNotes(e.target.value)}
                className="min-h-[72px] rounded-sm text-sm"
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{vendorNotes || "—"}</p>
            )}
          </div>
        </div>
      </div>

      {contactId ? <AccountingActivitiesPanel contactId={contactId} /> : null}
      <AccountingBillChatter billId={billId} refreshKey={chatterKey} />

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
            <div>
              <Label>Method</Label>
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as AccountingPaymentMethod)}
              >
                <SelectTrigger className="h-8 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="h-8 rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#017e84] hover:bg-[#016970] text-white"
              disabled={isPending}
              onClick={handlePayment}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
