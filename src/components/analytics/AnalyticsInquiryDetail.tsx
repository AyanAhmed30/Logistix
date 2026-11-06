"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAnalyticsInquiryDetail, type InquiryTimelineEntry } from "@/app/actions/analytics/inquiries";
import { ContactInfoSummary } from "@/components/shared/ContactInfoSummary";
import { EstimatedDutiesAndTaxesTable } from "@/components/inquiry/EstimatedDutiesAndTaxesTable";
import { InquiryAttachmentList } from "@/components/inquiry/InquiryAttachmentList";
import { InquiryPricingSummary } from "@/components/admin/InquiryPricingSummary";
import {
  buildEstimatedDutiesDisplay,
  CALCULATOR_FIELD_LABELS,
  getPrimaryCalculatorValues,
  parsePricingConfig,
  parseStoredCalculatorPayload,
} from "@/lib/inquiry-calculator";
import { formatDuration } from "@/lib/analytics/format-duration";
import { useLoad } from "@/components/analytics/AnalyticsDashboardKit";
import { AnalyticsError, AnalyticsLoading, formatDateTime } from "@/components/analytics/AnalyticsParts";

type Detail = Exclude<Awaited<ReturnType<typeof getAnalyticsInquiryDetail>>, { error: string }>;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-0.5 text-sm text-primary-dark break-words whitespace-pre-line">
        {String(value || "").trim() || "—"}
      </p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-primary-dark">{title}</h2>
        {description ? <p className="text-xs text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const DOT: Record<InquiryTimelineEntry["tone"], string> = {
  neutral: "bg-[#017e84]",
  success: "bg-emerald-600",
  danger: "bg-red-600",
  warning: "bg-amber-500",
};

function Timeline({ entries }: { entries: InquiryTimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-600">No events recorded yet.</p>;
  return (
    <ol>
      {entries.map((entry, index) => {
        const previous = entries[index - 1];
        const gap = previous ? (Date.parse(entry.at) - Date.parse(previous.at)) / 1000 : null;
        return (
          <li key={`${entry.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
            {index < entries.length - 1 ? (
              <span aria-hidden className="absolute left-[4px] top-4 bottom-0 w-px bg-slate-200" />
            ) : null}
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[entry.tone]}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary-dark">{entry.label}</p>
              <p className="text-xs tabular-nums text-slate-600">
                {formatDateTime(entry.at)}
                {entry.actor ? `, by ${entry.actor}` : ""}
                {gap !== null ? `, ${formatDuration(gap)} after the previous step` : ""}
              </p>
              {entry.remark ? (
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{entry.remark}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Complete inquiry, rendered inside Analytics. onBack returns to the list it came from. */
export function AnalyticsInquiryDetail({
  inquiryId,
  backLabel,
  onBack,
}: {
  inquiryId: string;
  backLabel: string;
  onBack: () => void;
}) {
  const { data, error, onRetry } = useLoad<Detail>(() => getAnalyticsInquiryDetail(inquiryId), inquiryId);
  const [preview, setPreview] = useState<{ url: string; title: string; kind?: "image" | "pdf" } | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [inquiryId]);

  const inquiry = data?.inquiry;
  const primary = useMemo(
    () => (inquiry ? parseStoredCalculatorPayload(inquiry.calculator_values).calculators[0] || {} : {}),
    [inquiry]
  );
  const duties = inquiry
    ? buildEstimatedDutiesDisplay(inquiry.calculator_values, { hsCode: inquiry.hs_code, quantity: inquiry.quantity })
    : null;

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-[#017e84]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {backLabel}
    </button>
  );

  if (error) {
    return (
      <div className="space-y-3">
        {back}
        <AnalyticsError message={error} onRetry={onRetry} />
      </div>
    );
  }
  if (!data || !inquiry) {
    return (
      <div className="space-y-3">
        {back}
        <AnalyticsLoading label="Loading inquiry" />
      </div>
    );
  }

  const customer = inquiry.customer;
  const flags = inquiry.flags || [];
  const calculated = getPrimaryCalculatorValues(inquiry.calculator_values);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {back}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-primary-dark truncate">
              {inquiry.inquiry_reference || inquiry.product_name || "Inquiry"}
            </h1>
            <p className="text-sm text-slate-600">
              {customer.name}, Customer ID {inquiry.lead_number}
            </p>
          </div>
          <span className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-primary-dark">
            {inquiry.workflow.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-w-0 space-y-4 xl:col-span-8">
          <Section title="Customer details">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Customer name" value={customer.name} />
              <Field label="Company" value={customer.company_name} />
              <Field label="Customer ID" value={inquiry.lead_number} />
              <Field label="Phone" value={customer.phone} />
              <Field label="Mobile" value={customer.mobile} />
              <Field label="Email" value={customer.email} />
              <Field label="Job position" value={customer.job_position} />
              <Field label="Industry" value={customer.industry} />
              <Field label="Tax ID" value={customer.tax_id} />
              <Field label="Website" value={customer.website} />
              <Field
                label="Address"
                value={[
                  customer.street,
                  customer.street2,
                  [customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
                  customer.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              />
            </div>
            <ContactInfoSummary
              data={{
                name: customer.name,
                company_name: customer.company_name,
                email: customer.email,
                phone: customer.phone,
                mobile: customer.mobile,
                lead_id_formatted: customer.lead_id_formatted || inquiry.lead_number,
                street: customer.street,
                street2: customer.street2,
                city: customer.city,
                state: customer.state,
                zip: customer.zip,
                country: customer.country,
                website: customer.website,
                tax_id: customer.tax_id,
              }}
            />
          </Section>

          <Section title="Inquiry details">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Inquiry reference" value={inquiry.inquiry_reference} />
              <Field label="Product" value={inquiry.product_name} />
              <Field label="Quantity" value={inquiry.quantity} />
              <Field label="Weight (kg)" value={inquiry.total_weight} />
              <Field label="CBM" value={inquiry.cbm} />
              <Field label="HS Code" value={inquiry.hs_code} />
              <Field label="Salesperson" value={inquiry.sales_agent_name} />
              <Field label="Opportunity" value={inquiry.opportunity_name} />
              {inquiry.link_url ? <Field label="Link" value={inquiry.link_url} /> : null}
            </div>
            {inquiry.description ? <Field label="Description" value={inquiry.description} /> : null}
            {inquiry.operations_description ? <Field label="Operations notes" value={inquiry.operations_description} /> : null}
            {inquiry.valuation_ruling_applied ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Valuation ruling applied" value={inquiry.valuation_ruling_applied === "yes" ? "Yes" : "No"} />
                {inquiry.valuation_ruling_applied === "yes" ? (
                  <Field label="VR number" value={inquiry.valuation_ruling_number} />
                ) : null}
              </div>
            ) : null}
          </Section>

          <Section title="Calculations and pricing">
            {inquiry.pricing ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Field
                  label="Approved unit price"
                  value={inquiry.pricing.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                />
                <Field
                  label="Total amount"
                  value={inquiry.pricing.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                />
                <Field label="Final rate" value={inquiry.pricing.final_price.toFixed(6)} />
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Pricing appears after Operations completes calculations and Admin approves the rate.
              </p>
            )}
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(CALCULATOR_FIELD_LABELS).map(([key, label]) =>
                String(calculated[key] || "").trim() ? <Field key={key} label={label} value={calculated[key]} /> : null
              )}
            </div>
            {Object.keys(primary).length > 0 ? (
              <InquiryPricingSummary
                calculatorValues={primary}
                totalWeightKg={parseFloat(String(inquiry.total_weight || "").replace(/,/g, "")) || 0}
                cbm={parseFloat(String(inquiry.cbm || "").replace(/,/g, "")) || 0}
                pricingConfig={parsePricingConfig(primary)}
              />
            ) : null}
            {duties ? <EstimatedDutiesAndTaxesTable data={duties} /> : null}
          </Section>

          <Section title="Attachments">
            <InquiryAttachmentList
              urls={inquiry.sales_attachment_urls}
              title="Sales attachments"
              onPreviewImage={(url, title, kind) => setPreview({ url, title, kind })}
            />
            {inquiry.valuation_ruling_applied === "yes" && inquiry.valuation_ruling_attachment_url ? (
              <InquiryAttachmentList
                urls={[inquiry.valuation_ruling_attachment_url]}
                title="VR attachment"
                onPreviewImage={(url, title, kind) => setPreview({ url, title, kind })}
              />
            ) : null}
            <InquiryAttachmentList
              urls={inquiry.operations_attachment_urls}
              title="Operations attachments"
              onPreviewImage={(url, title, kind) => setPreview({ url, title, kind })}
            />
            {inquiry.sales_attachment_urls.length === 0 &&
            inquiry.operations_attachment_urls.length === 0 &&
            !inquiry.valuation_ruling_attachment_url ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Paperclip className="h-4 w-4" aria-hidden />
                No attachments on this inquiry.
              </p>
            ) : null}
          </Section>
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-4">
          <Section
            title="Processing timeline"
            description="Recorded events only. Operations receives an inquiry the moment it is submitted."
          >
            <Timeline entries={data.timeline} />
          </Section>

          {inquiry.confirmation ? (
            <Section title="Admin review">
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Current status" value={inquiry.workflow.label} />
                <Field label="Operations submitted by" value={inquiry.confirmation.submitted_by} />
                <Field label="Reviewed by" value={inquiry.confirmation.reviewed_by} />
                <Field label="Reviewed at" value={inquiry.confirmation.reviewed_at ? formatDateTime(inquiry.confirmation.reviewed_at) : null} />
              </div>
              {inquiry.confirmation.rejection_reason ? (
                <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-xs font-medium text-red-700">Rejection reason</p>
                  <p className="text-sm text-red-700 whitespace-pre-wrap">{inquiry.confirmation.rejection_reason}</p>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title={`Flags (${flags.length})`}>
            {flags.length === 0 ? (
              <p className="text-sm text-slate-600">No flags raised on this inquiry.</p>
            ) : (
              <ol className="divide-y divide-slate-100">
                {flags.map((flag) => {
                  const addressed = Date.parse(flag.created_at) < data.latestSubmission;
                  return (
                    <li key={flag.id} className="py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600">
                          {flag.raised_by} ({flag.raised_by_role}), {formatDateTime(flag.created_at)}
                        </p>
                        <span
                          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-xs font-medium ${
                            addressed
                              ? "bg-slate-100 text-slate-700 border-slate-300"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}
                        >
                          {addressed ? "Resubmitted after" : "Open"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-primary-dark whitespace-pre-wrap">{flag.message}</p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <p className="truncate text-sm text-white">{preview.title}</p>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 bg-white">
                <a href={preview.url} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={() => setPreview(null)}>
                Close
              </Button>
            </div>
          </div>
          {preview.kind === "pdf" ? (
            <iframe src={preview.url} title={preview.title} className="w-full flex-1 rounded bg-white" />
          ) : (
            <button type="button" className="flex flex-1 items-center justify-center" onClick={() => setPreview(null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.title} className="max-h-full max-w-full rounded object-contain" />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
