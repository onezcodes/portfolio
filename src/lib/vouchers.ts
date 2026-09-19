import type { SupabaseClient } from '@supabase/supabase-js';
import { entryFromForm } from './forms';
import type { LedgerEntry } from './ledger';

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isHttpUrl(value: string) {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function looksLikeImage(url: string) {
  return /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(url);
}

export async function storedImageFromForm(
  form: FormData,
  supabase: SupabaseClient,
  userId: string,
  fileField: string,
  urlField: string,
): Promise<{ path: string } | { error: 'invalid' | 'too-large' } | { path: null }> {
  const pasted = String(form.get(urlField) ?? '').trim();
  const file = form.get(fileField);

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: 'too-large' };
    if (!IMAGE_TYPES.has(file.type)) return { error: 'invalid' };
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('vouchers').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('image upload failed', error.message);
      return { error: 'invalid' };
    }
    return { path };
  }

  if (!pasted) return { path: null };

  try {
    const url = new URL(pasted);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { error: 'invalid' };
  } catch {
    return { error: 'invalid' };
  }
  return { path: pasted };
}

export async function voucherFromForm(
  form: FormData,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ voucher_url: string } | { error: 'invalid' | 'too-large' }> {
  const stored = await storedImageFromForm(form, supabase, userId, 'voucher', 'voucher_url');
  if ('error' in stored) return stored;
  return { voucher_url: stored.path ?? '' };
}

export async function createLedgerEntry(
  supabase: SupabaseClient,
  form: FormData,
  userId: string | null,
  projectId?: string,
) {
  const payload = entryFromForm(form);
  if (!payload) return { error: 'invalid' as const };
  if (!userId) return { error: 'invalid' as const };

  const voucher = await voucherFromForm(form, supabase, userId);
  if ('error' in voucher) return voucher;

  const { error } = await supabase.from('ledger_entries').insert({
    ...payload,
    project_id: projectId ?? payload.project_id,
    voucher_url: voucher.voucher_url,
    created_by: userId,
  });
  if (error) {
    console.error(error.message);
    return { error: 'invalid' as const };
  }
  return { error: null };
}

export async function removeLedgerEntry(supabase: SupabaseClient, entryId: string, projectId?: string) {
  let query = supabase.from('ledger_entries').select('voucher_url').eq('id', entryId);
  if (projectId) query = query.eq('project_id', projectId);
  const { data } = await query.maybeSingle();
  const stored = data?.voucher_url as string | undefined;
  if (stored && !isHttpUrl(stored)) {
    await supabase.storage.from('vouchers').remove([stored]);
  }
  let del = supabase.from('ledger_entries').delete().eq('id', entryId);
  if (projectId) del = del.eq('project_id', projectId);
  const { error } = await del;
  return error ? { error: 'invalid' as const } : { error: null };
}

export async function voucherHrefs(supabase: SupabaseClient, entries: Pick<LedgerEntry, 'voucher_url'>[]) {
  const hrefs = new Map<string, string>();
  const paths = [...new Set(entries.map((entry) => entry.voucher_url).filter((url) => url && !isHttpUrl(url)))];
  for (const entry of entries) {
    if (isHttpUrl(entry.voucher_url)) hrefs.set(entry.voucher_url, entry.voucher_url);
  }
  if (paths.length === 0) return hrefs;
  const { data, error } = await supabase.storage.from('vouchers').createSignedUrls(paths, 60 * 60);
  if (error) {
    console.error('signed urls failed', error.message);
    return hrefs;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) hrefs.set(item.path, item.signedUrl);
  }
  return hrefs;
}
