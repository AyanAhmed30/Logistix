import { createAdminClient } from '@/utils/supabase/server';
import type { AccountingEvent, JournalPlan } from '@/lib/accounting/events';
import {
  apply_tax_to_invoice,
  apply_tax_to_vendor_bill,
  calculate_withholding,
} from '@/lib/accounting/taxEngine';

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

function normalizeType(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function asLineArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function groupAmountsByAccount(lines: Array<{ accountCode: string; amount: number }>) {
  const grouped = new Map<string, number>();
  for (const line of lines) {
    grouped.set(line.accountCode, (grouped.get(line.accountCode) || 0) + line.amount);
  }
  return grouped;
}

function mapInvoiceChargeToRevenueCode(chargeType: string) {
  const t = normalizeType(chargeType);
  if (t.includes('freight')) return '4001';
  if (t.includes('clearance') || t.includes('custom')) return '4002';
  if (t.includes('ddp')) return '4003';
  if (t.includes('delivery')) return '4005';
  return '4001';
}

function mapBillCostToExpenseCode(costType: string) {
  const t = normalizeType(costType);
  if (t.includes('freight')) return '5001';
  if (t.includes('duty')) return '5002';
  if (t.includes('warehouse')) return '5005';
  if (t.includes('clearance') || t.includes('custom')) return '5002';
  return '5001';
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
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
      const arCode = String(event.payload.receivable_account_code || '1101');
      const ar = await getActiveAccountByCode(arCode);
      const journal = await getActiveJournalByType('sales');
      const invoiceLines = asLineArray(event.payload.invoice_lines);
      const effectiveInvoiceLines =
        invoiceLines.length > 0
          ? invoiceLines
          : [
              {
                charge_type: String(event.payload.charge_type || 'freight'),
                amount: foreignCurrency ? (foreignAmount ?? amount) : amount,
                tax_ids: asStringArray(event.payload.tax_ids),
                tax_codes: asStringArray(event.payload.tax_codes),
              },
            ];
      const taxedLines = await apply_tax_to_invoice(
        effectiveInvoiceLines.map((line, index) => ({
          lineKey: String(line.line_key || `INV-L${index + 1}`),
          amount: toAmount(line.amount),
          currencyCode: foreignCurrency,
          exchangeRate,
          taxIds: asStringArray(line.tax_ids),
          taxCodes: asStringArray(line.tax_codes),
        }))
      );
      const creditRows = taxedLines.map((calc, index) => ({
        accountCode: mapInvoiceChargeToRevenueCode(
          String(effectiveInvoiceLines[index]?.charge_type || effectiveInvoiceLines[index]?.line_type || 'freight')
        ),
        amount: calc.netBaseAmount,
      }));
      const groupedCredits = groupAmountsByAccount(creditRows.filter((r) => r.amount > 0));
      const groupedOutputTax = new Map<string, number>();
      let totalCredit = 0;
      for (const calc of taxedLines) {
        totalCredit += calc.grossBaseAmount;
        for (const taxLine of calc.taxes) {
          groupedOutputTax.set(
            taxLine.tax.account_id,
            (groupedOutputTax.get(taxLine.tax.account_id) || 0) + taxLine.taxAmount
          );
        }
      }
      totalCredit = Math.round(totalCredit * 100) / 100;
      if (totalCredit <= 0) throw new Error('Invoice must contain positive line amounts');
      const revenueAccounts = await Promise.all(
        Array.from(groupedCredits.keys()).map(async (code) => ({
          code,
          account: await getActiveAccountByCode(code),
        }))
      );
      const totalForeignGross = taxedLines.reduce((sum, line) => sum + (line.grossForeignAmount || 0), 0);
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
            debit_amount: totalCredit,
            credit_amount: 0,
            partner_reference: `customer:${partner.name}`,
            shipment_reference: shipmentRef || null,
            base_currency_amount: totalCredit,
            foreign_currency: foreignCurrency,
            foreign_amount: foreignCurrency ? totalForeignGross : null,
            exchange_rate: exchangeRate,
            tax_code: taxCode,
            tax_amount: taxAmount,
          },
          ...revenueAccounts.map(({ code, account }) => ({
            account_id: account.id,
            description: `Revenue recognition (${code})`,
            debit_amount: 0,
            credit_amount: groupedCredits.get(code) || 0,
            shipment_reference: shipmentRef || null,
            base_currency_amount: groupedCredits.get(code) || 0,
            foreign_currency: foreignCurrency,
            foreign_amount: null,
            exchange_rate: exchangeRate,
            tax_code: taxCode,
            tax_amount: 0,
          })),
          ...Array.from(groupedOutputTax.entries()).map(([accountId, amount]) => ({
            account_id: accountId,
            description: 'Output tax',
            debit_amount: 0,
            credit_amount: amount,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
            foreign_currency: null,
            foreign_amount: null,
            exchange_rate: null,
            tax_code: null,
            tax_amount: amount,
          })),
        ],
      };
    }

    case 'VENDOR_BILL_POSTED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureVendor(partner);
      const ap = await getActiveAccountByCode(String(event.payload.payable_account_code || '2001'));
      const journal = await getActiveJournalByType('purchase');
      const billLines = asLineArray(event.payload.bill_lines);
      const effectiveBillLines =
        billLines.length > 0
          ? billLines
          : [
              {
                cost_type: String(event.payload.cost_type || 'freight'),
                amount: foreignCurrency ? (foreignAmount ?? amount) : amount,
                tax_ids: asStringArray(event.payload.tax_ids),
                tax_codes: asStringArray(event.payload.tax_codes),
              },
            ];
      const taxedLines = await apply_tax_to_vendor_bill(
        effectiveBillLines.map((line, index) => ({
          lineKey: String(line.line_key || `BILL-L${index + 1}`),
          amount: toAmount(line.amount),
          currencyCode: foreignCurrency,
          exchangeRate,
          taxIds: asStringArray(line.tax_ids),
          taxCodes: asStringArray(line.tax_codes),
        }))
      );
      const debitRows = taxedLines.map((calc, index) => ({
        accountCode: mapBillCostToExpenseCode(
          String(effectiveBillLines[index]?.cost_type || effectiveBillLines[index]?.line_type || 'freight')
        ),
        amount: calc.netBaseAmount,
      }));
      const groupedDebits = groupAmountsByAccount(debitRows.filter((r) => r.amount > 0));
      const groupedInputTax = new Map<string, number>();
      let totalDebit = 0;
      for (const calc of taxedLines) {
        totalDebit += calc.grossBaseAmount;
        for (const taxLine of calc.taxes) {
          groupedInputTax.set(
            taxLine.tax.account_id,
            (groupedInputTax.get(taxLine.tax.account_id) || 0) + taxLine.taxAmount
          );
        }
      }
      totalDebit = Math.round(totalDebit * 100) / 100;
      if (totalDebit <= 0) throw new Error('Vendor bill must contain positive line amounts');
      const expenseAccounts = await Promise.all(
        Array.from(groupedDebits.keys()).map(async (code) => ({
          code,
          account: await getActiveAccountByCode(code),
        }))
      );
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'vendor_bill',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          ...expenseAccounts.map(({ code, account }) => ({
            account_id: account.id,
            description: `Vendor bill cost recognition (${code})`,
            debit_amount: groupedDebits.get(code) || 0,
            credit_amount: 0,
            shipment_reference: shipmentRef || null,
            base_currency_amount: groupedDebits.get(code) || 0,
          })),
          ...Array.from(groupedInputTax.entries()).map(([accountId, amount]) => ({
            account_id: accountId,
            description: 'Input tax',
            debit_amount: amount,
            credit_amount: 0,
            shipment_reference: shipmentRef || null,
            base_currency_amount: amount,
          })),
          {
            account_id: ap.id,
            description: 'Vendor payable recognition',
            debit_amount: 0,
            credit_amount: totalDebit,
            partner_reference: `vendor:${partner.name}`,
            shipment_reference: shipmentRef || null,
            base_currency_amount: totalDebit,
          },
        ],
      };
    }

    case 'PAYMENT_RECEIVED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const paymentMode = normalizeType(event.payload.payment_mode);
      const inflowTargetCode =
        String(event.payload.inflow_account_code || (paymentMode === 'cod' ? '1004' : '1003'));
      const inflow = await getActiveAccountByCode(inflowTargetCode);
      const ar = await getActiveAccountByCode(String(event.payload.receivable_account_code || '1101'));
      const journal = await getActiveJournalByType(paymentMode === 'cod' ? 'cash' : 'bank');
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
            description: paymentMode === 'cod' ? 'COD collected from customer' : 'Payment received (undeposited)',
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
      const ap = await getActiveAccountByCode(String(event.payload.payable_account_code || '2001'));
      const liquidityCode = String(event.payload.liquidity_account_code || event.payload.bank_account_code || '1002');
      const liquidity = await getActiveAccountByCode(liquidityCode);
      const journal = await getActiveJournalByType(liquidityCode === '1001' ? 'cash' : 'bank');
      const wht = await calculate_withholding({
        amount: foreignCurrency ? (foreignAmount ?? 0) : amount,
        currencyCode: foreignCurrency,
        exchangeRate,
        withholdingTaxId: String(event.payload.withholding_tax_id || ''),
        withholdingTaxCode: String(event.payload.withholding_tax_code || ''),
      });
      const payableAmount = wht ? wht.payableBase : amount;
      const withheldAmount = wht ? wht.withheldBase : 0;
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
            account_id: liquidity.id,
            description: 'Vendor payout',
            debit_amount: 0,
            credit_amount: payableAmount,
            base_currency_amount: payableAmount,
          },
          ...(wht
            ? [
                {
                  account_id: wht.tax.account_id,
                  description: `Withholding tax payable (${wht.tax.code})`,
                  debit_amount: 0,
                  credit_amount: withheldAmount,
                  base_currency_amount: withheldAmount,
                },
              ]
            : []),
        ],
      };
    }

    case 'COD_COLLECTED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const codClearing = await getActiveAccountByCode('1004');
      const ar = await getActiveAccountByCode(String(event.payload.receivable_account_code || '1101'));
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
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1002'));
      const codClearing = await getActiveAccountByCode('1004');
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

    case 'BANK_SETTLEMENT_POSTED': {
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1002'));
      const sourceCode = String(
        event.payload.settlement_source_account_code ||
          (normalizeType(event.payload.settlement_source) === 'cod' ? '1004' : '1003')
      );
      const source = await getActiveAccountByCode(sourceCode);
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'bank_settlement',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: bank.id,
            description: 'Funds settled to bank',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: source.id,
            description: 'Holding account settlement',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'CUSTOMER_ADVANCE_RECEIVED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1002'));
      const advance = await getActiveAccountByCode(String(event.payload.advance_account_code || '2004'));
      const journal = await getActiveJournalByType('bank');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'advance',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: bank.id,
            description: 'Customer advance received',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: advance.id,
            description: 'Customer advance liability',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'CUSTOMER_ADVANCE_APPLIED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const advance = await getActiveAccountByCode(String(event.payload.advance_account_code || '2004'));
      const ar = await getActiveAccountByCode(String(event.payload.receivable_account_code || '1101'));
      const journal = await getActiveJournalByType('general');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'advance_application',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: advance.id,
            description: 'Customer advance applied',
            debit_amount: amount,
            credit_amount: 0,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
          {
            account_id: ar.id,
            description: 'Receivable reduced by advance',
            debit_amount: 0,
            credit_amount: amount,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'DUTY_PAID': {
      const ddpMode = normalizeType(event.payload.ddp_mode);
      const dutyAccountCode =
        String(
          event.payload.duty_account_code || (ddpMode === 'recoverable' ? '1206' : '5002')
        );
      const duty = await getActiveAccountByCode(dutyAccountCode);
      const fundingMode = normalizeType(event.payload.funding_mode || 'bank');
      const fundingCode =
        String(
          event.payload.funding_account_code ||
            (fundingMode === 'payable' ? String(event.payload.payable_account_code || '2001') : '1002')
        );
      const funding = await getActiveAccountByCode(fundingCode);
      const journal = await getActiveJournalByType(fundingMode === 'payable' ? 'purchase' : 'bank');
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
            account_id: funding.id,
            description: 'Duty funding',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'DDP_DUTY_RECOVERABLE_INVOICED': {
      const partnerId = String(event.payload.partner_id || '');
      const partner = await getActivePartner(partnerId);
      ensureCustomer(partner);
      const ar = await getActiveAccountByCode(String(event.payload.receivable_account_code || '1101'));
      const recoverable = await getActiveAccountByCode(String(event.payload.recoverable_duty_account_code || '1206'));
      const journal = await getActiveJournalByType('sales');
      return {
        reference: `EV-${event.event_type}-${event.reference_id}`,
        entryDate: eventDate,
        journalId: journal.id,
        source_type: 'ddp_duty_invoice',
        source_id: event.reference_id,
        created_by_module: event.source_module,
        event_id: event.event_id,
        lines: [
          {
            account_id: ar.id,
            description: 'Customer billed for recoverable duty',
            debit_amount: amount,
            credit_amount: 0,
            partner_reference: `customer:${partner.name}`,
            base_currency_amount: amount,
          },
          {
            account_id: recoverable.id,
            description: 'Recoverable duty cleared',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'TRADEFLOW_PURCHASE': {
      const inventory = await getActiveAccountByCode(String(event.payload.inventory_account_code || '1201'));
      const fundingCode = String(event.payload.funding_account_code || '2001');
      const funding = await getActiveAccountByCode(fundingCode);
      const journal = await getActiveJournalByType(fundingCode === '1002' || fundingCode === '1001' ? 'bank' : 'purchase');
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

    case 'TRADEFLOW_MOVE_TO_TRANSIT': {
      const transit = await getActiveAccountByCode(String(event.payload.transit_account_code || '1202'));
      const inventory = await getActiveAccountByCode(String(event.payload.inventory_account_code || '1201'));
      const journal = await getActiveJournalByType('general');
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
            account_id: transit.id,
            description: 'Inventory moved to transit',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: inventory.id,
            description: 'Inventory released to transit',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'TRADEFLOW_DELIVERY': {
      const ar = await getActiveAccountByCode(String(event.payload.trade_receivable_account_code || '1102'));
      const revenue = await getActiveAccountByCode(String(event.payload.trade_revenue_account_code || '4007'));
      const salesJournal = await getActiveJournalByType('sales');
      const revenueAmount = toAmount(event.payload.revenue_amount || amount || event.payload.amount);
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
        ],
      };
    }

    case 'TRADEFLOW_COGS_RECOGNIZED': {
      const cogs = await getActiveAccountByCode(String(event.payload.tradeflow_cogs_account_code || '5007'));
      const transit = await getActiveAccountByCode(String(event.payload.transit_account_code || '1202'));
      const journal = await getActiveJournalByType('general');
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
            account_id: cogs.id,
            description: 'Tradeflow COGS recognized',
            debit_amount: amount,
            credit_amount: 0,
            base_currency_amount: amount,
          },
          {
            account_id: transit.id,
            description: 'Goods in transit relieved',
            debit_amount: 0,
            credit_amount: amount,
            base_currency_amount: amount,
          },
        ],
      };
    }

    case 'TRADEFLOW_REPAYMENT': {
      const bank = await getActiveAccountByCode(String(event.payload.bank_account_code || '1002'));
      const ar = await getActiveAccountByCode(String(event.payload.trade_receivable_account_code || '1102'));
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
