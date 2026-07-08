"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { LOGISTIX_LOGO_PATH } from "@/lib/logistix-logo";
import type { ProformaInvoiceFormData, ProformaInvoiceLineItem } from "@/lib/proforma-invoice";

const documentInputClass =
  "h-7 rounded-none border-0 border-b border-transparent bg-transparent px-0 text-xs text-slate-900 shadow-none focus-visible:border-teal-600 focus-visible:ring-0";

const documentTitleInputClass =
  "inline-block min-w-[220px] rounded-none border-0 border-b border-transparent bg-transparent px-0 font-semibold text-xl text-teal-700 shadow-none focus-visible:border-teal-400 focus-visible:ring-0";

const documentCompanyInputClass =
  "mx-auto block w-full max-w-xs rounded-none border-0 border-b border-transparent bg-transparent px-0 text-center text-xs text-slate-600 shadow-none focus-visible:border-slate-300 focus-visible:ring-0";

type ProformaInvoiceDocumentProps = {
  form: ProformaInvoiceFormData;
  onFieldChange: <K extends keyof ProformaInvoiceFormData>(
    key: K,
    value: ProformaInvoiceFormData[K]
  ) => void;
  onLineItemChange: (index: number, key: keyof ProformaInvoiceLineItem, value: string) => void;
};

export const ProformaInvoiceDocument = forwardRef<HTMLDivElement, ProformaInvoiceDocumentProps>(
  function ProformaInvoiceDocument({ form, onFieldChange, onLineItemChange }, ref) {
    return (
      <div
        ref={ref}
        id="proforma-invoice-document"
        className="mx-auto w-full max-w-[794px] min-h-[1056px] border border-slate-200 bg-white p-8 shadow-sm md:p-10"
      >
        <div className="flex min-h-[976px] flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGISTIX_LOGO_PATH}
                alt="Logistix"
                width={150}
                height={44}
                className="h-10 w-auto"
                crossOrigin="anonymous"
              />
              <div className="max-w-xs text-[11px] leading-relaxed text-slate-600">
                National Incubation Center, NED University, Karachi,
                <br />
                Karachi City, Sindh 75270
              </div>
            </div>
            <div className="pt-1 text-right text-[11px] font-semibold text-teal-700">
              Seamless, Strategic Logistics &amp; Financing
            </div>
          </div>

          {/* Company */}
          <div className="mt-6 text-center">
            <Input
              value={form.companyName}
              onChange={(e) => onFieldChange("companyName", e.target.value)}
              placeholder="Cache Tech"
              className={documentCompanyInputClass}
            />
          </div>

          {/* Title */}
          <div className="mt-10 flex flex-wrap items-baseline gap-x-2 text-xl font-semibold text-teal-700">
            <span>PROFORMA Invoice</span>
            <input
              value={form.invoiceNumber}
              onChange={(e) => onFieldChange("invoiceNumber", e.target.value)}
              placeholder="INV/2025/00153"
              className={documentTitleInputClass}
              aria-label="Invoice number"
            />
          </div>

          {/* Meta row */}
          <div className="mt-8 space-y-1">
            <div className="grid grid-cols-3 gap-12 text-[11px] font-semibold text-teal-700">
              <div>Invoice Date</div>
              <div>Due Date</div>
              <div>Source</div>
            </div>
            <div className="grid grid-cols-3 gap-12">
              <Input
                value={form.invoiceDate}
                onChange={(e) => onFieldChange("invoiceDate", e.target.value)}
                placeholder="12/31/2025"
                className={documentInputClass}
              />
              <Input
                value={form.dueDate}
                onChange={(e) => onFieldChange("dueDate", e.target.value)}
                placeholder="12/31/2025"
                className={documentInputClass}
              />
              <Input
                value={form.source}
                onChange={(e) => onFieldChange("source", e.target.value)}
                placeholder="S00271"
                className={documentInputClass}
              />
            </div>
          </div>

          {/* Line items table */}
          <div className="mt-8 border-t border-slate-300 pt-3">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-[11px] font-semibold text-teal-700">
                  <th className="pb-2 pr-4 text-left font-semibold">Description</th>
                  <th className="w-[17%] pb-2 pr-4 text-left font-semibold">Quantity</th>
                  <th className="w-[16%] pb-2 pr-4 text-left font-semibold">Unit Price</th>
                  <th className="w-[14%] pb-2 pr-4 text-left font-semibold">Taxes</th>
                  <th className="w-[18%] pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {form.lineItems.map((item, index) => (
                  <tr key={index} className="align-top">
                    <td className="py-1.5 pr-4">
                      <Input
                        value={item.description}
                        onChange={(e) => onLineItemChange(index, "description", e.target.value)}
                        placeholder="Mother boards"
                        className={documentInputClass}
                      />
                    </td>
                    <td className="py-1.5 pr-4">
                      <Input
                        value={item.quantity}
                        onChange={(e) => onLineItemChange(index, "quantity", e.target.value)}
                        placeholder="19.53 kg"
                        className={documentInputClass}
                      />
                    </td>
                    <td className="py-1.5 pr-4">
                      <Input
                        value={item.unitPrice}
                        onChange={(e) => onLineItemChange(index, "unitPrice", e.target.value)}
                        placeholder="4,000.00"
                        className={documentInputClass}
                      />
                    </td>
                    <td className="py-1.5 pr-4">
                      <Input
                        value={item.taxes}
                        onChange={(e) => onLineItemChange(index, "taxes", e.target.value)}
                        className={documentInputClass}
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <Input
                        value={item.amount}
                        onChange={(e) => onLineItemChange(index, "amount", e.target.value)}
                        placeholder="78,120.00 Rs."
                        className={`${documentInputClass} text-right`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 border-b border-slate-300" />
          </div>

          {/* Totals */}
          <div className="mt-6 flex flex-col items-end gap-3 text-xs">
            <div className="flex min-w-[300px] items-center gap-4">
              <div className="flex-1 text-right text-[11px] font-semibold text-teal-700">
                Untaxed Amount
              </div>
              <Input
                value={form.untaxedAmount}
                onChange={(e) => onFieldChange("untaxedAmount", e.target.value)}
                placeholder="78,120.00 Rs."
                className={`${documentInputClass} w-44 text-right`}
              />
            </div>
            <div className="flex min-w-[300px] items-center gap-4">
              <div className="flex-1 text-right text-[11px] font-semibold text-teal-700">Total</div>
              <Input
                value={form.total}
                onChange={(e) => onFieldChange("total", e.target.value)}
                placeholder="78,120.00 Rs."
                className={`${documentInputClass} w-44 text-right`}
              />
            </div>
          </div>

          {/* Payment */}
          <div className="mt-8 space-y-1 text-xs text-slate-900">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">Payment Communication:</span>
              <Input
                value={form.paymentCommunication}
                onChange={(e) => onFieldChange("paymentCommunication", e.target.value)}
                placeholder="INV/2025/00153"
                className={`${documentInputClass} min-w-[180px] flex-1`}
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span>on this account:</span>
              <Input
                value={form.bankAccount}
                onChange={(e) => onFieldChange("bankAccount", e.target.value)}
                placeholder="MEEZAN BANK - Meezan Bank"
                className={`${documentInputClass} min-w-[220px] flex-1 font-semibold`}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto flex items-center justify-between pt-12 text-[10px] text-slate-500">
            <span>https://www.logistix.express</span>
            <span>Page 1 / 1</span>
          </div>
        </div>
      </div>
    );
  }
);
