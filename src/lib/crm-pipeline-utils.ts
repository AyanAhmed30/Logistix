export const CRM_ADMIN_STAGE_PREFIX = '__admin_col__';

export const DEFAULT_CRM_PIPELINE_STAGES: Array<{
  name: string;
  sequence: number;
  is_won: boolean;
  is_lost: boolean;
  default_probability: number;
}> = [
  { name: 'New', sequence: 10, is_won: false, is_lost: false, default_probability: 10 },
  { name: 'Qualified', sequence: 20, is_won: false, is_lost: false, default_probability: 40 },
  { name: 'Proposition', sequence: 30, is_won: false, is_lost: false, default_probability: 70 },
  { name: 'Won', sequence: 40, is_won: true, is_lost: false, default_probability: 100 },
  { name: 'Lost', sequence: 50, is_won: false, is_lost: true, default_probability: 0 },
];

export function buildAdminVirtualStageId(stageName: string) {
  return `${CRM_ADMIN_STAGE_PREFIX}${stageName}`;
}

export function parseAdminVirtualStageName(stageId: string): string | null {
  if (!stageId.startsWith(CRM_ADMIN_STAGE_PREFIX)) return null;
  return stageId.slice(CRM_ADMIN_STAGE_PREFIX.length);
}
