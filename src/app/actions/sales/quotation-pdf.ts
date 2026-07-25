'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSalesQuotationDetail } from '@/app/actions/sales/quotation-form';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';

export type SalesQuotationPdfPayload = {
  organization: {
    name: string;
    logoUrl: string | null;
    address: string;
    email: string;
    phone: string;
    website: string;
  };
  customer: {
    name: string;
    contactPerson: string | null;
    invoiceAddress: string;
    deliveryAddress: string;
  };
  quotation: {
    number: string;
    date: string;
    expiration: string | null;
    salesperson: string | null;
    customerReference: string | null;
    paymentTerms: string;
    customerNotes: string | null;
    status: string;
  };
  lines: Array<{
    product: string;
    description: string;
    quantity: number;
    uom: string;
    unitPrice: number;
    discount: number;
    taxes: number;
    lineTotal: number;
  }>;
  totals: {
    untaxed: number;
    tax: number;
    total: number;
  };
};

function formatAddress(parts: {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  address?: string | null;
}) {
  return [
    parts.street || parts.address,
    parts.street2,
    [parts.city, parts.state, parts.zip].filter(Boolean).join(', '),
    parts.country,
  ]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join('\n');
}

async function loadContactAddress(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  contactId: string | null
) {
  if (!contactId) return { name: null as string | null, address: '' };
  const { data } = await supabase
    .from('contacts')
    .select('name, street, street2, city, state, zip, country')
    .eq('id', contactId)
    .maybeSingle();
  if (!data) return { name: null, address: '' };
  return {
    name: data.name ? String(data.name) : null,
    address: formatAddress(data),
  };
}

export async function getSalesQuotationPdfPayload(quotationId: string) {
  try {
    const session = await getSession();
    if (!session || !sessionHasSalesAccess(session)) {
      return { error: 'Unauthorized' };
    }

    const detailRes = await getSalesQuotationDetail(quotationId);
    if ('error' in detailRes && detailRes.error) return { error: detailRes.error };
    const q = detailRes.quotation;
    if (!q) return { error: 'Quotation not found' };

    const supabase = await createAdminClient();

    let org = {
      name: 'Company',
      logoUrl: null as string | null,
      address: '',
      email: '',
      phone: '',
      website: '',
    };

    const orgId = q.organization_id;
    if (orgId) {
      const { data: organization } = await supabase
        .from('organizations')
        .select(
          'organization_name, email, phone, address, street, street_2, city, state, zip, country, website, logo_url'
        )
        .eq('id', orgId)
        .maybeSingle();

      if (organization) {
        org = {
          name: String(organization.organization_name || 'Company'),
          logoUrl: organization.logo_url ? String(organization.logo_url) : null,
          address: formatAddress({
            street: organization.street || organization.address,
            street2: organization.street_2,
            city: organization.city,
            state: organization.state,
            zip: organization.zip,
            country: organization.country,
          }),
          email: String(organization.email || ''),
          phone: String(organization.phone || ''),
          website: String(organization.website || ''),
        };
      }
    }

    const contactPerson = await loadContactAddress(supabase, q.contact_person_id);
    const invoice = await loadContactAddress(
      supabase,
      q.invoice_address_id || q.contact_id
    );
    const delivery = await loadContactAddress(
      supabase,
      q.delivery_address_id || q.contact_id
    );

    const payload: SalesQuotationPdfPayload = {
      organization: org,
      customer: {
        name: q.customer_name,
        contactPerson: contactPerson.name,
        invoiceAddress: invoice.address,
        deliveryAddress: delivery.address,
      },
      quotation: {
        number: q.quotation_number,
        date: q.quotation_date || q.created_at.slice(0, 10),
        expiration: q.expiration_date,
        salesperson: q.salesperson_name ?? null,
        customerReference: q.customer_reference ?? null,
        paymentTerms: q.payment_terms,
        customerNotes: q.customer_notes,
        status: q.status,
      },
      lines: q.lines.map((line) => ({
        product: line.product_name,
        description: line.description || line.product_name,
        quantity: line.quantity,
        uom: line.uom,
        unitPrice: line.unit_price,
        discount: line.discount,
        taxes: line.taxes,
        lineTotal: line.line_total,
      })),
      totals: {
        untaxed: q.untaxed_amount,
        tax: q.tax_amount,
        total: q.total_amount,
      },
    };

    return { payload };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Failed to build PDF payload',
    };
  }
}
