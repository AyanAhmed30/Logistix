/**
 * Org-scoped quotation numbering: QT00001, QT00002, …
 * Falls back to scanning quotations if sequences table is missing.
 */

type SupabaseLike = {
  from: (table: string) => any;
  rpc?: (...args: any[]) => any;
};

function padQt(n: number) {
  return `QT${String(n).padStart(5, '0')}`;
}

function maxSequenceFromNumbers(numbers: string[]): number {
  let max = 0;
  for (const raw of numbers) {
    const qt = String(raw || '').match(/QT(\d+)/i);
    if (qt) {
      max = Math.max(max, parseInt(qt[1], 10));
      continue;
    }
    const legacy = String(raw || '').match(/^S(\d+)$/i);
    if (legacy) {
      max = Math.max(max, parseInt(legacy[1], 10));
    }
  }
  return max;
}

/**
 * Allocate next unique quotation number for an organization.
 * Prefers `sales_number_sequences`; supports future org-based prefixes.
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
        const next = Math.max(1, Number(seq.next_number) || 1);
        const prefix = String(seq.prefix || 'QT').toUpperCase();
        await supabase
          .from('sales_number_sequences')
          .update({
            next_number: next + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId);
        return `${prefix}${String(next).padStart(5, '0')}`;
      }

      // Bootstrap sequence from existing quotations in org
      const { data: existing } = await supabase
        .from('quotations')
        .select('quotation_number')
        .eq('organization_id', organizationId)
        .not('quotation_number', 'is', null)
        .limit(500);

      const max = maxSequenceFromNumbers(
        (existing || []).map((r: { quotation_number: string }) => r.quotation_number)
      );
      const next = max + 1;
      await supabase.from('sales_number_sequences').insert([
        {
          organization_id: organizationId,
          prefix: 'QT',
          next_number: next + 1,
        },
      ]);
      return padQt(next);
    } catch {
      // sequences table may not exist yet — fall through
    }
  }

  const { data: lastRows } = await supabase
    .from('quotations')
    .select('quotation_number')
    .not('quotation_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const max = maxSequenceFromNumbers(
    (lastRows || []).map((r: { quotation_number: string }) => r.quotation_number)
  );
  return padQt(max + 1);
}
