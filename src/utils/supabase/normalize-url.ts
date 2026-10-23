/**
 * Normalize Supabase project URL for @supabase/supabase-js.
 * Must be the project root (https://xxx.supabase.co), never .../rest/v1.
 */
export function normalizeSupabaseProjectUrl(raw: string | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}
