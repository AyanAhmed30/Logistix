import type { SupabaseClient } from '@supabase/supabase-js';

export const INQUIRY_IMAGES_BUCKET = 'inquiry-images';

function isBucketMissingError(message: string) {
  return /bucket not found|bucket does not exist|not found/i.test(message);
}

function isBucketAlreadyExistsError(message: string) {
  return /already exists|duplicate|already been taken/i.test(message);
}

export async function ensureInquiryImagesBucket(
  supabase: SupabaseClient
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError) {
    const exists = (buckets || []).some(
      (bucket) => bucket.id === INQUIRY_IMAGES_BUCKET || bucket.name === INQUIRY_IMAGES_BUCKET
    );
    if (exists) {
      return { ok: true };
    }
  }

  const { error: createError } = await supabase.storage.createBucket(INQUIRY_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024,
  });

  if (!createError || isBucketAlreadyExistsError(createError.message)) {
    return { ok: true };
  }

  return { ok: false, error: createError.message };
}

export function resolveInquiryAttachmentContentType(file: File): string {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
  let contentType = file.type || 'application/octet-stream';

  if (!contentType || contentType === 'application/octet-stream') {
    const mimeTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      heic: 'image/heic',
      heif: 'image/heif',
      avif: 'image/avif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      csv: 'text/csv',
    };
    contentType = mimeTypeMap[fileExt] || file.type || 'application/octet-stream';
  }

  return contentType;
}

export async function uploadToInquiryImagesBucket(
  supabase: SupabaseClient,
  filePath: string,
  file: File,
  contentType?: string
): Promise<{ success: true; url: string } | { error: string }> {
  const resolvedContentType = contentType || resolveInquiryAttachmentContentType(file);

  const bucketReady = await ensureInquiryImagesBucket(supabase);
  if (!bucketReady.ok) {
    return { error: bucketReady.error };
  }

  let uploadError: { message: string } | null = null;

  const firstAttempt = await supabase.storage.from(INQUIRY_IMAGES_BUCKET).upload(filePath, file, {
    contentType: resolvedContentType,
    upsert: false,
  });
  uploadError = firstAttempt.error;

  if (uploadError && isBucketMissingError(uploadError.message)) {
    const retryBucket = await ensureInquiryImagesBucket(supabase);
    if (!retryBucket.ok) {
      return { error: retryBucket.error };
    }

    const secondAttempt = await supabase.storage.from(INQUIRY_IMAGES_BUCKET).upload(filePath, file, {
      contentType: resolvedContentType,
      upsert: false,
    });
    uploadError = secondAttempt.error;
  }

  if (uploadError) {
    return { error: uploadError.message || 'File upload failed. Please try again.' };
  }

  const { data: urlData } = supabase.storage.from(INQUIRY_IMAGES_BUCKET).getPublicUrl(filePath);
  return { success: true, url: urlData.publicUrl };
}
