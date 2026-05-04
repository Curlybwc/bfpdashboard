import { supabase } from '@/integrations/supabase/client';
import { ALLOWED_RECEIPT_TYPES, MAX_RECEIPT_SIZE_BYTES, MAX_RECEIPTS_PER_REQUEST } from './reimbursementStatus';

/**
 * Convert an HEIC/HEIF file to JPEG client-side.
 * Browsers can't render HEIC, so we always convert before upload.
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const out = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([out], newName, { type: 'image/jpeg' });
}

export async function prepareAndUploadReceipts(
  files: File[],
  userId: string,
  existingCount = 0
): Promise<{ paths: string[]; errors: string[] }> {
  const paths: string[] = [];
  const errors: string[] = [];

  if (existingCount + files.length > MAX_RECEIPTS_PER_REQUEST) {
    errors.push(`You can attach at most ${MAX_RECEIPTS_PER_REQUEST} receipts.`);
    return { paths, errors };
  }

  for (const original of files) {
    let file = original;

    // HEIC → JPEG conversion
    if (/\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif') {
      try {
        file = await convertHeicToJpeg(file);
      } catch (e) {
        errors.push(`Failed to convert ${original.name}: ${e instanceof Error ? e.message : 'unknown error'}`);
        continue;
      }
    }

    if (!ALLOWED_RECEIPT_TYPES.includes(file.type) && !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
      errors.push(`${original.name}: file type not allowed`);
      continue;
    }

    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      errors.push(`${original.name}: exceeds 10 MB limit`);
      continue;
    }

    const ext = file.name.split('.').pop() || 'bin';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('reimbursement-receipts').upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      errors.push(`${original.name}: ${error.message}`);
      continue;
    }
    paths.push(path);
  }

  return { paths, errors };
}

export async function getSignedReceiptUrl(reimbursementId: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('reimbursement_signed_url', {
    body: { reimbursement_id: reimbursementId, path },
  });
  if (error || !data?.url) return null;
  return data.url as string;
}