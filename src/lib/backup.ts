import { gzipSync } from 'node:zlib';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Nightly backup: every app table exported as JSON (gzipped) into a private
 * Supabase Storage bucket that only the service role can read. Keeps 14 days.
 *
 * Not included: uploaded files (vouchers, task attachments) and Supabase Auth
 * accounts. Team access is the team_members table, which is included; people
 * sign in again with Google/GitHub after a restore.
 *
 * Restore with: node scripts/backup.mjs list | download | restore (see README).
 */

export const BACKUP_BUCKET = 'backups';
export const BACKUP_KEEP_DAYS = 14;

// Parents before children, so a restore can insert in this order.
export const BACKUP_TABLES = [
  'team_members',
  'projects',
  'project_members',
  'project_milestones',
  'project_tasks',
  'task_subtasks',
  'project_qa_checklists',
  'project_qa_checks',
  'task_comments',
  'task_followers',
  'task_attachments',
  'task_dependencies',
  'task_events',
  'task_time_entries',
  'task_saved_views',
  'project_checkins',
  'project_contributions',
  'ledger_entries',
  'studio_credentials',
  'studio_credential_access',
  'studio_events',
  'studio_templates',
  'project_share_links',
  'project_meetings',
  'project_personal_items',
  'calendar_feed_tokens',
  'team_notifications',
  'job_opportunities',
] as const;

const PAGE = 1000;

async function exportTable(supabase: SupabaseClient, table: string) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      // A table that does not exist yet (older database) is skipped, not fatal.
      if (error.code === '42P01' || error.code === 'PGRST205') return null;
      throw new Error(`${table}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function ensureBucket(supabase: SupabaseClient) {
  const { data } = await supabase.storage.getBucket(BACKUP_BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BACKUP_BUCKET, { public: false, fileSizeLimit: 50 * 1024 * 1024 });
  if (error && !/already exists/i.test(error.message)) throw new Error(`bucket: ${error.message}`);
}

export async function runBackup(supabase: SupabaseClient, now = new Date()) {
  await ensureBucket(supabase);
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = await exportTable(supabase, table);
    if (rows === null) continue;
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const payload = { version: 1, created_at: now.toISOString(), counts, tables };
  const body = gzipSync(Buffer.from(JSON.stringify(payload)));
  const name = `backup-${now.toISOString().slice(0, 10)}.json.gz`;
  const { error } = await supabase.storage.from(BACKUP_BUCKET).upload(name, body, {
    contentType: 'application/gzip',
    upsert: true,
  });
  if (error) throw new Error(`upload: ${error.message}`);

  // Keep the newest BACKUP_KEEP_DAYS files.
  const { data: files } = await supabase.storage.from(BACKUP_BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  const old = (files ?? []).filter((f) => f.name.startsWith('backup-')).slice(BACKUP_KEEP_DAYS).map((f) => f.name);
  if (old.length) await supabase.storage.from(BACKUP_BUCKET).remove(old);

  return { name, bytes: body.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), tables: Object.keys(counts).length, pruned: old.length };
}
