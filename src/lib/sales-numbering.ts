/**
 * Org-scoped quotation numbering: S00001, S00002, … (Odoo-style).
 * Always emits S##### — never QT.
 */

/**
 * Accepts the admin Supabase client without importing generated DB types.
 * Runtime only uses the query methods below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

const QUOTATION_PREFIX = 'S';

function padS(n: number) {
  return `${QUOTATION_PREFIX}${String(n).padStart(5, '0')}`;
}

function maxSequenceFromNumbers(numbers: string[]): number {
  let max = 0;
  for (const raw of numbers) {
    const s = String(raw || '').match(/^S(\d+)$/i);
    if (s) {
      max = Math.max(max, parseInt(s[1], 10));
      continue;
    }
    // Legacy QT##### — keep sequence continuous when migrating
    const qt = String(raw || '').match(/^QT(\d+)$/i);
    if (qt) {
      max = Math.max(max, parseInt(qt[1], 10));
    }
  }
  return max;
}

/**
 * Allocate next unique quotation number for an organization.
 * Always returns S00001-style numbers (never QT).
 */
export async function allocateSalesQuotationNumber(
  supabase: SupabaseLike,
  organizationId: string | null
): Promise<string> {
  if (organizationId) {
    try {
      const { data: seq } = await supabase
        .from('sales_number_sequences')
        .select('prefix, next_number')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (seq) {
        let next = Math.max(1, Number(seq.next_number) || 1);

        // Avoid colliding with any existing S/QT number still in the table
        const { data: existing } = await supabase
          .from('quotations')
          .select('quotation_number')
          .eq('organization_id', organizationId)
          .not('quotation_number', 'is', null)
          .limit(1000);
        const maxExisting = maxSequenceFromNumbers(
          (existing || []).map(
            (r: { quotation_number: string }) => r.quotation_number
          )
        );
        next = Math.max(next, maxExisting + 1);

        await supabase
          .from('sales_number_sequences')
          .update({
            prefix: QUOTATION_PREFIX,
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);

        return padS(next);
      }

      // Bootstrap sequence from existing quotations in org
      const { data: existing } = await supabase
        .from('quotations')
        .select('quotation_number')
        .eq('organization_id', organizationId)
        .not('quotation_number', 'is', null)
        .limit(1000);

      const max = maxSequenceFromNumbers(
        (existing || []).map(
          (r: { quotation_number: string }) => r.quotation_number
        )
      );
      const next = max + 1;
      await supabase.from('sales_number_sequences').insert([
        {
          organization_id: organizationId,
          prefix: QUOTATION_PREFIX,
          next_number: next + 1,
        },
      ]);
      return padS(next);
    } catch {
      // sequences table may not exist yet — fall through
    }
  }

  const { data: lastRows } = await supabase
    .from('quotations')
    .select('quotation_number')
    .not('quotation_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500);

  const max = maxSequenceFromNumbers(
    (lastRows || []).map((r: { quotation_number: string }) => r.quotation_number)
  );
  return padS(max + 1);
}
