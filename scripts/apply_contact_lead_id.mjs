/**
 * Check Customer ID column + backfill missing lead_id_formatted on contacts.
 * Run: node scripts/apply_contact_lead_id.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const p = path.resolve('.env.local');
  const raw = fs.readFileSync(p, 'utf8');
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isValidLeadId(value) {
  return /^\d{6}$/.test(String(value || '').trim());
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function allocateLeadId() {
  const { data, error } = await supabase.rpc('allocate_contact_lead_id_formatted');
  if (!error && data) return String(data).trim();
  return String(100000 + Math.floor(Math.random() * 900000));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSchemaCacheError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('lead_id_formatted') &&
    (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find'))
  );
}

async function waitForLeadIdColumn(maxAttempts = 15, delayMs = 4000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const probe = await supabase.from('contacts').select('id, lead_id_formatted').limit(1);
    if (!probe.error) {
      console.log(`API schema ready (attempt ${attempt}/${maxAttempts}).`);
      return true;
    }

    const msg = probe.error.message || '';
    if (!isSchemaCacheError(msg)) {
      console.error('Probe failed:', msg);
      return false;
    }

    console.log(
      `Waiting for API schema cache… (${attempt}/${maxAttempts}). ` +
        'Run NOTIFY pgrst in SQL Editor if you have not already.'
    );
    if (attempt < maxAttempts) await sleep(delayMs);
  }

  return false;
}

async function main() {
  console.log(`Supabase project: ${url}`);

  const ready = await waitForLeadIdColumn();
  if (!ready) {
    console.log('REST column not visible yet — trying RPC fallback get_contact_lead_ids…');
    const { data: rpcProbe, error: rpcError } = await supabase.rpc('get_contact_lead_ids', {
      p_ids: [],
    });
    if (rpcError) {
      console.error(
        '\nNeither the REST column nor the RPC fallback is available yet.\n\n' +
          'Run this file in Supabase SQL Editor:\n' +
          '  supabase/migrations/add_contact_lead_id_rpc_fallback.sql\n\n' +
          'Then hard refresh the app (Ctrl+F5). The node script is optional once RPC is installed.'
      );
      process.exit(1);
    }
    if (!Array.isArray(rpcProbe)) {
      console.error('RPC get_contact_lead_ids returned an unexpected shape.');
      process.exit(1);
    }
    console.log('RPC fallback is available — continuing backfill via RPC.');
  }

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, legacy_lead_id, phone, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load contacts:', error.message);
    process.exit(1);
  }

  const contactIds = (contacts || []).map((c) => c.id);
  const leadIdMap = new Map();
  const CHUNK = 120;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const { data: leadRows, error: leadError } = await supabase.rpc('get_contact_lead_ids', {
      p_ids: chunk,
    });
    if (leadError) {
      console.error('Failed to read Customer IDs via RPC:', leadError.message);
      process.exit(1);
    }
    for (const row of leadRows || []) {
      if (isValidLeadId(row.lead_id_formatted)) {
        leadIdMap.set(row.id, String(row.lead_id_formatted).trim());
      }
    }
  }

  const withLeadIds = (contacts || []).map((c) => ({
    ...c,
    lead_id_formatted: leadIdMap.get(c.id) || null,
  }));

  const missing = withLeadIds.filter((c) => !isValidLeadId(c.lead_id_formatted));
  console.log(`Contacts total: ${withLeadIds.length}, missing Customer ID: ${missing.length}`);

  if (!missing.length) {
    console.log('All contacts already have Customer IDs.');
    return;
  }

  const legacyIds = [...new Set(missing.map((c) => c.legacy_lead_id).filter(Boolean))];
  const leadIdByUuid = new Map();
  if (legacyIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, lead_id_formatted')
      .in('id', legacyIds);
    for (const lead of leads || []) {
      if (isValidLeadId(lead.lead_id_formatted)) {
        leadIdByUuid.set(lead.id, String(lead.lead_id_formatted).trim());
      }
    }
  }

  const leadIdByPhone = new Map();
  const { data: leadsByPhone } = await supabase
    .from('leads')
    .select('lead_id_formatted, number, number_normalized')
    .not('lead_id_formatted', 'is', null)
    .limit(10000);

  for (const lead of leadsByPhone || []) {
    if (!isValidLeadId(lead.lead_id_formatted)) continue;
    const leadId = String(lead.lead_id_formatted).trim();
    const phone = normalizePhone(lead.number_normalized || lead.number);
    if (phone && !leadIdByPhone.has(phone)) leadIdByPhone.set(phone, leadId);
  }

  let updated = 0;
  for (const contact of missing) {
    let candidate = null;
    if (contact.legacy_lead_id && leadIdByUuid.has(contact.legacy_lead_id)) {
      candidate = leadIdByUuid.get(contact.legacy_lead_id);
    } else {
      const phone = normalizePhone(contact.phone);
      if (phone && leadIdByPhone.has(phone)) candidate = leadIdByPhone.get(phone);
    }

    for (let attempt = 0; attempt < 12; attempt++) {
      const leadId = candidate || (await allocateLeadId());
      const { error: updateError } = await supabase.rpc('set_contact_lead_id', {
        p_contact_id: contact.id,
        p_lead_id: leadId,
      });

      if (!updateError) {
        updated += 1;
        console.log(`Assigned ${leadId} → ${contact.id}`);
        break;
      }

      if (updateError.code === '23505') {
        candidate = null;
        continue;
      }

      console.error(`Failed ${contact.id}:`, updateError.message);
      break;
    }
  }

  console.log(`Backfill complete. Updated ${updated} contact(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
