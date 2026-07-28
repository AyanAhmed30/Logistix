import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const raw = fs.readFileSync('.env.local', 'utf8');
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map[line.slice(0, idx).trim()] = val;
  }
  return map;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: contacts } = await sb.from('contacts').select('id, name').limit(5);
const ids = (contacts || []).map((c) => c.id);

console.log('contacts sample:', contacts?.length);

const rest = await sb.from('contacts').select('id, lead_id_formatted').in('id', ids);
console.log('REST lead_id_formatted:', rest.error?.message || rest.data);

const rpc = await sb.rpc('get_contact_lead_ids', { p_ids: ids });
console.log('RPC get_contact_lead_ids:', rpc.error?.message || rpc.data);

const leads = await sb
  .from('leads')
  .select('id, lead_id_formatted, contact_id, name')
  .not('lead_id_formatted', 'is', null)
  .limit(5);
console.log('leads sample:', leads.error?.message || leads.data);
