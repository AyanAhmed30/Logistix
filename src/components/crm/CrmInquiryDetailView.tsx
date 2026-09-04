"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InquiryAttachmentList } from "@/components/inquiry/InquiryAttachmentList";
import { InquiryPricingSummary } from "@/components/admin/InquiryPricingSummary";
import { EstimatedDutiesAndTaxesTable } from "@/components/inquiry/EstimatedDutiesAndTaxesTable";
import { ContactInfoSummary } from "@/components/shared/ContactInfoSummary";
import { CrmEmptyState, CrmPageSkeleton } from "@/components/crm/CrmSkeleton";
import {
  getSalesInquiryDetail,
  type SalesInquiryDetail,
} from "@/app/actions/crm/all-inquiries";
import { useAdminOrganization } from "@/contexts/AdminOrganizationContext";
import {
  buildEstimatedDutiesDisplay,
  CALCULATOR_FIELD_LABELS,
  getPrimaryCalculatorValues,
  parsePricingConfig,
  parseStoredCalculatorPayload,
} from "@/lib/inquiry-calculator";
import {
  inquiryQuotationHref,
  type InquiryWorkflowStatusKey,
} from "@/lib/inquiry-workflow";

function workflowBadgeClass(key: InquiryWorkflowStatusKey): string {
  switch (key) {
    case "ready_for_quotation":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "send_to_admin":
      return "border-sky-300 bg-sky-50 text-sky-800";
    case "send_to_operation":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = String(value || "").trim();
  return (
    <div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className="text-sm text-primary-dark mt-0.5 break-words">{display || "—"}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-sm shadow-sm p-4 sm:p-5 space-y-4">
      <h2 className="text-sm font-semibold text-primary-dark border-b border-slate-100 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CrmInquiryDetailView({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const { switchVersion } = useAdminOrganization();
  const [inquiry, setInquiry] = useState<SalesInquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    title: string;
    kind?: "image" | "pdf";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSalesInquiryDetail(inquiryId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        toast.error(res.error);
        setInquiry(null);
      } else if ("inquiry" in res) {
        setInquiry(res.inquiry);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [inquiryId, switchVersion]);

  const parsed = useMemo(
    () => (inquiry ? parseStoredCalculatorPayload(inquiry.calculator_values) : null),
    [inquiry]
  );
  const primary = parsed?.calculators[0] || {};
  const duties = inquiry
    ? buildEstimatedDutiesDisplay(inquiry.calculator_values, {
        hsCode: inquiry.hs_code,
        quantity: inquiry.quantity,
      })
    : null;

  if (loading) {
    return (
      <div className="p-1">
        <CrmPageSkeleton rows={8} />
      </div>
    );
  }

  if (!inquiry) {
    return (
      <CrmEmptyState
        title="Inquiry not found"
        description="This inquiry is not available, or you do not have permission to view it."
        action={
          <Button
            size="sm"
            variant="outline"
            className="rounded-sm"
            onClick={() => router.push("/crm/inquiries")}
          >
            Back to All Inquiries
          </Button>
        }
      />
    );
  }

  const customer = inquiry.customer;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm shrink-0"
            onClick={() => router.push("/crm/inquiries")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-primary-dark truncate">
              {inquiry.product_name || "Inquiry"}
            </h1>
            <p className="text-sm text-secondary-muted">
              Lead {inquiry.lead_number}
              {inquiry.opportunity_name ? ` · ${inquiry.opportunity_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {inquiry.workflow.isReadyForQuotation ? (
            <Button
              size="sm"
              className="h-8 rounded-sm bg-[#017e84] hover:bg-[#016970] text-white"
              onClick={() => router.push(inquiryQuotationHref(inquiry.id))}
            >
              Ready for Quotation
            </Button>
          ) : (
            <span
              className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-xs font-medium ${workflowBadgeClass(inquiry.workflow.key)}`}
            >
              {inquiry.workflow.label}
            </span>
          )}
        </div>
      </div>

      <Section title="Customer details">
        <div className="flex items-start gap-3">
          <Building2 className="h-4 w-4 text-[#017e84] mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
              <DetailField label="Customer name" value={customer.name} />
              <DetailField label="Company" value={customer.company_name} />
              <DetailField label="Lead number" value={inquiry.lead_number} />
              <DetailField label="Phone" value={customer.phone} />
              <DetailField label="Mobile" value={customer.mobile} />
              <DetailField label="Email" value={customer.email} />
              <DetailField label="Job position" value={customer.job_position} />
              <DetailField label="Industry" value={customer.industry} />
              <DetailField label="Tax ID" value={customer.tax_id} />
              <DetailField label="Website" value={customer.website} />
              <DetailField
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
          </div>
        </div>
      </Section>

      <Section title="Inquiry details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          <DetailField label="Product" value={inquiry.product_name} />
          <DetailField label="Quantity" value={inquiry.quantity} />
          <DetailField label="Weight (kg)" value={inquiry.total_weight} />
          <DetailField label="CBM" value={inquiry.cbm} />
          <DetailField label="HS Code" value={inquiry.hs_code} />
          <DetailField label="Salesperson" value={inquiry.sales_agent_name} />
          <DetailField label="Sent to Operations" value={formatWhen(inquiry.sent_at)} />
          <DetailField label="Approved" value={formatWhen(inquiry.approved_at)} />
          {inquiry.link_url ? <DetailField label="Link" value={inquiry.link_url} /> : null}
        </div>
        {inquiry.description ? (
          <div>
            <div className="text-xs text-slate-500 font-medium mb-1">Description</div>
            <p className="text-sm text-primary-dark whitespace-pre-wrap">{inquiry.description}</p>
          </div>
        ) : null}
        {inquiry.operations_description ? (
          <div>
            <div className="text-xs text-slate-500 font-medium mb-1">Operations notes</div>
            <p className="text-sm text-primary-dark whitespace-pre-wrap">
              {inquiry.operations_description}
            </p>
          </div>
        ) : null}
        {inquiry.valuation_ruling_applied ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <DetailField
              label="Valuation ruling applied"
              value={inquiry.valuation_ruling_applied === "yes" ? "Yes" : "No"}
            />
            {inquiry.valuation_ruling_applied === "yes" ? (
              <DetailField label="VR number" value={inquiry.valuation_ruling_number} />
            ) : null}
          </div>
        ) : null}
      </Section>

      <Section title="Calculations and pricing">
        {inquiry.pricing ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-sm border border-teal-200 bg-teal-50/40 px-3 py-2">
              <div className="text-xs text-slate-500">Approved unit price</div>
              <div className="text-sm font-semibold text-teal-900">
                {inquiry.pricing.unit_price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="rounded-sm border border-teal-200 bg-teal-50/40 px-3 py-2">
              <div className="text-xs text-slate-500">Total amount</div>
              <div className="text-sm font-semibold text-teal-900">
                {inquiry.pricing.total_amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            <div className="rounded-sm border border-teal-200 bg-teal-50/40 px-3 py-2">
              <div className="text-xs text-slate-500">Final rate</div>
              <div className="text-sm font-semibold text-teal-900">
                {inquiry.pricing.final_price.toFixed(6)}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Pricing appears after Operations completes calculations and Admin approves the rate.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
          {Object.entries(CALCULATOR_FIELD_LABELS).map(([key, label]) => {
            const value = getPrimaryCalculatorValues(inquiry.calculator_values)[key];
            if (!String(value || "").trim()) return null;
            return <DetailField key={key} label={label} value={value} />;
          })}
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
        <div className="space-y-4">
          <InquiryAttachmentList
            urls={inquiry.sales_attachment_urls}
            title="Sales attachments"
            onPreviewImage={(url, title, kind) => setImagePreview({ url, title, kind })}
          />
          {inquiry.valuation_ruling_applied === "yes" &&
          inquiry.valuation_ruling_attachment_url ? (
            <InquiryAttachmentList
              urls={[inquiry.valuation_ruling_attachment_url]}
              title="VR attachment"
              onPreviewImage={(url, title, kind) => setImagePreview({ url, title, kind })}
            />
          ) : null}
          <InquiryAttachmentList
            urls={inquiry.operations_attachment_urls}
            title="Operations attachments"
            onPreviewImage={(url, title, kind) => setImagePreview({ url, title, kind })}
          />
          {inquiry.sales_attachment_urls.length === 0 &&
          inquiry.operations_attachment_urls.length === 0 &&
          !inquiry.valuation_ruling_attachment_url ? (
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              No attachments on this inquiry.
            </p>
          ) : null}
        </div>
      </Section>

      {inquiry.confirmation ? (
        <Section title="Workflow">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            <DetailField label="Current status" value={inquiry.workflow.label} />
            <DetailField label="Operations submitted by" value={inquiry.confirmation.submitted_by} />
            <DetailField label="Admin reviewed by" value={inquiry.confirmation.reviewed_by} />
            <DetailField label="Reviewed at" value={formatWhen(inquiry.confirmation.reviewed_at)} />
          </div>
          {inquiry.confirmation.rejection_reason ? (
            <div className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {inquiry.confirmation.rejection_reason}
            </div>
          ) : null}
        </Section>
      ) : null}

      {imagePreview ? (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <p className="text-sm text-white truncate">{imagePreview.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild size="sm" variant="outline" className="h-8 bg-white">
                <a href={imagePreview.url} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 bg-white"
                onClick={() => setImagePreview(null)}
              >
                Close
              </Button>
            </div>
          </div>
          {imagePreview.kind === "pdf" ? (
            <iframe
              src={imagePreview.url}
              title={imagePreview.title}
              className="flex-1 w-full rounded bg-white"
            />
          ) : (
            <button
              type="button"
              className="flex-1 flex items-center justify-center"
              onClick={() => setImagePreview(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview.url}
                alt={imagePreview.title}
                className="max-h-full max-w-full object-contain rounded"
              />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
