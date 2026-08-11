/**
 * Canonical lead channel sources — must match public.leads CHECK constraint
 * `leads_source_check`: source IN ('Meta', 'LinkedIn', 'WhatsApp', 'Others')
 *
 * Do NOT confuse with crm_opportunities.source (free-text / markers like
 * `contact_auto` from Contact→CRM automation). Those are not lead channels.
 */

export const LEAD_SOURCE_VALUES = [
  'Meta',
  'LinkedIn',
  'WhatsApp',
  'Others',
] as const;

export type LeadSourceValue = (typeof LEAD_SOURCE_VALUES)[number];

const LEAD_SOURCE_SET = new Set<string>(LEAD_SOURCE_VALUES);

/** Case-insensitive aliases → canonical lead source. */
const LEAD_SOURCE_ALIASES: Record<string, LeadSourceValue> = {
  meta: 'Meta',
  facebook: 'Meta',
  fb: 'Meta',
  linkedin: 'LinkedIn',
  'linked in': 'LinkedIn',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  others: 'Others',
  other: 'Others',
  manual: 'Others',
  website: 'Others',
  web: 'Others',
  crm: 'Others',
  // CRM opportunity markers / automation — not lead channels
  contact_auto: 'Others',
  opportunity: 'Others',
};

/**
 * Normalize any free-text / CRM opportunity source into a value allowed by
 * `leads_source_check`. Unknown values map to `Others` (never throw).
 */
export function normalizeLeadSource(
  raw: string | null | undefined
): LeadSourceValue {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return 'Others';
  if (LEAD_SOURCE_SET.has(trimmed)) return trimmed as LeadSourceValue;

  const alias = LEAD_SOURCE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return 'Others';
}

export function isValidLeadSource(raw: string | null | undefined): boolean {
  return LEAD_SOURCE_SET.has(String(raw || '').trim());
}
