'use server';

import { requireAnyChildModule, isAccessDenied } from '@/lib/auth/require-access';
import { getCrmPipelineBoard } from '@/app/actions/crm/opportunities';
import type { CrmPipelineSummary } from '@/app/actions/crm/types';

export async function getCrmPipelineSummary(): Promise<
  { summary: CrmPipelineSummary } | { error: string }
> {
  const auth = await requireAnyChildModule(['crm-pipeline']);
  if (isAccessDenied(auth)) return { error: auth.error };

  const board = await getCrmPipelineBoard();
  if ('error' in board && board.error && !('stages' in board)) {
    return { error: board.error };
  }

  return {
    summary: {
      stage_count: board.stages?.length ?? 0,
      opportunity_count: board.opportunities?.length ?? 0,
    },
  };
}
