/**
 * Resolve the tax master + CoA account used when posting a document JE.
 * Matches the document's actual rate to configured taxes — never a hardcoded ID.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { formatTaxReportLabel } from '@/lib/accounting/financial-reporting/tax-label';

export type ResolvedPostingTax = {
  accountId: string | null;
  taxId: string | null;
  label: string;
  rateValue: number | null;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function accountIdByCode(
  code: string,
  organizationId?: string | null
): Promise<string | null> {
  const supabase = await createAdminClient();
  if (organizationId) {
    const { data: orgHit } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('code', code)
      .eq('is_active', true)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (orgHit?.id) return String(orgHit.id);
  }
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('code', code)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function resolveTaxForPosting(opts: {
  organizationId?: string | null;
  kind: 'sales' | 'purchase';
  /** Document implied rate: tax / untaxed * 100 */
  rateHint?: number | null;
  /** Caller-supplied account wins when set. */
  taxAccountId?: string | null;
}): Promise<ResolvedPostingTax> {
  const type = opts.kind === 'purchase' ? 'purchase_tax' : 'sales_tax';
  const implied =
    opts.rateHint != null && Number.isFinite(Number(opts.rateHint))
      ? round2(Number(opts.rateHint))
      : null;

  const supabase = await createAdminClient();
  let q = supabase
    .from('taxes')
    .select(
      'id, account_id, rate_value, name, invoice_label, organization_id, sequence'
    )
    .eq('type', type)
    .eq('is_active', true)
    .order('sequence', { ascending: true })
    .limit(40);

  if (opts.organizationId) {
    q = q.or(
      `organization_id.eq.${opts.organizationId},organization_id.is.null`
    );
  }

  const { data: rows } = await q;
  const taxes = rows || [];

  const rateMatch =
    implied != null
      ? taxes.find((t) => Math.abs((Number(t.rate_value) || 0) - implied) < 0.05)
      : null;
  const withAccount = taxes.find((t) => t.account_id);
  const chosen = rateMatch || withAccount || taxes[0] || null;

  const fallbackCode = opts.kind === 'purchase' ? '1400' : '2200';
  const secondaryCode = opts.kind === 'purchase' ? '2200' : '2100';

  let accountId = opts.taxAccountId
    ? String(opts.taxAccountId)
    : chosen?.account_id
      ? String(chosen.account_id)
      : null;
  if (!accountId) {
    accountId =
      (await accountIdByCode(fallbackCode, opts.organizationId)) ||
      (await accountIdByCode(secondaryCode, opts.organizationId));
  }

  const labelSource =
    (rateMatch && (rateMatch.invoice_label || rateMatch.name)) ||
    (chosen && (chosen.invoice_label || chosen.name)) ||
    (opts.kind === 'purchase' ? 'Purchase Tax' : 'Sales Tax');

  const rateForLabel =
    implied != null
      ? implied
      : chosen
        ? Number(chosen.rate_value) || null
        : null;

  return {
    accountId,
    taxId: chosen?.id ? String(chosen.id) : null,
    label: formatTaxReportLabel(String(labelSource), rateForLabel),
    rateValue: rateForLabel,
  };
}
