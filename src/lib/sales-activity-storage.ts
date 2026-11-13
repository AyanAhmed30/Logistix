import type { SupabaseClient } from '@supabase/supabase-js';
import { workLogTypeLabel, isWorkLogType, type WorkLogEntry } from '@/lib/sales-work-log-types';

/**
 * Private bucket for work-log attachments (migration 058 creates it). Files
 * are never public: callers check access first, then hand out signed links.
 */
export const WORK_LOG_BUCKET = 'sales-activity-attachments';
const SIGNED_URL_SECONDS = 60 * 60;

export async function ensureWorkLogBucket(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.storage.getBucket(WORK_LOG_BUCKET);
  if (data) return true;
  const { error } = await supabase.storage.createBucket(WORK_LOG_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
  });
  return !error || /already exists|duplicate/i.test(error.message);
}

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv',
]);

export function isAllowedAttachment(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_EXTENSIONS.has(ext);
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'file';
}

export type StoredAttachment = { path: string; name: string; type: string; size: number };

export type WorkLogRow = {
  id: string;
  sales_agent_id: string;
  activity_type: string;
  custom_type: string | null;
  contact_id: string | null;
  contact_name: string | null;
  description: string;
  attachments: unknown;
  logged_at: string;
};

export const WORK_LOG_COLUMNS =
  'id, sales_agent_id, activity_type, custom_type, contact_id, contact_name, description, attachments, logged_at';

function storedAttachments(value: unknown): StoredAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a): a is StoredAttachment => Boolean(a) && typeof (a as StoredAttachment).path === 'string')
    .map((a) => ({ path: a.path, name: String(a.name || 'file'), type: String(a.type || ''), size: Number(a.size) || 0 }));
}

/** Rows → entries, with signed links for the attachments. Only call after an access check. */
export async function toWorkLogEntries(
  supabase: SupabaseClient,
  rows: WorkLogRow[],
  agentNames: Map<string, string>
): Promise<WorkLogEntry[]> {
  const paths = rows.flatMap((r) => storedAttachments(r.attachments).map((a) => a.path));
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await supabase.storage.from(WORK_LOG_BUCKET).createSignedUrls(paths.slice(i, i + 100), SIGNED_URL_SECONDS);
    for (const item of data || []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return rows.map((r) => ({
    id: String(r.id),
    agentId: String(r.sales_agent_id),
    agentName: agentNames.get(String(r.sales_agent_id)) ?? 'Unknown agent',
    type: isWorkLogType(r.activity_type) ? r.activity_type : 'other',
    typeLabel: workLogTypeLabel(String(r.activity_type), r.custom_type),
    contactId: r.contact_id ? String(r.contact_id) : null,
    contactName: r.contact_name ? String(r.contact_name) : null,
    description: String(r.description || ''),
    loggedAt: String(r.logged_at),
    attachments: storedAttachments(r.attachments).map((a) => ({
      name: a.name,
      type: a.type,
      size: a.size,
      url: urls.get(a.path) ?? null,
    })),
  }));
}
