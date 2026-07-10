"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeOrganizationQuotationLine,
  computeOrganizationQuotationTotals,
  formatOrganizationCurrency,
  formatQuotationQuantityDisplay,
  type OrganizationQuotationLineItem,
} from "@/lib/organization-quotation";
import type { OrganizationCustomer } from "@/app/actions/organization_customers";
import type { Organization } from "@/app/actions/organizations";
import type { OrganizationQuotation } from "@/app/actions/organization_quotations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PlusCircle, Trash2 } from "lucide-react";
import { OrganizationLogo } from "@/components/organization/OrganizationLogo";

type LineItemDraft = {
  id: string;
  description: string;
  quantity: string;
  quantity_uom: string;
  unit_price: string;
  tax_rate: string;
};

type Props = {
  organization: Organization;
  customers: OrganizationCustomer[];
  quotation?: OrganizationQuotation | null;
  quotationNumber?: string;
  onSubmit: (formData: FormData) => void;
  isPending?: boolean;
};

const UOM_OPTIONS = ["kg", "m³", "pcs / u", "pairs (2u)"];

function emptyLineItem(): LineItemDraft {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: "",
    quantity_uom: "kg",
    unit_price: "",
    tax_rate: "0",
  };
}

function toDraftItems(items: OrganizationQuotationLineItem[]): LineItemDraft[] {
  if (items.length === 0) return [emptyLineItem()];
  return items.map((item) => ({
    id: crypto.randomUUID(),
    description: item.description,
    quantity: item.quantity,
    quantity_uom: item.quantity_uom,
    unit_price: String(item.unit_price),
    tax_rate: String(item.tax_rate),
  }));
}

export function OrganizationQuotationForm({
  organization,
  customers,
  quotation,
  quotationNumber,
  onSubmit,
  isPending = false,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [customerId, setCustomerId] = useState(quotation?.organization_customer_id || "");
  const [invoiceDate, setInvoiceDate] = useState(quotation?.invoice_date || today);
  const [dueDate, setDueDate] = useState(quotation?.due_date || today);
  const [sourceReference, setSourceReference] = useState(quotation?.source_reference || "");
  const [paymentCommunication, setPaymentCommunication] = useState(
    quotation?.payment_communication || quotationNumber || quotation?.quotation_number || ""
  );
  const [bankAccount, setBankAccount] = useState(
    quotation?.bank_account || "MEEZAN BANK - Meezan Bank"
  );
  const [discountTotal, setDiscountTotal] = useState(
    quotation ? String(quotation.discount_total || 0) : "0"
  );
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    quotation ? toDraftItems(quotation.line_items) : [emptyLineItem()]
  );

  useEffect(() => {
    if (!quotation && quotationNumber) {
      setPaymentCommunication(quotationNumber);
    }
  }, [quotation, quotationNumber]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );

  const computedLines = useMemo(
    () =>
      lineItems
        .map((item) =>
          item.description.trim()
            ? computeOrganizationQuotationLine(
                item.description,
                item.quantity,
                item.quantity_uom,
                parseFloat(item.unit_price) || 0,
                parseFloat(item.tax_rate) || 0
              )
            : null
        )
        .filter((item): item is OrganizationQuotationLineItem => Boolean(item)),
    [lineItems]
  );

  const totals = useMemo(
    () => computeOrganizationQuotationTotals(computedLines, parseFloat(discountTotal) || 0),
    [computedLines, discountTotal]
  );

  function updateLineItem(id: string, patch: Partial<LineItemDraft>) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("organization_customer_id", customerId);
    formData.set("invoice_date", invoiceDate);
    formData.set("due_date", dueDate);
    formData.set("source_reference", sourceReference);
    formData.set("payment_communication", paymentCommunication);
    formData.set("bank_account", bankAccount);
    formData.set("discount_total", discountTotal);
    formData.set("line_items_json", JSON.stringify(computedLines));
    if (quotation?.id) {
      formData.set("id", quotation.id);
    }
    onSubmit(formData);
  }

  const displayNumber = quotation?.quotation_number || quotationNumber || "Auto-generated";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border rounded-md overflow-hidden bg-white">
        <div className="px-6 py-5 border-b bg-slate-50 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <OrganizationLogo
              logoUrl={organization.logo_url}
              alt={`${organization.organization_name} logo`}
              width={72}
              height={72}
              className="h-16 w-16 rounded-lg object-cover border border-slate-200 shrink-0"
            />
            <div>
              <p className="text-xl font-bold text-primary-dark">{organization.organization_name}</p>
              <p className="text-sm text-secondary-muted mt-1">
                {[organization.address, organization.city, organization.country].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary-dark">PROFORMA Invoice</p>
            <p className="text-sm font-semibold text-slate-700">{displayNumber}</p>
          </div>
        </div>

        <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b">
          <div className="space-y-2">
            <Label>Invoice Date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input
              value={sourceReference}
              onChange={(e) => setSourceReference(e.target.value)}
              placeholder="e.g. S00271"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-b space-y-3">
          <Label>Customer *</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.customer_name}
                  {customer.company_name ? ` (${customer.company_name})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCustomer ? (
            <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
              <p className="font-semibold text-primary-dark">{selectedCustomer.customer_name}</p>
              {selectedCustomer.company_name ? <p>{selectedCustomer.company_name}</p> : null}
              <p>{selectedCustomer.email}</p>
              <p>{selectedCustomer.phone}</p>
              <p>
                {[selectedCustomer.address, selectedCustomer.city, selectedCustomer.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4">
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Taxes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => {
                  const computed = item.description.trim()
                    ? computeOrganizationQuotationLine(
                        item.description,
                        item.quantity,
                        item.quantity_uom,
                        parseFloat(item.unit_price) || 0,
                        parseFloat(item.tax_rate) || 0
                      )
                    : null;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          placeholder="Item description"
                          required={index === 0}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Input
                            value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, { quantity: e.target.value })}
                            placeholder="0"
                            className="w-24"
                          />
                          <Select
                            value={item.quantity_uom}
                            onValueChange={(value) => updateLineItem(item.id, { quantity_uom: value })}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UOM_OPTIONS.map((uom) => (
                                <SelectItem key={uom} value={uom}>
                                  {uom}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateLineItem(item.id, { unit_price: e.target.value })}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.tax_rate}
                          onChange={(e) => updateLineItem(item.id, { tax_rate: e.target.value })}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {computed ? formatOrganizationCurrency(computed.line_total) : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setLineItems((prev) =>
                              prev.length > 1 ? prev.filter((row) => row.id !== item.id) : prev
                            )
                          }
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLineItems((prev) => [...prev, emptyLineItem()])}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="px-6 py-4 border-t grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Communication</Label>
              <Input
                value={paymentCommunication}
                onChange={(e) => setPaymentCommunication(e.target.value)}
                placeholder="INV/2025/00153"
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Account</Label>
              <Input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="MEEZAN BANK - Meezan Bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Discount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountTotal}
                onChange={(e) => setDiscountTotal(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 md:justify-self-end w-full md:max-w-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary-muted">Untaxed Amount</span>
              <span className="font-semibold">{formatOrganizationCurrency(totals.subtotal)}</span>
            </div>
            {totals.discount_total > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-secondary-muted">Discount</span>
                <span className="font-semibold">-{formatOrganizationCurrency(totals.discount_total)}</span>
              </div>
            ) : null}
            {totals.tax_total > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-secondary-muted">Tax</span>
                <span className="font-semibold">{formatOrganizationCurrency(totals.tax_total)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t pt-3 text-base font-bold text-primary-dark">
              <span>Total</span>
              <span>{formatOrganizationCurrency(totals.grand_total)}</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-slate-50 text-sm text-secondary-muted">
          <p className="font-medium text-primary-dark">Seamless, Strategic Logistics &amp; Financing</p>
          <p className="mt-1">
            {[organization.address, organization.city, organization.country].filter(Boolean).join(", ")}
          </p>
          <p className="mt-1">https://www.logistix.express</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending || !customerId} className="create-console-btn">
          {isPending ? "Saving..." : quotation ? "Save Changes" : "Save Quotation"}
        </Button>
      </div>
    </form>
  );
}

export function OrganizationQuotationPreview({
  organization,
  quotation,
}: {
  organization: Organization;
  quotation: OrganizationQuotation;
}) {
  const customer = quotation.organization_customers;

  return (
    <div className="border rounded-md overflow-hidden bg-white text-sm">
      <div className="px-6 py-5 border-b bg-slate-50 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <OrganizationLogo
            logoUrl={organization.logo_url}
            alt={`${organization.organization_name} logo`}
            width={72}
            height={72}
            className="h-16 w-16 rounded-lg object-cover border border-slate-200 shrink-0"
          />
          <div>
            <p className="text-xl font-bold text-primary-dark">{organization.organization_name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary-dark">PROFORMA Invoice</p>
          <p className="font-semibold">{quotation.quotation_number}</p>
        </div>
      </div>
      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b">
        <div><span className="text-secondary-muted">Invoice Date</span><p>{quotation.invoice_date}</p></div>
        <div><span className="text-secondary-muted">Due Date</span><p>{quotation.due_date}</p></div>
        <div><span className="text-secondary-muted">Source</span><p>{quotation.source_reference || "—"}</p></div>
      </div>
      <div className="px-6 py-4 border-b">
        <p className="font-semibold">{customer?.customer_name || "—"}</p>
        {customer?.company_name ? <p>{customer.company_name}</p> : null}
      </div>
      <div className="px-6 py-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Taxes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotation.line_items.map((item, index) => (
              <TableRow key={`${item.description}-${index}`}>
                <TableCell>{item.description}</TableCell>
                <TableCell>{formatQuotationQuantityDisplay(item)}</TableCell>
                <TableCell>{item.unit_price.toLocaleString()}</TableCell>
                <TableCell>{formatOrganizationCurrency(item.tax_amount)}</TableCell>
                <TableCell className="text-right">{formatOrganizationCurrency(item.line_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="px-6 py-4 border-t flex justify-end">
        <div className="w-full md:max-w-sm space-y-2">
          <div className="flex justify-between"><span>Untaxed Amount</span><span>{formatOrganizationCurrency(quotation.subtotal)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{formatOrganizationCurrency(quotation.grand_total)}</span></div>
        </div>
      </div>
      <div className="px-6 py-4 border-t bg-slate-50">
        <p>Payment Communication: {quotation.payment_communication}</p>
        <p>on this account: {quotation.bank_account}</p>
      </div>
    </div>
  );
}
