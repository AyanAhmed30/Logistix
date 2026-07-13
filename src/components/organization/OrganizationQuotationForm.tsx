"use client";

import { useMemo, useState } from "react";
import {
  combineQuotationItemDescription,
  computeOrganizationQuotationLine,
  computeOrganizationQuotationTotals,
  deriveQuotationPercentages,
  formatOrganizationCurrency,
  splitQuotationItemDescription,
  type OrganizationQuotationLineItem,
} from "@/lib/organization-quotation";
import type { OrganizationCustomer } from "@/app/actions/organization_customers";
import type { Organization } from "@/app/actions/organizations";
import type { OrganizationQuotation } from "@/app/actions/organization_quotations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Download, PlusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OrganizationLogo } from "@/components/organization/OrganizationLogo";
import { downloadOrganizationQuotationPdf } from "@/lib/organization-quotation-pdf";

type LineItemDraft = {
  id: string;
  item: string;
  description: string;
  quantity: string;
  quantity_uom: string;
  unit_price: string;
};

type Props = {
  organization: Organization;
  customers: OrganizationCustomer[];
  quotation?: OrganizationQuotation | null;
  quotationNumber?: string;
  rfqNumber?: string;
  onSubmit: (formData: FormData) => void;
  isPending?: boolean;
};

const UOM_OPTIONS = ["kg", "m³", "pcs / u", "pairs (2u)", "Ea"];

function emptyLineItem(): LineItemDraft {
  return {
    id: crypto.randomUUID(),
    item: "",
    description: "",
    quantity: "",
    quantity_uom: "kg",
    unit_price: "",
  };
}

function toDraftItems(items: OrganizationQuotationLineItem[]): LineItemDraft[] {
  if (items.length === 0) return [emptyLineItem()];
  return items.map((item) => {
    const split = splitQuotationItemDescription(item.description);
    return {
      id: crypto.randomUUID(),
      item: split.item,
      description: split.description,
      quantity: item.quantity,
      quantity_uom: item.quantity_uom,
      unit_price: String(item.unit_price),
    };
  });
}

function addDaysToDate(date: string, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().split("T")[0];
}

function formatOrganizationAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

type CustomerPdfSource = Pick<
  OrganizationCustomer,
  | "customer_name"
  | "company_name"
  | "email"
  | "phone"
  | "address"
  | "city"
  | "country"
  | "postal_code"
  | "tax_vat_number"
>;

function toCustomerPdfData(customer: CustomerPdfSource) {
  return {
    name: customer.customer_name,
    company: customer.company_name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    country: customer.country,
    postalCode: customer.postal_code,
    taxNumber: customer.tax_vat_number,
  };
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-5 border-b last:border-b-0">
      <div className="mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">{title}</h3>
        {description ? <p className="text-xs text-secondary-muted mt-1">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function OrganizationQuotationForm({
  organization,
  customers,
  quotation,
  quotationNumber,
  rfqNumber,
  onSubmit,
  isPending = false,
}: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [customerId, setCustomerId] = useState(quotation?.organization_customer_id || "");
  const [quotationDate, setQuotationDate] = useState(quotation?.invoice_date || today);
  const [validUntil, setValidUntil] = useState(
    quotation?.due_date || addDaysToDate(today, 30)
  );
  const displayRfq = quotation?.source_reference || rfqNumber || "";
  const [notes, setNotes] = useState(quotation?.payment_communication || "");
  const [terms, setTerms] = useState(quotation?.bank_account || "");
  const initialPercentages = quotation
    ? deriveQuotationPercentages(quotation)
    : { discountPercent: 0, salesTaxPercent: 0 };
  const [discountPercent, setDiscountPercent] = useState(
    String(initialPercentages.discountPercent || 0)
  );
  const [salesTaxPercent, setSalesTaxPercent] = useState(
    String(initialPercentages.salesTaxPercent || 0)
  );
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    quotation ? toDraftItems(quotation.line_items) : [emptyLineItem()]
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) || null,
    [customers, customerId]
  );

  const customerForPdf = useMemo(() => {
    if (selectedCustomer) return toCustomerPdfData(selectedCustomer);
    if (quotation?.organization_customers) {
      return toCustomerPdfData(quotation.organization_customers);
    }
    return null;
  }, [selectedCustomer, quotation?.organization_customers]);

  const computedLines = useMemo(
    () =>
      lineItems
        .map((item) => {
          const storedDescription = combineQuotationItemDescription(item.item, item.description);
          if (!storedDescription.trim()) return null;
          return computeOrganizationQuotationLine(
            storedDescription,
            item.quantity,
            item.quantity_uom,
            parseFloat(item.unit_price) || 0
          );
        })
        .filter((item): item is OrganizationQuotationLineItem => Boolean(item)),
    [lineItems]
  );

  const totals = useMemo(
    () =>
      computeOrganizationQuotationTotals(
        computedLines,
        parseFloat(discountPercent) || 0,
        parseFloat(salesTaxPercent) || 0
      ),
    [computedLines, discountPercent, salesTaxPercent]
  );

  function updateLineItem(id: string, patch: Partial<LineItemDraft>) {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("organization_customer_id", customerId);
    formData.set("invoice_date", quotationDate);
    formData.set("due_date", validUntil);
    formData.set("payment_communication", notes);
    formData.set("bank_account", terms);
    formData.set("discount_percent", discountPercent);
    formData.set("sales_tax_percent", salesTaxPercent);
    formData.set("line_items_json", JSON.stringify(computedLines));
    if (quotation?.id) {
      formData.set("id", quotation.id);
    }
    onSubmit(formData);
  }

  const displayNumber = quotation?.quotation_number || quotationNumber || "Auto-generated";

  async function handleDownloadPdf() {
    if (computedLines.length === 0) {
      toast.error("Add at least one item with a description before downloading.");
      return;
    }

    if (!customerForPdf) {
      toast.error("Select a customer before downloading the quotation PDF.");
      return;
    }

    setIsDownloading(true);
    try {
      await downloadOrganizationQuotationPdf({
        organization: {
          name: organization.organization_name,
          logoUrl: organization.logo_url,
          address: formatOrganizationAddress([
            organization.address,
            organization.city,
            organization.country,
          ]),
          phone: organization.phone,
          email: organization.email,
          website: organization.website,
        },
        customer: customerForPdf,
        quotationNumber: displayNumber,
        quotationDate,
        expiryDate: validUntil,
        reference: displayRfq,
        lineItems: computedLines,
        grossTotal: totals.gross_total,
        discountPercent: totals.discount_percent,
        discountTotal: totals.discount_amount,
        salesTaxPercent: totals.sales_tax_percent,
        taxTotal: totals.sales_tax_amount,
        grandTotal: totals.grand_total,
        notes,
        terms,
      });
    } catch {
      toast.error("Failed to generate the PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

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
              <p className="text-xs font-semibold uppercase tracking-widest text-secondary-muted">
                Company Information
              </p>
              <p className="text-xl font-bold text-primary-dark mt-1">{organization.organization_name}</p>
              <p className="text-sm text-secondary-muted mt-1">
                {formatOrganizationAddress([organization.address, organization.city, organization.country])}
              </p>
              <div className="text-sm text-secondary-muted mt-2 space-y-0.5">
                {organization.phone ? <p>{organization.phone}</p> : null}
                {organization.email ? <p>{organization.email}</p> : null}
                {organization.website ? <p>{organization.website}</p> : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary-dark">Quotation</p>
            <p className="text-sm font-semibold text-slate-700 mt-1">{displayNumber}</p>
          </div>
        </div>

        <FormSection title="Quotation Information">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Quotation Number</Label>
              <Input value={displayNumber} readOnly className="bg-slate-50" />
            </div>
            <div className="space-y-2">
              <Label>Quotation Date *</Label>
              <Input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Valid Until *</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>RFQ #</Label>
              <Input
                value={displayRfq || (quotation ? "—" : "Auto-generated on save")}
                readOnly
                className="bg-slate-50"
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Customer Information"
          description="Select the customer this quotation is prepared for."
        >
          <div className="space-y-3">
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
                  {formatOrganizationAddress([
                    selectedCustomer.address,
                    selectedCustomer.city,
                    selectedCustomer.country,
                  ])}
                </p>
              </div>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Items" description="Add products or services included in this quotation.">
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead>Item</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, index) => {
                  const storedDescription = combineQuotationItemDescription(item.item, item.description);
                  const computed = storedDescription.trim()
                    ? computeOrganizationQuotationLine(
                        storedDescription,
                        item.quantity,
                        item.quantity_uom,
                        parseFloat(item.unit_price) || 0
                      )
                    : null;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Input
                          value={item.item}
                          onChange={(e) => updateLineItem(item.id, { item: e.target.value })}
                          placeholder="Item name"
                          required={index === 0}
                        />
                      </TableCell>
                      <TableCell className="min-w-[220px] align-top">
                        <Textarea
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                          placeholder="Description"
                          rows={4}
                          className="min-h-[100px] resize-y"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, { quantity: e.target.value })}
                          placeholder="0"
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
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
        </FormSection>

        <FormSection title="Pricing Summary">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 max-w-sm">
              <div className="space-y-2">
                <Label>Document Discount (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Sales Tax (%)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salesTaxPercent}
                  onChange={(e) => setSalesTaxPercent(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-3 lg:justify-self-end w-full lg:max-w-sm rounded-md border bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-secondary-muted">Gross Total</span>
                <span className="font-semibold">{formatOrganizationCurrency(totals.gross_total)}</span>
              </div>
              {totals.discount_amount > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-secondary-muted">
                    Discount ({totals.discount_percent.toFixed(2)}%)
                  </span>
                  <span className="font-semibold">
                    -{formatOrganizationCurrency(totals.discount_amount)}
                  </span>
                </div>
              ) : null}
              {totals.sales_tax_amount > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-secondary-muted">
                    Sales Tax ({totals.sales_tax_percent.toFixed(2)}%)
                  </span>
                  <span className="font-semibold">
                    {formatOrganizationCurrency(totals.sales_tax_amount)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t pt-3 text-base font-bold text-primary-dark">
                <span>Grand Total</span>
                <span>{formatOrganizationCurrency(totals.grand_total)}</span>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Notes" description="Additional information for the customer.">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. Payment: 100% advance. Delivery time: 12-16 weeks."
          />
        </FormSection>

        <FormSection title="Terms & Conditions">
          <Textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            placeholder="e.g. Prices are valid until the expiry date. Goods remain property of the seller until paid in full."
          />
        </FormSection>
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleDownloadPdf}
          disabled={isDownloading || !customerForPdf}
        >
          <Download className="h-4 w-4 mr-2" />
          {isDownloading ? "Preparing..." : "Download PDF"}
        </Button>
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
  const { discountPercent, salesTaxPercent } = deriveQuotationPercentages(quotation);

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
            <p className="text-sm text-secondary-muted mt-1">
              {formatOrganizationAddress([organization.address, organization.city, organization.country])}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary-dark">Quotation</p>
          <p className="font-semibold">{quotation.quotation_number}</p>
        </div>
      </div>

      <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 border-b">
        <div>
          <span className="text-secondary-muted">Quotation Date</span>
          <p>{quotation.invoice_date}</p>
        </div>
        <div>
          <span className="text-secondary-muted">Valid Until</span>
          <p>{quotation.due_date}</p>
        </div>
        <div>
          <span className="text-secondary-muted">RFQ #</span>
          <p>{quotation.source_reference || "—"}</p>
        </div>
      </div>

      <div className="px-6 py-4 border-b">
        <p className="text-xs font-semibold uppercase tracking-wide text-secondary-muted mb-2">
          Customer
        </p>
        <p className="font-semibold">{customer?.customer_name || "—"}</p>
        {customer?.company_name ? <p>{customer.company_name}</p> : null}
        {customer?.email ? <p>{customer.email}</p> : null}
        {customer?.phone ? <p>{customer.phone}</p> : null}
      </div>

      <div className="px-6 py-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotation.line_items.map((item, index) => {
              const split = splitQuotationItemDescription(item.description);
              return (
                <TableRow key={`${item.description}-${index}`}>
                  <TableCell>{split.item || "—"}</TableCell>
                  <TableCell>{split.description || item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.quantity_uom}</TableCell>
                  <TableCell>{item.unit_price.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {formatOrganizationCurrency(item.line_total)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="px-6 py-4 border-t flex justify-end">
        <div className="w-full md:max-w-sm space-y-2">
          <div className="flex justify-between">
            <span>Gross Total</span>
            <span>{formatOrganizationCurrency(quotation.subtotal)}</span>
          </div>
          {quotation.discount_total > 0 ? (
            <div className="flex justify-between">
              <span>Discount ({discountPercent.toFixed(2)}%)</span>
              <span>-{formatOrganizationCurrency(quotation.discount_total)}</span>
            </div>
          ) : null}
          {quotation.tax_total > 0 ? (
            <div className="flex justify-between">
              <span>Sales Tax ({salesTaxPercent.toFixed(2)}%)</span>
              <span>{formatOrganizationCurrency(quotation.tax_total)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Grand Total</span>
            <span>{formatOrganizationCurrency(quotation.grand_total)}</span>
          </div>
        </div>
      </div>

      {quotation.payment_communication ? (
        <div className="px-6 py-4 border-t bg-slate-50">
          <p className="font-semibold text-primary-dark mb-1">Notes</p>
          <p className="whitespace-pre-wrap">{quotation.payment_communication}</p>
        </div>
      ) : null}

      {quotation.bank_account ? (
        <div className="px-6 py-4 border-t bg-slate-50">
          <p className="font-semibold text-primary-dark mb-1">Terms & Conditions</p>
          <p className="whitespace-pre-wrap">{quotation.bank_account}</p>
        </div>
      ) : null}
    </div>
  );
}
