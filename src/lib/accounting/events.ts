export type AccountingEventType =
  | 'SHIPMENT_CREATED'
  | 'SHIPMENT_COST_ADDED'
  | 'VENDOR_BILL_POSTED'
  | 'CUSTOMER_INVOICE_POSTED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_MADE'
  | 'COD_COLLECTED'
  | 'COD_SETTLED_TO_BANK'
  | 'DUTY_PAID'
  | 'TRADEFLOW_PURCHASE'
  | 'TRADEFLOW_DELIVERY'
  | 'TRADEFLOW_REPAYMENT';

export type AccountingEvent = {
  event_id: string;
  event_type: AccountingEventType;
  reference_id: string;
  idempotency_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  source_module:
    | 'shipment'
    | 'shipment_costing'
    | 'customer_billing'
    | 'vendor_billing'
    | 'payments'
    | 'cod'
    | 'tradeflow'
    | 'tax'
    | 'system';
};

export type JournalLinePlan = {
  account_id: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  partner_reference?: string | null;
  shipment_reference?: string | null;
  base_currency_amount?: number;
  foreign_currency?: string | null;
  foreign_amount?: number | null;
  exchange_rate?: number | null;
  tax_code?: string | null;
  tax_amount?: number;
};

export type JournalPlan = {
  reference: string;
  entryDate: string;
  journalId: string;
  source_type: string;
  source_id: string;
  created_by_module: string;
  event_id: string;
  lines: JournalLinePlan[];
};

export function buildIdempotencyKey(eventType: AccountingEventType, referenceId: string) {
  return `${eventType}:${referenceId}`;
}
