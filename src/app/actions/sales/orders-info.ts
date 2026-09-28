'use server';

import { createAdminClient } from '@/utils/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sessionHasSalesAccess } from '@/lib/auth/require-access';
import { buildSalesOwnershipOrFilter } from '@/lib/sales-roles';
import {
  INQUIRY_IMAGES_BUCKET,
  uploadToInquiryImagesBucket,
} from '@/lib/inquiry-storage';
import {
  computeShipmentStatus,
  type OrdersInfoRow,
  type OrdersInfoSummary,
  type ShipmentInfoStatus,
} from '@/lib/sales-orders-info';
import { revalidatePath } from 'next/cache';

async function resolveSalesOrgScope() {
  const { requireAdminOrganizationScope, sessionUsesOrganizationScope } = await import(
    '@/lib/admin-organization-context'
  );
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    return { error: 'Unauthorized' as const };
  }

  if (!sessionUsesOrganizationScope(session.role)) {
    return { session, organizationId: null as string | null, isGlobalAdminView: false };
  }

  const scope = await requireAdminOrganizationScope();
  if ('error' in scope) {
    if (scope.status === 403) {
      return { session, organizationId: null as string | null, isGlobalAdminView: false, empty: true };
    }
    return { error: scope.error };
  }

  const { isSuperAdminInAdminContext } = await import('@/lib/auth/super-admin');
  if (!scope.organizationId && isSuperAdminInAdminContext(scope.session)) {
    return { session: scope.session, organizationId: null, isGlobalAdminView: true };
  }

  if (!scope.organizationId) {
    return {
      error: 'Select an organization from the header switcher to use Sales.',
    };
  }

  return {
    session: scope.session,
    organizationId: scope.organizationId,
    isGlobalAdminView: false,
  };
}

export async function getSalesOrdersInfo(input: {
  search?: string;
  shipmentStatus?: ShipmentInfoStatus | 'all';
  page?: number;
  pageSize?: number;
} = {}): Promise<
  | {
      rows: OrdersInfoRow[];
      total: number;
      page: number;
      pageSize: number;
      summary: OrdersInfoSummary;
    }
  | { error: string }
> {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    if ('empty' in scope && scope.empty) {
      return {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 40,
        summary: {
          totalQuotationsSent: 0,
          quotationsAccepted: 0,
          acceptedPending: 0,
          trackingAdded: 0,
          photoUploaded: 0,
          trackingAndPhoto: 0,
          informationComplete: 0,
        },
      };
    }

    const session = scope.session!;
    const organizationId = scope.organizationId;
    const supabase = await createAdminClient();
    const ownershipOr = await buildSalesOwnershipOrFilter(session);

    let query = supabase
      .from('quotations')
      .select(
        `
        id,
        quotation_number,
        customer_name,
        customer_reference,
        total_amount,
        status,
        negotiation_status,
        sent_to_customer_at,
        customer_accepted_at,
        shipment_tracking_number,
        shipment_parcel_photo_url,
        shipment_info_updated_at,
        updated_at,
        linked_inquiry_id,
        salesperson_id,
        organization_id,
        contact_id
      `,
        { count: 'exact' }
      )
      .not('sent_to_customer_at', 'is', null)
      .order('sent_to_customer_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }
    if (ownershipOr) {
      query = query.or(ownershipOr);
    }

    const search = String(input.search || '').trim();
    if (search) {
      const like = `%${search}%`;
      const searchParts = [
        `quotation_number.ilike.${like}`,
        `customer_name.ilike.${like}`,
        `shipment_tracking_number.ilike.${like}`,
        `customer_reference.ilike.${like}`,
        `customer_reference.eq.${search}`,
      ];

      // Match Customer ID on contacts, then include those quotations
      try {
        const { data: idMatches } = await supabase
          .from('contacts')
          .select('id')
          .or(`lead_id_formatted.eq.${search},lead_id_formatted.ilike.${like}`)
          .limit(50);
        const matchedIds = (idMatches || [])
          .map((c) => c.id)
          .filter(Boolean) as string[];
        if (matchedIds.length > 0) {
          searchParts.push(`contact_id.in.(${matchedIds.join(',')})`);
        }
      } catch {
        // lead_id_formatted may be unavailable via PostgREST in some envs
      }

      query = query.or(searchParts.join(','));
    }

    const page = Math.max(1, input.page || 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize || 40));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);
    if (error) return { error: error.message };

    const agentIds = [
      ...new Set(
        (data || [])
          .map((row) => (row as { salesperson_id?: string | null }).salesperson_id)
          .filter(Boolean) as string[]
      ),
    ];
    const contactIds = [
      ...new Set(
        (data || [])
          .map((row) => (row as { contact_id?: string | null }).contact_id)
          .filter(Boolean) as string[]
      ),
    ];

    const agentNameById = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('sales_agents')
        .select('id, name')
        .in('id', agentIds);
      for (const agent of agents || []) {
        agentNameById.set(String(agent.id), String(agent.name || ''));
      }
    }

    const contactById = new Map<
      string,
      { email?: string | null; phone?: string | null; lead_id_formatted?: string | null }
    >();
    if (contactIds.length > 0) {
      let contacts:
        | Array<{
            id: string;
            email?: string | null;
            phone?: string | null;
            lead_id_formatted?: string | null;
          }>
        | null = null;

      const withLeadId = await supabase
        .from('contacts')
        .select('id, email, phone, lead_id_formatted')
        .in('id', contactIds);
      if (!withLeadId.error) {
        contacts = withLeadId.data;
      } else {
        const fallback = await supabase
          .from('contacts')
          .select('id, email, phone')
          .in('id', contactIds);
        contacts = fallback.data;
      }

      for (const contact of contacts || []) {
        contactById.set(String(contact.id), {
          email: contact.email,
          phone: contact.phone,
          lead_id_formatted: contact.lead_id_formatted ?? null,
        });
      }
    }

    const mapped: OrdersInfoRow[] = (data || []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const contact = row.contact_id
        ? contactById.get(String(row.contact_id))
        : null;
      const customerId =
        String(row.customer_reference || '').trim() ||
        String(contact?.lead_id_formatted || '').trim() ||
        null;
      const shipmentStatus = computeShipmentStatus({
        customer_accepted_at: row.customer_accepted_at as string | null,
        shipment_tracking_number: row.shipment_tracking_number as string | null,
        shipment_parcel_photo_url: row.shipment_parcel_photo_url as string | null,
        sent_to_customer_at: row.sent_to_customer_at as string | null,
      });
      return {
        id: String(row.id),
        quotationNumber: String(row.quotation_number || ''),
        customerName: String(row.customer_name || ''),
        customerId,
        customerEmail: contact?.email || null,
        customerPhone: contact?.phone || null,
        inquiryId: row.linked_inquiry_id ? String(row.linked_inquiry_id) : null,
        quotationStatus: String(row.status || ''),
        negotiationStatus: row.negotiation_status
          ? String(row.negotiation_status)
          : null,
        quotationSentAt: row.sent_to_customer_at
          ? String(row.sent_to_customer_at)
          : null,
        acceptedAt: row.customer_accepted_at
          ? String(row.customer_accepted_at)
          : null,
        trackingNumber: row.shipment_tracking_number
          ? String(row.shipment_tracking_number)
          : null,
        parcelPhotoUrl: row.shipment_parcel_photo_url
          ? String(row.shipment_parcel_photo_url)
          : null,
        shipmentStatus,
        orderStatus: row.customer_accepted_at
          ? shipmentStatus === 'accepted_pending'
            ? 'Accepted — Pending Info'
            : 'Accepted'
          : 'Awaiting Acceptance',
        salespersonName: row.salesperson_id
          ? agentNameById.get(String(row.salesperson_id)) || null
          : null,
        salespersonId: row.salesperson_id ? String(row.salesperson_id) : null,
        lastUpdated:
          String(
            row.shipment_info_updated_at ||
              row.customer_accepted_at ||
              row.updated_at ||
              row.sent_to_customer_at ||
              ''
          ) || null,
        totalAmount: Number(row.total_amount || 0),
        organizationId: row.organization_id ? String(row.organization_id) : null,
      };
    });

    const filtered =
      input.shipmentStatus && input.shipmentStatus !== 'all'
        ? mapped.filter((row) => row.shipmentStatus === input.shipmentStatus)
        : mapped;

    // Summary from full sent set (ownership + org scoped), not just current page
    let summaryQuery = supabase
      .from('quotations')
      .select(
        'customer_accepted_at, shipment_tracking_number, shipment_parcel_photo_url, sent_to_customer_at'
      )
      .not('sent_to_customer_at', 'is', null);
    if (organizationId) summaryQuery = summaryQuery.eq('organization_id', organizationId);
    if (ownershipOr) summaryQuery = summaryQuery.or(ownershipOr);

    const { data: summaryRows } = await summaryQuery;
    const summary: OrdersInfoSummary = {
      totalQuotationsSent: 0,
      quotationsAccepted: 0,
      acceptedPending: 0,
      trackingAdded: 0,
      photoUploaded: 0,
      trackingAndPhoto: 0,
      informationComplete: 0,
    };
    for (const raw of summaryRows || []) {
      const status = computeShipmentStatus(raw as {
        customer_accepted_at: string | null;
        shipment_tracking_number: string | null;
        shipment_parcel_photo_url: string | null;
        sent_to_customer_at: string | null;
      });
      summary.totalQuotationsSent += 1;
      if (status !== 'quotation_sent' && status !== 'not_sent') {
        summary.quotationsAccepted += 1;
      }
      if (status === 'accepted_pending') summary.acceptedPending += 1;
      if (status === 'tracking_added') summary.trackingAdded += 1;
      if (status === 'photo_uploaded') summary.photoUploaded += 1;
      if (status === 'tracking_and_photo') {
        summary.trackingAndPhoto += 1;
        summary.informationComplete += 1;
      }
    }

    return {
      rows: filtered,
      total: count || filtered.length,
      page,
      pageSize,
      summary,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to load Orders Info.',
    };
  }
}

export async function updateSalesOrderShipmentInfo(input: {
  quotationId: string;
  trackingNumber?: string | null;
  parcelPhotoUrl?: string | null;
  parcelPhotoPath?: string | null;
}): Promise<{ ok: true } | { error: string }> {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };
    const session = scope.session!;
    const supabase = await createAdminClient();
    const ownershipOr = await buildSalesOwnershipOrFilter(session);

    let fetchQuery = supabase
      .from('quotations')
      .select(
        'id, quotation_number, linked_inquiry_id, customer_name, customer_accepted_at, shipment_tracking_number, shipment_parcel_photo_url, salesperson_id, organization_id, status'
      )
      .eq('id', input.quotationId);

    if (scope.organizationId) {
      fetchQuery = fetchQuery.eq('organization_id', scope.organizationId);
    }

    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();
    if (fetchError) return { error: fetchError.message };
    if (!existing) return { error: 'Quotation not found.' };

    if (ownershipOr) {
      const { data: owned } = await supabase
        .from('quotations')
        .select('id')
        .eq('id', input.quotationId)
        .or(ownershipOr)
        .maybeSingle();
      if (!owned) return { error: 'You do not have access to this quotation.' };
    }

    const tracking = String(input.trackingNumber || '').trim() || null;
    const photoUrl = String(input.parcelPhotoUrl || '').trim() || null;
    const photoPath = String(input.parcelPhotoPath || '').trim() || null;

    if (!tracking && !photoUrl) {
      return { error: 'Provide a tracking number or parcel photo.' };
    }

    const patch: Record<string, unknown> = {
      shipment_info_updated_at: new Date().toISOString(),
      shipment_info_updated_by: session.username,
      shipment_info_updated_by_role: 'sales',
      updated_at: new Date().toISOString(),
    };

    if (tracking) {
      patch.shipment_tracking_number = tracking;
      patch.shipment_tracking_added_at = new Date().toISOString();
    }
    if (photoUrl) {
      patch.shipment_parcel_photo_url = photoUrl;
      patch.shipment_parcel_photo_path = photoPath;
      patch.shipment_parcel_photo_uploaded_at = new Date().toISOString();
    }

    // Ensure acceptance exists so the customer Orders tab shows the row.
    if (!existing.customer_accepted_at) {
      patch.customer_accepted_at = new Date().toISOString();
      patch.negotiation_status = 'accepted';
    }

    const { error: updateError } = await supabase
      .from('quotations')
      .update(patch)
      .eq('id', input.quotationId);

    if (updateError) return { error: updateError.message };

    await supabase.from('quotation_logs').insert({
      quotation_id: input.quotationId,
      action: 'shipment_info_updated',
      previous_status: existing.status,
      new_status: existing.status,
      performed_by: session.username,
      details: {
        actor_role: 'sales',
        tracking_provided: Boolean(tracking),
        photo_provided: Boolean(photoUrl),
        inquiry_id: existing.linked_inquiry_id,
      },
    });

    // Notify customer via lifecycle (recipient_role customer if supported — fall back to sales log message)
    if (existing.linked_inquiry_id) {
      try {
        const { data: inquiry } = await supabase
          .from('lead_inquiries')
          .select('lead_id')
          .eq('id', existing.linked_inquiry_id)
          .maybeSingle();

        if (inquiry?.lead_id) {
          await supabase.from('inquiry_lifecycle_notifications').insert({
            lead_id: inquiry.lead_id,
            inquiry_id: existing.linked_inquiry_id,
            sender_role: 'sales_agent',
            sender_username: session.username,
            recipient_role: 'sales_agent',
            recipient_username: session.username,
            event_type: 'quotation_shipment_info_added_by_sales',
            message: tracking && photoUrl
              ? `Tracking number and parcel photo were added to quotation ${existing.quotation_number}.`
              : tracking
                ? `Tracking number was added to quotation ${existing.quotation_number}.`
                : `Parcel photo was added to quotation ${existing.quotation_number}.`,
          });
        }
      } catch {
        // best-effort
      }
    }

    revalidatePath('/sales/orders-info');
    revalidatePath(`/sales/quotations/${input.quotationId}`);
    return { ok: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Unable to update shipment information.',
    };
  }
}

export async function uploadSalesParcelPhoto(formData: FormData): Promise<
  { ok: true; url: string; path: string } | { error: string }
> {
  try {
    const scope = await resolveSalesOrgScope();
    if ('error' in scope && scope.error) return { error: scope.error };

    const quotationId = String(formData.get('quotationId') || '').trim();
    const file = formData.get('file');
    if (!quotationId) return { error: 'Quotation is required.' };
    if (!(file instanceof File)) return { error: 'Photo file is required.' };

    const supabase = await createAdminClient();
    const path = `sales-parcel-photos/${quotationId}_${Date.now()}_${file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )}`;
    const uploaded = await uploadToInquiryImagesBucket(supabase, path, file);
    if ('error' in uploaded) return { error: uploaded.error };

    return { ok: true, url: uploaded.url, path: `${INQUIRY_IMAGES_BUCKET}/${path}` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Photo upload failed.',
    };
  }
}
