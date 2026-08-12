"use client";

/**
 * Read-only customer/contact summary under pickers.
 * Source of truth = Contact record — never duplicates editable fields.
 */

export type ContactInfoSummaryData = {
  name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  lead_id_formatted?: string | null;
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  /** Pre-formatted multi-line address (preferred when available). */
  address?: string | null;
  website?: string | null;
  tax_id?: string | null;
};

function row(label: string, value: string | null | undefined) {
  const v = String(value || "").trim();
  if (!v) return null;
  return (
    <div key={label} className="flex gap-1.5 text-[11px] leading-snug">
      <span className="text-slate-400 shrink-0 min-w-[4.5rem]">{label}</span>
      <span className="text-secondary-muted break-words">{v}</span>
    </div>
  );
}

function buildAddress(data: ContactInfoSummaryData): string | null {
  if (data.address?.trim()) return data.address.trim();
  const parts = [
    data.street,
    data.street2,
    [data.city, data.state, data.zip].filter(Boolean).join(", "),
    data.country,
  ]
    .map((p) => String(p || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export function ContactInfoSummary({
  data,
  className,
}: {
  data: ContactInfoSummaryData | null;
  className?: string;
}) {
  if (!data) return null;

  const address = buildAddress(data);
  const phone =
    data.phone?.trim() && data.mobile?.trim() && data.phone.trim() !== data.mobile.trim()
      ? data.phone
      : data.phone || data.mobile;
  const mobile =
    data.mobile?.trim() &&
    data.phone?.trim() &&
    data.mobile.trim() !== data.phone.trim()
      ? data.mobile
      : !data.phone?.trim()
        ? data.mobile
        : null;

  const showName =
    data.name?.trim() &&
    data.company_name?.trim() &&
    data.name.trim() !== data.company_name.trim();

  const items = [
    data.lead_id_formatted
      ? row("Customer ID", `#${data.lead_id_formatted}`)
      : null,
    showName ? row("Name", data.name) : null,
    row("Company", data.company_name),
    row("Email", data.email),
    row("Phone", phone),
    row("Mobile", mobile),
    address
      ? (
          <div key="address" className="flex gap-1.5 text-[11px] leading-snug">
            <span className="text-slate-400 shrink-0 min-w-[4.5rem]">Address</span>
            <span className="text-secondary-muted whitespace-pre-line break-words">
              {address}
            </span>
          </div>
        )
      : null,
    row("City", !address ? data.city : null),
    row("Country", !address ? data.country : null),
    row("Website", data.website),
    row("Tax ID", data.tax_id),
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div
      className={`mt-1.5 space-y-0.5 rounded-sm border border-slate-100 bg-slate-50/80 px-2.5 py-2 ${className || ""}`}
    >
      {items}
    </div>
  );
}
