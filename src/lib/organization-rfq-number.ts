const MONTH_ABBREVIATIONS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export function buildOrganizationRfqPrefix(date = new Date()) {
  const month = MONTH_ABBREVIATIONS[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `RFQ-${month}${year}`;
}

export function parseOrganizationRfqSequence(rfqNumber: string, prefix: string) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = rfqNumber.trim().match(new RegExp(`^${escapedPrefix}-(\\d+)$`));
  if (!match) return null;
  const sequence = parseInt(match[1], 10);
  return Number.isFinite(sequence) ? sequence : null;
}

export function formatOrganizationRfqNumber(prefix: string, sequence: number) {
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

type SupabaseClient = Awaited<
  ReturnType<typeof import('@/utils/supabase/server').createAdminClient>
>;

export async function getLatestOrganizationRfqSequence(
  supabase: SupabaseClient,
  organizationId: string,
  prefix: string
) {
  const { data, error } = await supabase
    .from('organization_quotations')
    .select('source_reference')
    .eq('organization_id', organizationId)
    .ilike('source_reference', `${prefix}-%`)
    .order('source_reference', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  let latestSequence = 0;
  for (const row of data || []) {
    const sequence = parseOrganizationRfqSequence(String(row.source_reference || ''), prefix);
    if (sequence && sequence > latestSequence) {
      latestSequence = sequence;
    }
  }

  return latestSequence;
}

export async function generateOrganizationRfqNumber(
  supabase: SupabaseClient,
  organizationId: string,
  date = new Date()
) {
  const prefix = buildOrganizationRfqPrefix(date);
  const latestSequence = await getLatestOrganizationRfqSequence(supabase, organizationId, prefix);
  return formatOrganizationRfqNumber(prefix, latestSequence + 1);
}

export async function reserveUniqueOrganizationRfqNumber(
  supabase: SupabaseClient,
  organizationId: string,
  date = new Date(),
  maxAttempts = 8
) {
  const prefix = buildOrganizationRfqPrefix(date);
  let latestSequence = await getLatestOrganizationRfqSequence(supabase, organizationId, prefix);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    latestSequence += 1;
    const candidate = formatOrganizationRfqNumber(prefix, latestSequence);

    const { data: existing } = await supabase
      .from('organization_quotations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source_reference', candidate)
      .maybeSingle();

    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique RFQ number. Please try again.');
}
