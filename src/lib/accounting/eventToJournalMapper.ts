import { createAdminClient } from '@/utils/supabase/server';
import type { AccountingEvent, JournalPlan } from '@/lib/accounting/events';

type AccountRow = { id: string; code: string; name: string; type: string; is_active: boolean; allow_reconciliation: boolean };
type JournalRow = { id: string; code: string; type: string; is_active: boolean };
type PartnerRow = { id: string; name: string; partner_type: string; status: string };

function toAmount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getActiveAccountByCode(code: string): Promise<AccountRow> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, is_active, allow_reconciliation')
    .eq('code', code)
    .eq('is_active', true)
    .single();
  if (error || !data) throw new Error(error?.message || `Account ${code} not found`);
  return data as AccountRow;
}

async function getActiveJournalByType(type: 'sales' | 'purchase' | 'bank' | 'cash' | 'general'): Promise<JournalRow> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('journals')
    .select('id, code, type, is_active')
    .eq('type', type)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(error?.message || `${type} journal not found`);
  return data as JournalRow;
}

async function getActivePartner(partnerId: string): Promise<PartnerRow> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('partners')
    .select('id, name, partner_type, status')
    .eq('id', partnerId)
    .eq('status', 'active')
    .single();
  if (error || !data) throw new Error(error?.message || 'Partner not found');
  return data as PartnerRow;
}

function ensureCustomer(partner: PartnerRow) {
  if (partner.partner_type !== 'customer' && partner.partner_type !== 'both') {
    throw new Error(`Partner "${partner.name}" must be customer/both`);
  }
}

function ensureVendor(partner: PartnerRow) {
  if (partner.partner_type !== 'vendor' && partner.partner_type !== 'both') {
    throw new Error(`Partner "${partner.name}" must be vendor/both`);
  }
}

export async function eventToJournalMapper(event: AccountingEvent): Promise<JournalPlan | null> {
  const amount = toAmount(event.payload.amount);
  const eventDate = String(event.payload.date || new Date().toISOString().slice(0, 10));
  const shipmentRef = String(event.payload.shipment_id || '');
  const foreignCurrency = event.payload.foreign_currency ? String(event.payload.foreign_currency) : null;
  const foreignAmount = event.payload.foreign_amount != null ? toAmount(event.payload.foreign_amount) : null;
  const exchangeRate = event.payload.exchange_rate != null ? toAmount(event.payload.exchange_rate) : null;
  const taxCode = event.payload.tax_code ? String(event.payload.tax_code) : null;
  const taxAmount = event.payload.tax_amount != null ? toAmount(event.payload.tax_amount) : 0;

  switch (event.event_type) {
    case 'SHIPMENT_CREATED':
    case 'SHIPMENT_COST_ADDED':
      return null;

    case 'CUSTOMER_INVOICE_POSTED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const ar = await getActiveAccountByCode('1300');
      const revenue = await getActiveAccountByCode('4100');
      const journal = await getActiveJournalByType('sales');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'invoice',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: ar.id,
            description: 'Customer invoice posted',
            debit_amount: amount,
            credit_amount: 0,
            partner_reference: `customer:${partner.name}`,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
            foreign_currency: foreignCurrency,
            foreign_amount: foreignAmount,
            exchange_rate: exchangeRate,
            tax_code: taxCode,
            tax_amount: taxAmount,
          },
          {
            account_id: revenue.id,
            description: 'Revenue recognition',
            debit_amount: 0,
            credit_amount: amount,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
            foreign_currency: foreignCurrency,
            foreign_amount: foreignAmount,
            exchange_rate: exchangeRate,
            tax_code: taxCode,
            tax_amount: taxAmount,
          },
        ],
      };
    }

    case 'VENDOR_BILL_POSTED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureVendor(partner);
      const expense = await getActiveAccountByCode(String(event.payload.expense_account_code || '5100'));
      const ap = await getActiveAccountByCode(String(event.payload.payable_account_code || '2100'));
      const journal = await getActiveJournalByType('purchase');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'vendor_bill',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: expense.id,
            description: 'Vendor bill cost recognition',
            debit_amount: amount,
            credit_amount: 0,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
          },
          {
            account_id: ap.id,
            description: 'Vendor payable recognition',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `vendor:${partner.name}`,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'PAYMENT_RECEIVED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const inflowTargetCode = String(event.payload.inflow_account_code || '1000');
      const inflow = await getActiveAccountByCode(inflowTargetCode);
      const ar = await getActiveAccountByCode('1300');
      const journal = await getActiveJournalByType(inflowTargetCode === '1400' ? 'cash' : 'bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'payment',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: inflow.id,
            description: 'Payment received',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: ar.id,
            description: 'Receivable settlement',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'PAYMENT_MADE': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureVendor(partner);
      const ap = await getActiveAccountByCode('2100');
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1000'));
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'payment',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: ap.id,
            description: 'Payable settlement',
            debit_amount: amount,
            credit_amount: 0,
            partner_reference: `vendor:${partner.name}`,
            base_currency_amount: amount,
          },
          {
            account_id: bank.id,
            description: 'Bank payout',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'COD_COLLECTED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const codClearing = await getActiveAccountByCode('1450');
      const ar = await getActiveAccountByCode('1300');
      const journal = await getActiveJournalByType('cash');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'cod',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: codClearing.id,
            description: 'COD collected from consignee',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
            shipment_reference: shipmentRef || null,
          },
          {
            account_id: ar.id,
            description: 'Receivable cleared via COD',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
            shipment_reference: shipmentRef || null,
          },
        ],
      };
    }

    case 'COD_SETTLED_TO_BANK': {
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1000'));
      const codClearing = await getActiveAccountByCode('1450');
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'cod',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: bank.id,
            description: 'COD settled to bank',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: codClearing.id,
            description: 'COD clearing reduction',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'DUTY_PAID': {
      const dutyAccountCode = String(event.payload.duty_account_code || '5200');
      const duty = await getActiveAccountByCode(dutyAccountCode);
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1000'));
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'duty',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: duty.id,
            description: 'Duty paid',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
            shipment_reference: shipmentRef || null,
          },
          {
            account_id: bank.id,
            description: 'Duty paid from bank',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'TRADEFLOW_PURCHASE': {
      const inventory = await getActiveAccountByCode('1500');
      const fundingCode = String(event.payload.funding_account_code || '2100');
      const funding = await getActiveAccountByCode(fundingCode);
      const journal = await getActiveJournalByType(fundingCode === '1000' ? 'bank' : 'purchase');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'tradeflow',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: inventory.id,
            description: 'Tradeflow inventory purchase',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: funding.id,
            description: 'Tradeflow purchase funding',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'TRADEFLOW_DELIVERY': {
      const ar = await getActiveAccountByCode('1300');
      const revenue = await getActiveAccountByCode('4100');
      const cogs = await getActiveAccountByCode('5300');
      const inventory = await getActiveAccountByCode('1500');
      const salesJournal = await getActiveJournalByType('sales');
      const revenueAmount = toAmount(event.payload.revenue_amount || amount);
      const costAmount = toAmount(event.payload.cost_amount || 0);
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: salesJournal.id,
        source_type: 'tradeflow',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: ar.id,
            description: 'Tradeflow delivery receivable',
            debit_amount: revenueAmount,
            credit_amount: 0,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: revenueAmount,
          },
          {
            account_id: revenue.id,
            description: 'Tradeflow delivery revenue',
            debit_amount: 0,
            credit_amount: revenueAmount,
            base_currency_amount: revenueAmount,
          },
          {
            account_id: cogs.id,
            description: 'Tradeflow COGS',
            debit_amount: costAmount,
            credit_amount: 0,
            base_currency_amount: costAmount,
          },
          {
            account_id: inventory.id,
            description: 'Tradeflow inventory release',
            debit_amount: 0,
            credit_amount: costAmount,
            base_currency_amount: costAmount,
          },
        ],
      };
    }

    case 'TRADEFLOW_REPAYMENT': {
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1000'));
      const ar = await getActiveAccountByCode('1300');
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'tradeflow',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: bank.id,
            description: 'Tradeflow repayment received',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: ar.id,
            description: 'Tradeflow receivable settlement',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
        ],
      };
    }
  }
}
