/**
 * Mirrors DB least-loaded Sales Agent selection (021 migration).
 * Used for offline unit verification of balance / tie-break rules.
 */

export type AgentLoadInput = {
  id: string;
  mobileCustomerCount: number;
  lastMobileAutoAssignedAt: string | null;
};

export function pickLeastLoadedSalesAgent(
  agents: AgentLoadInput[],
): string | null {
  const eligible = agents.filter((a) => Boolean(a.id));
  if (eligible.length === 0) return null;

  const sorted = [...eligible].sort((a, b) => {
    if (a.mobileCustomerCount !== b.mobileCustomerCount) {
      return a.mobileCustomerCount - b.mobileCustomerCount;
    }
    const aTs = a.lastMobileAutoAssignedAt
      ? Date.parse(a.lastMobileAutoAssignedAt)
      : Number.NEGATIVE_INFINITY;
    const bTs = b.lastMobileAutoAssignedAt
      ? Date.parse(b.lastMobileAutoAssignedAt)
      : Number.NEGATIVE_INFINITY;
    if (aTs !== bTs) return aTs - bTs;
    return a.id.localeCompare(b.id);
  });

  return sorted[0]?.id ?? null;
}

/** Simulate N sequential automatic assignments starting from zero load. */
export function simulateBalancedAssignments(
  agentIds: string[],
  customerCount: number,
): Record<string, number> {
  const loads: AgentLoadInput[] = agentIds.map((id) => ({
    id,
    mobileCustomerCount: 0,
    lastMobileAutoAssignedAt: null,
  }));
  const counts: Record<string, number> = Object.fromEntries(
    agentIds.map((id) => [id, 0]),
  );

  for (let i = 0; i < customerCount; i += 1) {
    const picked = pickLeastLoadedSalesAgent(loads);
    if (!picked) break;
    const row = loads.find((a) => a.id === picked);
    if (!row) break;
    row.mobileCustomerCount += 1;
    row.lastMobileAutoAssignedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    counts[picked] += 1;
  }

  return counts;
}
