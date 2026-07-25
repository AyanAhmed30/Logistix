import { createAdminClient } from '@/utils/supabase/server';

export async function attachNextActivitiesToOpportunities<
  T extends { id: string } & Record<string, unknown>,
>(opportunities: T[]) {
  if (opportunities.length === 0) return opportunities;

  const supabase = await createAdminClient();
  const oppIds = opportunities.map((o) => o.id);
  const { data: activities } = await supabase
    .from('crm_activities')
    .select('id, opportunity_id, summary, due_date, status, assigned_to')
    .in('opportunity_id', oppIds)
    .eq('status', 'scheduled')
    .order('due_date', { ascending: true });

  if (!activities?.length) return opportunities;

  const agentIds = [...new Set(activities.map((a) => a.assigned_to).filter(Boolean))] as string[];
  let agentMap = new Map<string, string>();
  if (agentIds.length) {
    const { data: agents } = await supabase.from('sales_agents').select('id, name').in('id', agentIds);
    agentMap = new Map((agents || []).map((a) => [String(a.id), String(a.name || '')]));
  }

  const nextByOpp = new Map<string, (typeof activities)[0]>();
  for (const act of activities) {
    const oid = String(act.opportunity_id);
    if (!nextByOpp.has(oid)) nextByOpp.set(oid, act);
  }

  return opportunities.map((opp) => {
    const next = nextByOpp.get(opp.id);
    if (!next) return opp;
    return {
      ...opp,
      next_activity_summary: next.summary,
      next_activity_due_date: next.due_date,
      next_activity_assigned_name: next.assigned_to
        ? agentMap.get(String(next.assigned_to)) || null
        : null,
      next_activity_status: next.status,
    };
  });
}
