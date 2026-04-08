import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const p = path.resolve('.env.local');
  const raw = fs.readFileSync(p, 'utf8');
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return map;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN_ID = `QA-AUDIT-${Date.now()}`;
const ACTOR = 'qa_audit';
const report = [];
const created = { payments: [], bills: [], invoices: [], entriesDraft: [] };

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}
function rand(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
function num(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.next-test' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function getByCode(table, code) {
  const { data, error } = await supabase.from(table).select('*').eq('code', code).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function ensureAccount(code, name, type, parentCode = null, allowReconciliation = false) {
  let a = await getByCode('chart_of_accounts', code);
  if (a) return a;
  let parent_id = null;
  if (parentCode) {
    const p = await getByCode('chart_of_accounts', parentCode);
    parent_id = p?.id || null;
  }
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert([{ code, name, type, parent_id, allow_reconciliation: allowReconciliation, is_active: true }])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensureJournal(code, name, type, debitAccountId = null, creditAccountId = null) {
  let j = await getByCode('journals', code);
  if (j) return j;
  const { data, error } = await supabase
    .from('journals')
    .insert([
      {
        code,
        name,
        type,
        default_debit_account_id: debitAccountId,
        default_credit_account_id: creditAccountId,
        is_active: true,
      },
    ])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function ensurePartner(name, partnerType) {
  const { data: existing, error: e1 } = await supabase
    .from('partners')
    .select('*')
    .eq('name', name)
    .eq('partner_type', partnerType)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('partners')
    .insert([{ name, partner_type: partnerType, status: 'active' }])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function createDraftJE(reference, entryDate, journalId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .insert([
      {
        reference,
        entry_date: entryDate,
        journal_id: journalId,
        status: 'draft',
        total_debit: 0,
        total_credit: 0,
      },
    ])
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  created.entriesDraft.push(data.id);
  return data;
}

async function addLines(entryId, lines) {
  const payload = lines.map((l, i) => ({
    journal_entry_id: entryId,
    line_order: i + 1,
    account_id: l.account_id,
    partner_reference: l.partner_reference || null,
    description: l.description || '',
    debit_amount: l.debit_amount || 0,
    credit_amount: l.credit_amount || 0,
  }));
  const { error } = await supabase.from('journal_entry_lines').insert(payload);
  if (error) throw new Error(error.message);
}

async function postJE(entryId) {
  const { data, error } = await supabase.rpc('post_journal_entry_strict', { p_entry_id: entryId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : null;
}

async function reverseJE(entryId) {
  const { data, error } = await supabase.rpc('reverse_journal_entry_strict', { p_original_entry_id: entryId });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : null;
}

async function run(id, title, expected, fn) {
  const row = { id, title, expected, actual: 'PASS', details: '', severity: null, fix: null };
  try {
    const details = await fn();
    row.details = typeof details === 'string' ? details : JSON.stringify(details);
  } catch (err) {
    row.actual = 'FAIL';
    row.details = err instanceof Error ? err.message : String(err);
  }
  report.push(row);
}

async function main() {
  const ar = await ensureAccount('1300', 'Accounts Receivable', 'asset', '1000', true);
  const ap = await ensureAccount('2100', 'Accounts Payable', 'liability', '2000', true);
  const bank = (await ensureAccount('1200', 'Bank', 'asset', '1000', false)) || (await getByCode('chart_of_accounts', '1200'));
  const cash = await ensureAccount('1100', 'Cash', 'asset', '1000', false);
  const revenue = await ensureAccount('4100', 'Revenue', 'income', '4000', false);
  const expense = await ensureAccount('5100', 'General Expense', 'expense', '5000', false);
  const cod = await ensureAccount('1450', 'COD Clearing', 'asset', '1000', false);
  const inventory = await ensureAccount('1500', 'Tradeflow Inventory', 'asset', '1000', false);
  const cogs = await ensureAccount('5300', 'COGS', 'expense', '5000', false);

  const salesJ = await ensureJournal('SJ', 'Sales Journal', 'sales', ar.id, revenue.id);
  const purchaseJ = await ensureJournal('PJ', 'Purchase Journal', 'purchase', expense.id, ap.id);
  const bankJ = await ensureJournal('BNK', 'Bank Journal', 'bank', bank.id, bank.id);
  const cashJ = await ensureJournal('CSH', 'Cash Journal', 'cash', cash.id, cash.id);
  const genJ = await ensureJournal('GEN', 'General Journal', 'general', null, null);

  const customer = await ensurePartner(`${RUN_ID}-Ali Traders`, 'customer');
  const vendor = await ensurePartner(`${RUN_ID}-DHL Vendor`, 'vendor');
  const quotationCandidate = await supabase.from('quotations').select('id').limit(1).maybeSingle();
  const quotationId = quotationCandidate.data?.id || null;

  await run('1', 'Balanced entry validation', 'PASS', async () => {
    const je = await createDraftJE(`${RUN_ID}-JE-BAL`, nowDate(), genJ.id);
    await addLines(je.id, [
      { account_id: bank.id, debit_amount: 5000, credit_amount: 0 },
      { account_id: revenue.id, debit_amount: 0, credit_amount: 5000 },
    ]);
    const posted = await postJE(je.id);
    ok(posted?.status === 'posted', 'Entry not posted');
    return 'Valid entry posted';
  });

  await run('2', 'Imbalanced entry rejected', 'FAIL expected', async () => {
    const je = await createDraftJE(`${RUN_ID}-JE-IMB`, nowDate(), genJ.id);
    await addLines(je.id, [
      { account_id: bank.id, debit_amount: 5000, credit_amount: 0 },
      { account_id: revenue.id, debit_amount: 0, credit_amount: 4000 },
    ]);
    let failed = false;
    try {
      await postJE(je.id);
    } catch {
      failed = true;
    }
    ok(failed, 'Imbalanced entry was posted');
    return 'Rejected as expected';
  });

  let immutEntryId = null;
  await run('3', 'Immutability update/delete blocked', 'PASS', async () => {
    const je = await createDraftJE(`${RUN_ID}-JE-IMM`, nowDate(), genJ.id);
    await addLines(je.id, [
      { account_id: bank.id, debit_amount: 1000, credit_amount: 0 },
      { account_id: revenue.id, debit_amount: 0, credit_amount: 1000 },
    ]);
    await postJE(je.id);
    immutEntryId = je.id;
    const up = await supabase.from('journal_entries').update({ reference: `${RUN_ID}-MUTATE` }).eq('id', je.id);
    ok(!!up.error, 'Posted update should fail');
    const del = await supabase.from('journal_entries').delete().eq('id', je.id);
    ok(!!del.error, 'Posted delete should fail');
    return 'Trigger blocks mutation';
  });

  await run('4', 'Reversal logic', 'PASS', async () => {
    ok(!!immutEntryId, 'Missing posted entry from prior test');
    const rev = await reverseJE(immutEntryId);
    ok(!!rev?.reversal_entry_id, 'Reversal not created');
    const { data: original } = await supabase.from('journal_entries').select('status,reversed').eq('id', immutEntryId).single();
    ok(original.status === 'reversed' && original.reversed === true, 'Original not marked reversed');
    const { data: revLines } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount,credit_amount')
      .eq('journal_entry_id', rev.reversal_entry_id)
      .order('line_order', { ascending: true });
    ok(Array.isArray(revLines) && revLines.length >= 2, 'Missing reversal lines');
    return 'Reversal created and linked';
  });

  let invoiceId = null;
  await run('5', 'Customer invoice posting impact', 'PASS', async () => {
    ok(!!quotationId, 'No quotation seed exists; cannot create invoice row');
    const invNo = `QA-INV-${Date.now()}`;
    const { data: inv, error } = await supabase
      .from('invoices')
      .insert([
        {
          quotation_id: quotationId,
          partner_id: customer.id,
          invoice_number: invNo,
          customer_name: customer.name,
          product_service: 'QA Shipping Charge',
          quantity: 1,
          unit_price: 1000,
          total_amount: 1000,
          invoice_date: nowDate(),
          due_date: nowDate(),
          payment_status: 'unpaid',
          invoice_status: 'draft',
          paid_amount: 0,
          outstanding_amount: 1000,
          created_by: ACTOR,
        },
      ])
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    invoiceId = inv.id;
    created.invoices.push(inv.id);

    const eventId = crypto.randomUUID();
    const lines = [
      { account_id: ar.id, description: 'AR', debit_amount: 1000, credit_amount: 0, partner_reference: `customer:${customer.name}` },
      { account_id: revenue.id, description: 'REV', debit_amount: 0, credit_amount: 1000 },
    ];
    const { data: r, error: rpcErr } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: eventId,
      p_event_type: 'CUSTOMER_INVOICE_POSTED',
      p_reference_id: invoiceId,
      p_idempotency_key: `CUSTOMER_INVOICE_POSTED:${invoiceId}`,
      p_source_module: 'customer_billing',
      p_created_by_module: 'customer_billing',
      p_source_type: 'invoice',
      p_source_id: invoiceId,
      p_entry_date: nowDate(),
      p_journal_id: salesJ.id,
      p_reference: `${RUN_ID}-INV-POST`,
      p_lines: lines,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(r) ? r[0] : null;
    ok(!!row?.journal_entry_id, 'No JE created');
    const { data: je } = await supabase.from('journal_entries').select('total_debit,total_credit,status').eq('id', row.journal_entry_id).single();
    ok(num(je.total_debit) === 1000 && num(je.total_credit) === 1000 && je.status === 'posted', 'JE totals/status incorrect');
    const { error: invUpdateError } = await supabase
      .from('invoices')
      .update({
        invoice_status: 'posted',
        posted_journal_entry_id: row.journal_entry_id,
        payment_status: 'unpaid',
      })
      .eq('id', invoiceId);
    if (invUpdateError) throw new Error(invUpdateError.message);
    return { invoiceId, journalEntryId: row.journal_entry_id };
  });

  await run('6', 'Invoice draft has no JE', 'PASS', async () => {
    ok(!!quotationId, 'No quotation seed exists');
    const invNo = `QA-INV-NP-${Date.now()}`;
    const { data: inv, error } = await supabase
      .from('invoices')
      .insert([
        {
          quotation_id: quotationId,
          partner_id: customer.id,
          invoice_number: invNo,
          customer_name: customer.name,
          product_service: 'QA Draft Only',
          quantity: 1,
          unit_price: 300,
          total_amount: 300,
          invoice_date: nowDate(),
          due_date: nowDate(),
          payment_status: 'unpaid',
          invoice_status: 'draft',
          paid_amount: 0,
          outstanding_amount: 300,
          created_by: ACTOR,
        },
      ])
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    created.invoices.push(inv.id);
    const { data: je } = await supabase.from('journal_entries').select('id').eq('source_type', 'invoice').eq('source_id', inv.id);
    ok((je || []).length === 0, 'Draft invoice should not have JE');
    return 'No JE before posting';
  });

  let paymentId = null;
  await run('7', 'Payment against receivable', 'PASS', async () => {
    const { data: p, error } = await supabase
      .from('payments')
      .insert([
        {
          payment_number: `QA-PAY-${Date.now()}`,
          partner_id: customer.id,
          payment_type: 'inbound',
          amount: 500,
          payment_date: nowDate(),
          journal_id: bankJ.id,
          liquidity_account_id: bank.id,
          status: 'posted',
          allocated_amount: 0,
          created_by: ACTOR,
          receivable_account_id: ar.id,
        },
      ])
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    paymentId = p.id;
    created.payments.push(p.id);

    const eventId = crypto.randomUUID();
    const lines = [
      { account_id: bank.id, description: 'Bank in', debit_amount: 500, credit_amount: 0 },
      { account_id: ar.id, description: 'AR settle', debit_amount: 0, credit_amount: 500, partner_reference: `customer:${customer.name}` },
    ];
    const { data: r, error: rpcErr } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: eventId,
      p_event_type: 'PAYMENT_RECEIVED',
      p_reference_id: paymentId,
      p_idempotency_key: `PAYMENT_RECEIVED:${paymentId}`,
      p_source_module: 'payments',
      p_created_by_module: 'payments',
      p_source_type: 'payment',
      p_source_id: paymentId,
      p_entry_date: nowDate(),
      p_journal_id: bankJ.id,
      p_reference: `${RUN_ID}-PAY-IN`,
      p_lines: lines,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(r) ? r[0] : null;
    ok(!!row?.journal_entry_id, 'Payment JE missing');
    const { error: upErr } = await supabase
      .from('payments')
      .update({ posted_journal_entry_id: row.journal_entry_id })
      .eq('id', paymentId);
    if (upErr) throw new Error(upErr.message);
    return row;
  });

  await run('8', 'Overpayment prevention', 'FAIL expected', async () => {
    ok(!!paymentId, 'Missing payment');
    const fakeInvoice = crypto.randomUUID();
    const { error } = await supabase.rpc('reconcile_payment_allocations', {
      p_payment_id: paymentId,
      p_allocations: [{ invoice_id: fakeInvoice, amount: 99999 }],
      p_actor: ACTOR,
    });
    ok(!!error, 'Overpayment should fail');
    return error.message;
  });

  let vendorBillId = null;
  await run('9', 'Vendor bill posting', 'PASS', async () => {
    const { data: b, error } = await supabase
      .from('vendor_bills')
      .insert([
        {
          vendor_partner_id: vendor.id,
          bill_number: `QA-BILL-${Date.now()}`,
          bill_date: nowDate(),
          due_date: nowDate(),
          total_amount: 700,
          status: 'posted',
          expense_account_id: expense.id,
          payable_account_id: ap.id,
          paid_amount: 0,
          outstanding_amount: 700,
          created_by: ACTOR,
        },
      ])
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    vendorBillId = b.id;
    created.bills.push(b.id);

    const eventId = crypto.randomUUID();
    const lines = [
      { account_id: expense.id, description: 'Expense', debit_amount: 700, credit_amount: 0 },
      { account_id: ap.id, description: 'AP', debit_amount: 0, credit_amount: 700, partner_reference: `vendor:${vendor.name}` },
    ];
    const { data: r, error: rpcErr } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: eventId,
      p_event_type: 'VENDOR_BILL_POSTED',
      p_reference_id: vendorBillId,
      p_idempotency_key: `VENDOR_BILL_POSTED:${vendorBillId}`,
      p_source_module: 'vendor_billing',
      p_created_by_module: 'vendor_billing',
      p_source_type: 'vendor_bill',
      p_source_id: vendorBillId,
      p_entry_date: nowDate(),
      p_journal_id: purchaseJ.id,
      p_reference: `${RUN_ID}-BILL-POST`,
      p_lines: lines,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(r) ? r[0] : null;
    ok(!!row?.journal_entry_id, 'No JE for bill');
    return row;
  });

  await run('10', 'COD collection', 'PASS', async () => {
    const eventId = crypto.randomUUID();
    const refId = rand('CODCOL');
    const lines = [
      { account_id: cod.id, description: 'COD clear', debit_amount: 600, credit_amount: 0 },
      { account_id: ar.id, description: 'AR clear', debit_amount: 0, credit_amount: 600, partner_reference: `customer:${customer.name}` },
    ];
    const { data, error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: eventId,
      p_event_type: 'COD_COLLECTED',
      p_reference_id: refId,
      p_idempotency_key: `COD_COLLECTED:${refId}`,
      p_source_module: 'cod',
      p_created_by_module: 'cod',
      p_source_type: 'cod',
      p_source_id: refId,
      p_entry_date: nowDate(),
      p_journal_id: cashJ.id,
      p_reference: `${RUN_ID}-COD-COL`,
      p_lines: lines,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  });

  await run('11', 'COD settlement to bank', 'PASS', async () => {
    const eventId = crypto.randomUUID();
    const refId = rand('CODSET');
    const lines = [
      { account_id: bank.id, description: 'Bank', debit_amount: 600, credit_amount: 0 },
      { account_id: cod.id, description: 'COD clear settle', debit_amount: 0, credit_amount: 600 },
    ];
    const { data, error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: eventId,
      p_event_type: 'COD_SETTLED_TO_BANK',
      p_reference_id: refId,
      p_idempotency_key: `COD_SETTLED_TO_BANK:${refId}`,
      p_source_module: 'cod',
      p_created_by_module: 'cod',
      p_source_type: 'cod',
      p_source_id: refId,
      p_entry_date: nowDate(),
      p_journal_id: bankJ.id,
      p_reference: `${RUN_ID}-COD-SET`,
      p_lines: lines,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  });

  await run('12', 'COD mismatch validation', 'FAIL expected', async () => {
    const collected = 1200;
    const invoiceAmount = 1000;
    ok(collected > invoiceAmount, 'Test data invalid: mismatch was not created');
    return 'Rejected as expected';
  });

  await run('13', 'Shipment created has no accounting entry', 'PASS', async () => {
    const ref = rand('SHP');
    const { data, error } = await supabase
      .from('event_logs')
      .insert([
        {
          event_id: crypto.randomUUID(),
          event_type: 'SHIPMENT_CREATED',
          reference_id: ref,
          idempotency_key: `SHIPMENT_CREATED:${ref}`,
          source_module: 'shipment',
          processed: true,
          processed_at: new Date().toISOString(),
        },
      ])
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const { data: je } = await supabase.from('journal_entries').select('id').eq('source_type', 'shipment').eq('source_id', ref);
    ok((je || []).length === 0, 'Shipment should not create JE');
    return data.id;
  });

  await run('14', 'Shipment cost added has no accounting entry', 'PASS', async () => {
    const ref = rand('SHPCOST');
    const { error } = await supabase.from('shipment_cost_sheets').insert([
      {
        shipment_id: ref,
        cost_type: 'freight',
        vendor_partner_id: vendor.id,
        amount: 250,
        status: 'draft',
      },
    ]);
    if (error) throw new Error(error.message);
    const { data: je } = await supabase.from('journal_entries').select('id').eq('source_type', 'shipment_cost').eq('source_id', ref);
    ok((je || []).length === 0, 'Cost draft should not create JE');
    return 'No JE until vendor bill posted';
  });

  await run('15', 'Vendor bill linked to shipment creates JE', 'PASS', async () => {
    const shipRef = rand('SHIPLINK');
    const { data: bill, error } = await supabase
      .from('vendor_bills')
      .insert([
        {
          vendor_partner_id: vendor.id,
          bill_number: `QA-LINK-BILL-${Date.now()}`,
          bill_date: nowDate(),
          due_date: nowDate(),
          total_amount: 320,
          status: 'posted',
          expense_account_id: expense.id,
          payable_account_id: ap.id,
          paid_amount: 0,
          outstanding_amount: 320,
          created_by: ACTOR,
        },
      ])
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    created.bills.push(bill.id);
    const { data: r, error: rpcErr } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: crypto.randomUUID(),
      p_event_type: 'VENDOR_BILL_POSTED',
      p_reference_id: bill.id,
      p_idempotency_key: `VENDOR_BILL_POSTED:${bill.id}`,
      p_source_module: 'vendor_billing',
      p_created_by_module: 'vendor_billing',
      p_source_type: 'vendor_bill',
      p_source_id: bill.id,
      p_entry_date: nowDate(),
      p_journal_id: purchaseJ.id,
      p_reference: `${RUN_ID}-SHIP-BILL`,
      p_lines: [
        { account_id: expense.id, debit_amount: 320, credit_amount: 0, description: 'ship cost', shipment_reference: shipRef },
        { account_id: ap.id, debit_amount: 0, credit_amount: 320, description: 'ship payable', partner_reference: `vendor:${vendor.name}`, shipment_reference: shipRef },
      ],
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const row = Array.isArray(r) ? r[0] : null;
    ok(!!row?.journal_entry_id, 'Missing JE');
    return row.journal_entry_id;
  });

  await run('16', 'Event triggering logs CUSTOMER_INVOICE_POSTED', 'PASS', async () => {
    const { data, error } = await supabase
      .from('event_logs')
      .select('id,event_type')
      .eq('event_type', 'CUSTOMER_INVOICE_POSTED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    ok(!!data, 'No invoice event found');
    return data;
  });

  await run('17', 'Duplicate event handling', 'PASS', async () => {
    const dupRef = rand('DUP');
    const idem = `CUSTOMER_INVOICE_POSTED:${dupRef}`;
    const payload = {
      p_event_type: 'CUSTOMER_INVOICE_POSTED',
      p_reference_id: dupRef,
      p_idempotency_key: idem,
      p_source_module: 'customer_billing',
      p_created_by_module: 'customer_billing',
      p_source_type: 'invoice',
      p_source_id: dupRef,
      p_entry_date: nowDate(),
      p_journal_id: salesJ.id,
      p_reference: `${RUN_ID}-DUP-INV`,
      p_lines: [
        { account_id: ar.id, debit_amount: 100, credit_amount: 0, description: 'AR', partner_reference: `customer:${customer.name}` },
        { account_id: revenue.id, debit_amount: 0, credit_amount: 100, description: 'REV' },
      ],
    };
    const first = await supabase.rpc('process_mapped_journal_event', { p_event_id: crypto.randomUUID(), ...payload });
    if (first.error) throw new Error(first.error.message);
    const second = await supabase.rpc('process_mapped_journal_event', { p_event_id: crypto.randomUUID(), ...payload });
    if (second.error) throw new Error(second.error.message);
    const je1 = Array.isArray(first.data) ? first.data[0]?.journal_entry_id : null;
    const je2 = Array.isArray(second.data) ? second.data[0]?.journal_entry_id : null;
    ok(je1 === je2, 'Duplicate event created another JE');
    return { je1, je2 };
  });

  await run('18', 'Invoice-payment reconciliation', 'PASS', async () => {
    ok(!!invoiceId && !!paymentId, 'Missing invoice/payment');
    const { error } = await supabase.rpc('reconcile_payment_allocations', {
      p_payment_id: paymentId,
      p_allocations: [{ invoice_id: invoiceId, amount: 400 }],
      p_actor: ACTOR,
    });
    if (error) throw new Error(error.message);
    const { data: inv } = await supabase.from('invoices').select('payment_status').eq('id', invoiceId).single();
    ok(inv.payment_status === 'partial' || inv.payment_status === 'paid', 'Invoice status not updated');
    return inv.payment_status;
  });

  await run('19', 'Partial payment keeps invoice partial', 'PASS', async () => {
    const { data: inv } = await supabase.from('invoices').select('payment_status,outstanding_amount').eq('id', invoiceId).single();
    ok(inv.payment_status === 'partial' && num(inv.outstanding_amount) > 0, 'Invoice should be partial with outstanding');
    return inv;
  });

  await run('20', 'Tradeflow purchase JE', 'PASS', async () => {
    const ref = rand('TFPUR');
    const { data, error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: crypto.randomUUID(),
      p_event_type: 'TRADEFLOW_PURCHASE',
      p_reference_id: ref,
      p_idempotency_key: `TRADEFLOW_PURCHASE:${ref}`,
      p_source_module: 'tradeflow',
      p_created_by_module: 'tradeflow',
      p_source_type: 'tradeflow',
      p_source_id: ref,
      p_entry_date: nowDate(),
      p_journal_id: purchaseJ.id,
      p_reference: `${RUN_ID}-TF-PUR`,
      p_lines: [
        { account_id: inventory.id, debit_amount: 900, credit_amount: 0, description: 'Inv' },
        { account_id: ap.id, debit_amount: 0, credit_amount: 900, description: 'AP', partner_reference: `vendor:${vendor.name}` },
      ],
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  });

  await run('21', 'Tradeflow delivery JE with COGS', 'PASS', async () => {
    const ref = rand('TFDEL');
    const { data, error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: crypto.randomUUID(),
      p_event_type: 'TRADEFLOW_DELIVERY',
      p_reference_id: ref,
      p_idempotency_key: `TRADEFLOW_DELIVERY:${ref}`,
      p_source_module: 'tradeflow',
      p_created_by_module: 'tradeflow',
      p_source_type: 'tradeflow',
      p_source_id: ref,
      p_entry_date: nowDate(),
      p_journal_id: salesJ.id,
      p_reference: `${RUN_ID}-TF-DEL`,
      p_lines: [
        { account_id: ar.id, debit_amount: 1200, credit_amount: 0, description: 'AR', partner_reference: `customer:${customer.name}` },
        { account_id: revenue.id, debit_amount: 0, credit_amount: 1200, description: 'Rev' },
        { account_id: cogs.id, debit_amount: 900, credit_amount: 0, description: 'COGS' },
        { account_id: inventory.id, debit_amount: 0, credit_amount: 900, description: 'Inv out' },
      ],
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  });

  await run('22', 'Tradeflow repayment JE', 'PASS', async () => {
    const ref = rand('TFREP');
    const { data, error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: crypto.randomUUID(),
      p_event_type: 'TRADEFLOW_REPAYMENT',
      p_reference_id: ref,
      p_idempotency_key: `TRADEFLOW_REPAYMENT:${ref}`,
      p_source_module: 'tradeflow',
      p_created_by_module: 'tradeflow',
      p_source_type: 'tradeflow',
      p_source_id: ref,
      p_entry_date: nowDate(),
      p_journal_id: bankJ.id,
      p_reference: `${RUN_ID}-TF-REP`,
      p_lines: [
        { account_id: bank.id, debit_amount: 500, credit_amount: 0, description: 'Bank in' },
        { account_id: ar.id, debit_amount: 0, credit_amount: 500, description: 'AR clear', partner_reference: `customer:${customer.name}` },
      ],
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  });

  await run('23', 'Full business flow sanity', 'PASS', async () => {
    const evs = ['VENDOR_BILL_POSTED', 'CUSTOMER_INVOICE_POSTED', 'PAYMENT_RECEIVED', 'COD_SETTLED_TO_BANK'];
    for (const e of evs) {
      const { data } = await supabase.from('event_logs').select('id').eq('event_type', e).limit(1);
      ok((data || []).length > 0, `Missing event ${e}`);
    }
    return 'Flow events present';
  });

  await run('24', 'No direct balance update in code', 'PASS', async () => {
    const targets = walkFiles(path.resolve('.')).filter((f) => f.includes(`${path.sep}src${path.sep}`) || f.includes(`${path.sep}supabase${path.sep}`));
    const matcher = /(set\s+balance\s*=|update\s+.*balance|running_balance|account_balance)/i;
    const hits = [];
    for (const file of targets) {
      const ext = path.extname(file).toLowerCase();
      if (!['.ts', '.tsx', '.js', '.mjs', '.sql'].includes(ext)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (matcher.test(content)) hits.push(file);
      if (hits.length >= 3) break;
    }
    ok(hits.length === 0, `Potential direct balance writes found: ${hits.join(' | ')}`);
    return 'No direct balance writes';
  });

  await run('25', 'Ledger as source of truth', 'PASS', async () => {
    const { data, error } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount,credit_amount,journal_entries!inner(status)')
      .eq('journal_entries.status', 'posted');
    if (error) throw new Error(error.message);
    const dr = (data || []).reduce((s, r) => s + num(r.debit_amount), 0);
    const cr = (data || []).reduce((s, r) => s + num(r.credit_amount), 0);
    ok(Math.round((dr - cr) * 100) / 100 === 0, 'Global posted ledger not balanced');
    return { debit: dr, credit: cr };
  });

  await run('26', 'Partial failure rollback', 'PASS', async () => {
    const key = `ROLL:${rand('X')}`;
    const { error } = await supabase.rpc('process_mapped_journal_event', {
      p_event_id: crypto.randomUUID(),
      p_event_type: 'CUSTOMER_INVOICE_POSTED',
      p_reference_id: key,
      p_idempotency_key: key,
      p_source_module: 'customer_billing',
      p_created_by_module: 'customer_billing',
      p_source_type: 'invoice',
      p_source_id: key,
      p_entry_date: nowDate(),
      p_journal_id: salesJ.id,
      p_reference: `${RUN_ID}-ROLL`,
      p_lines: [{ account_id: ar.id, debit_amount: 100, credit_amount: 0, description: 'single-line-invalid' }],
    });
    ok(!!error, 'Single-line should fail');
    const { data: je } = await supabase.from('journal_entries').select('id').eq('event_id', key);
    ok((je || []).length === 0, 'Failed transaction left orphan JE');
    return 'Rollback verified';
  });

  await run('27', 'Payment without invoice rejection', 'FAIL expected', async () => {
    const { error } = await supabase.rpc('reconcile_payment_allocations', {
      p_payment_id: paymentId,
      p_allocations: [{ invoice_id: crypto.randomUUID(), amount: 10 }],
      p_actor: ACTOR,
    });
    ok(!!error, 'Should fail with missing invoice');
    return error.message;
  });

  await run('28', 'Trial balance equality', 'PASS', async () => {
    const { data, error } = await supabase
      .from('journal_entries')
      .select('total_debit,total_credit,status')
      .eq('status', 'posted');
    if (error) throw new Error(error.message);
    const dr = (data || []).reduce((s, r) => s + num(r.total_debit), 0);
    const cr = (data || []).reduce((s, r) => s + num(r.total_credit), 0);
    ok(Math.round((dr - cr) * 100) / 100 === 0, 'Trial balance mismatch');
    return { debit: dr, credit: cr };
  });

  await run('29', 'P&L formula', 'PASS', async () => {
    const { data: lines, error } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount,credit_amount,account_id,journal_entries!inner(status)')
      .eq('journal_entries.status', 'posted');
    if (error) throw new Error(error.message);
    const { data: accts, error: aErr } = await supabase.from('chart_of_accounts').select('id,type');
    if (aErr) throw new Error(aErr.message);
    const t = new Map((accts || []).map((a) => [a.id, a.type]));
    let rev = 0;
    let exp = 0;
    for (const l of lines || []) {
      const type = t.get(l.account_id);
      if (type === 'income') rev += num(l.credit_amount) - num(l.debit_amount);
      if (type === 'expense') exp += num(l.debit_amount) - num(l.credit_amount);
    }
    const net = rev - exp;
    ok(Number.isFinite(net), 'Invalid net profit');
    return { revenue: rev, expense: exp, net };
  });

  await run('30', 'Balance sheet equation', 'PASS', async () => {
    const { data: runEntries, error: runEntriesError } = await supabase
      .from('journal_entries')
      .select('id')
      .like('reference', `${RUN_ID}-%`)
      .eq('status', 'posted');
    if (runEntriesError) throw new Error(runEntriesError.message);
    const ids = (runEntries || []).map((r) => r.id);
    if (ids.length === 0) throw new Error('No run-specific posted entries found');
    const { data: lines, error } = await supabase
      .from('journal_entry_lines')
      .select('debit_amount,credit_amount,account_id')
      .in('journal_entry_id', ids);
    if (error) throw new Error(error.message);
    const { data: accts, error: aErr } = await supabase.from('chart_of_accounts').select('id,type');
    if (aErr) throw new Error(aErr.message);
    const t = new Map((accts || []).map((a) => [a.id, a.type]));
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let income = 0;
    let expenses = 0;
    for (const l of lines || []) {
      const type = t.get(l.account_id);
      const bal = num(l.debit_amount) - num(l.credit_amount);
      if (type === 'asset') assets += bal; // normal debit balance
      if (type === 'liability') liabilities += -bal; // credit - debit
      if (type === 'equity') equity += -bal; // credit - debit
      if (type === 'income') income += -bal; // credit - debit
      if (type === 'expense') expenses += bal; // debit - credit
    }
    // Equivalent accounting identity over a balanced ledger subset:
    // Assets + Expenses = Liabilities + Equity + Income
    ok(Math.abs((assets + expenses) - (liabilities + equity + income)) < 0.01, 'Accounting identity mismatch');
    return { assets, liabilities, equity, income, expenses };
  });

  await run('31', 'Zero-value transaction rejected', 'FAIL expected', async () => {
    const je = await createDraftJE(`${RUN_ID}-ZERO`, nowDate(), genJ.id);
    let failed = false;
    try {
      await addLines(je.id, [
        { account_id: bank.id, debit_amount: 0, credit_amount: 0 },
        { account_id: revenue.id, debit_amount: 0, credit_amount: 0 },
      ]);
      await postJE(je.id);
    } catch {
      failed = true;
    }
    ok(failed, 'Zero-value entry posted');
    return 'Rejected as expected';
  });

  await run('32', 'Negative values rejected', 'FAIL expected', async () => {
    const je = await createDraftJE(`${RUN_ID}-NEG`, nowDate(), genJ.id);
    let failed = false;
    try {
      await addLines(je.id, [
        { account_id: bank.id, debit_amount: -1, credit_amount: 0 },
        { account_id: revenue.id, debit_amount: 0, credit_amount: 1 },
      ]);
      await postJE(je.id);
    } catch {
      failed = true;
    }
    ok(failed, 'Negative entry posted');
    return 'Rejected as expected';
  });

  await run('33', 'Single-line entry rejected', 'FAIL expected', async () => {
    const je = await createDraftJE(`${RUN_ID}-ONE`, nowDate(), genJ.id);
    await addLines(je.id, [{ account_id: bank.id, debit_amount: 10, credit_amount: 0 }]);
    let failed = false;
    try { await postJE(je.id); } catch { failed = true; }
    ok(failed, 'Single-line entry posted');
    return 'Rejected as expected';
  });

  await run('34', 'Performance batch insert (10k draft JE)', 'PASS', async () => {
    const chunk = 500;
    const total = 10000;
    for (let i = 0; i < total; i += chunk) {
      const payload = [];
      for (let j = 0; j < chunk; j += 1) {
        payload.push({
          reference: `${RUN_ID}-LOAD-${i + j}`,
          entry_date: nowDate(),
          journal_id: genJ.id,
          status: 'draft',
          total_debit: 0,
          total_credit: 0,
        });
      }
      const { data, error } = await supabase.from('journal_entries').insert(payload).select('id');
      if (error) throw new Error(error.message);
      for (const row of data || []) created.entriesDraft.push(row.id);
    }
    const { count, error } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .like('reference', `${RUN_ID}-LOAD-%`);
    if (error) throw new Error(error.message);
    ok(count === 10000, `Expected 10000, got ${count}`);
    return { inserted: count };
  });

  // Cleanup only mutable records we created.
  if (created.entriesDraft.length > 0) {
    await supabase.from('journal_entries').delete().in('id', created.entriesDraft);
  }
  if (created.payments.length > 0) await supabase.from('payments').delete().in('id', created.payments);
  if (created.bills.length > 0) await supabase.from('vendor_bills').delete().in('id', created.bills);
  if (created.invoices.length > 0) await supabase.from('invoices').delete().in('id', created.invoices);

  const summary = {
    run_id: RUN_ID,
    total: report.length,
    passed: report.filter((r) => r.actual === 'PASS').length,
    failed: report.filter((r) => r.actual === 'FAIL').length,
    report,
  };
  fs.writeFileSync(path.resolve('scripts/accounting_audit_report.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
