export type ShipmentInfoStatus =
  | 'quotation_sent'
  | 'accepted_pending'
  | 'tracking_added'
  | 'photo_uploaded'
  | 'tracking_and_photo'
  | 'not_sent';

export type OrdersInfoSummary = {
  totalQuotationsSent: number;
  quotationsAccepted: number;
  acceptedPending: number;
  trackingAdded: number;
  photoUploaded: number;
  trackingAndPhoto: number;
  informationComplete: number;
};

export type OrdersInfoRow = {
  id: string;
  quotationNumber: string;
  customerName: string;
  /** Permanent Customer ID (contacts.lead_id_formatted / quotations.customer_reference). */
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  inquiryId: string | null;
  quotationStatus: string;
  negotiationStatus: string | null;
  quotationSentAt: string | null;
  acceptedAt: string | null;
  trackingNumber: string | null;
  parcelPhotoUrl: string | null;
  shipmentStatus: ShipmentInfoStatus;
  orderStatus: string;
  salespersonName: string | null;
  salespersonId: string | null;
  lastUpdated: string | null;
  totalAmount: number;
  organizationId: string | null;
};

export function computeShipmentStatus(row: {
  customer_accepted_at: string | null;
  shipment_tracking_number: string | null;
  shipment_parcel_photo_url: string | null;
  sent_to_customer_at: string | null;
}): ShipmentInfoStatus {
  const tracking = String(row.shipment_tracking_number || '').trim();
  const photo = String(row.shipment_parcel_photo_url || '').trim();
  if (!row.customer_accepted_at) {
    return row.sent_to_customer_at ? 'quotation_sent' : 'not_sent';
  }
  if (tracking && photo) return 'tracking_and_photo';
  if (tracking) return 'tracking_added';
  if (photo) return 'photo_uploaded';
  return 'accepted_pending';
}

export function ordersInfoStatusLabel(status: ShipmentInfoStatus | string): string {
  switch (status) {
    case 'quotation_sent':
      return 'Quotation Sent';
    case 'accepted_pending':
      return 'Accepted — Information Pending';
    case 'tracking_added':
      return 'Tracking Added';
    case 'photo_uploaded':
      return 'Photo Uploaded';
    case 'tracking_and_photo':
      return 'Tracking + Photo Added';
    default:
      return '—';
  }
}
