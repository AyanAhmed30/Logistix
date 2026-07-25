/**
 * CRM domain types — Pipeline, Opportunities, Activities.
 */

import type { SessionPayload } from '@/lib/auth/session';

export type CrmOrgScope =
  | { organizationId: string; session: SessionPayload; isGlobalAdminView: false }
  | { organizationId: null; session: SessionPayload; isGlobalAdminView: true };

export type CrmPipelineStage = {
  id: string;
  organization_id: string;
  name: string;
  sequence: number;
  is_won: boolean;
  is_lost: boolean;
  is_folded: boolean;
  default_probability: number;
  created_at: string;
  updated_at: string;
};

export type CrmOpportunityPriority = 0 | 1 | 2 | 3;

export type CrmOpportunity = {
  id: string;
  organization_id: string;
  stage_id: string;
  name: string;
  contact_id: string | null;
  contact_person_id: string | null;
  expected_revenue: number;
  probability: number;
  probability_manual: boolean;
  priority: CrmOpportunityPriority;
  salesperson_id: string | null;
  sales_team: string | null;
  tags: string[];
  campaign: string | null;
  medium: string | null;
  source: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  expected_closing_date: string | null;
  internal_notes: string | null;
  lost_reason: string | null;
  lead_score: number;
  date_closed: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmOpportunityCard = CrmOpportunity & {
  customer_name: string | null;
  contact_person_name: string | null;
  salesperson_name: string | null;
  organization_name: string | null;
  stage_name: string | null;
  next_activity_summary?: string | null;
  next_activity_due_date?: string | null;
  next_activity_assigned_name?: string | null;
  next_activity_status?: CrmActivityStatus | null;
};

export type CrmActivityType = 'call' | 'meeting' | 'email' | 'follow-up' | 'todo';

export type CrmActivityStatus = 'scheduled' | 'done' | 'cancelled';

export type CrmScheduledActivity = {
  id: string;
  organization_id: string;
  opportunity_id: string;
  activity_type: CrmActivityType;
  summary: string;
  notes: string | null;
  due_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: CrmActivityStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  opportunity_name?: string | null;
  customer_name?: string | null;
};

export type CrmActivityUpsertInput = {
  id?: string;
  opportunity_id: string;
  activity_type: CrmActivityType;
  summary: string;
  notes?: string | null;
  due_date?: string | null;
  assigned_to: string;
};

export type CrmActivityListFilters = {
  activityType?: CrmActivityType | 'all';
  status?: CrmActivityStatus | 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';
  assignedTo?: string | 'all' | 'me';
  dueFrom?: string;
  dueTo?: string;
};

export type CrmChatterEntryType = 'message' | 'note' | 'attachment' | 'audit' | 'reply';

export type CrmChatterEntry = {
  id: string;
  organization_id: string;
  opportunity_id: string;
  entry_type: CrmChatterEntryType;
  body: string;
  performed_by: string;
  parent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CrmActivity = CrmScheduledActivity;

export type CrmOpportunityUpsertInput = {
  id?: string;
  name: string;
  contact_id: string;
  contact_person_id?: string | null;
  stage_id?: string;
  expected_revenue?: number;
  probability?: number;
  priority?: CrmOpportunityPriority;
  salesperson_id: string;
  sales_team?: string | null;
  tags?: string[];
  campaign?: string | null;
  medium?: string | null;
  source?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  expected_closing_date?: string | null;
  internal_notes?: string | null;
};

export type CrmPipelineBoardFilters = {
  search?: string;
  stageId?: string | null;
  salespersonId?: string | null;
  contactId?: string | null;
  sortBy?: 'expected_revenue' | 'created_at';
  sortDir?: 'asc' | 'desc';
};

export type CrmPipelineBoard = {
  stages: CrmPipelineStage[];
  opportunities: CrmOpportunityCard[];
};

export type CrmPipelineSummary = {
  stage_count: number;
  opportunity_count: number;
};

export type CrmActivitiesSummary = {
  scheduled_count: number;
  overdue_count: number;
};

/** @deprecated Use CrmPipelineStage */
export type CrmOpportunityStage = Pick<
  CrmPipelineStage,
  'id' | 'name' | 'sequence' | 'is_won' | 'is_lost'
>;
