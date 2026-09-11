export type InquiryFlag = {
  id: string;
  inquiry_id: string;
  message: string;
  raised_by: string;
  raised_by_role: string;
  created_at: string;
};

const MAX_FLAG_MESSAGE_LENGTH = 4000;

export function normalizeInquiryFlagMessage(
  raw: string
): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw ?? '').trim();
  if (!value) {
    return { ok: false, error: 'Enter a flag message.' };
  }
  if (value.length > MAX_FLAG_MESSAGE_LENGTH) {
    return { ok: false, error: `Flag message must be ${MAX_FLAG_MESSAGE_LENGTH} characters or fewer.` };
  }
  return { ok: true, value };
}

export function inquiryHasFlag(
  flags: Array<{ id?: string } | InquiryFlag> | null | undefined
): boolean {
  return Array.isArray(flags) && flags.length > 0;
}

export function normalizeInquiryFlags(raw: unknown): InquiryFlag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const id = String(item.id || '').trim();
      const message = String(item.message || '').trim();
      if (!id) return null;
      return {
        id,
        inquiry_id: String(item.inquiry_id || ''),
        message,
        raised_by: String(item.raised_by || ''),
        raised_by_role: String(item.raised_by_role || 'operations'),
        created_at: String(item.created_at || ''),
      } satisfies InquiryFlag;
    })
    .filter((row): row is InquiryFlag => Boolean(row))
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
}
