import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BACKUP_KEEP_DAYS, BACKUP_TABLES, runBackup } from '../../src/lib/backup';

// A tiny in-memory stand-in for the Supabase client parts the backup uses.
function fakeSupabase(opts: { rows: Record<string, number>; missing?: string[]; existing?: string[] }) {
  const uploads: { name: string; body: Buffer }[] = [];
  const removed: string[][] = [];
  let bucketCreated = false;
  const files = [...(opts.existing ?? [])];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async range(from: number, to: number) {
              if (opts.missing?.includes(table)) return { data: null, error: { code: 'PGRST205', message: 'missing' } };
              const total = opts.rows[table] ?? 0;
              const data = Array.from({ length: Math.max(0, Math.min(total, to + 1) - from) }, (_, i) => ({ id: from + i }));
              return { data, error: null };
            },
          };
        },
      };
    },
    storage: {
      async getBucket() {
        return { data: bucketCreated ? {} : null };
      },
      async createBucket() {
        bucketCreated = true;
        return { error: null };
      },
      from() {
        return {
          async upload(name: string, body: Buffer) {
            uploads.push({ name, body });
            if (!files.includes(name)) files.push(name);
            return { error: null };
          },
          async list() {
            return { data: [...files].sort().reverse().map((name) => ({ name })) };
          },
          async remove(names: string[]) {
            removed.push(names);
            return { error: null };
          },
        };
      },
    },
  };
  return { client: client as never, uploads, removed, get bucketCreated() { return bucketCreated; } };
}

describe('nightly backup', () => {
  it('exports every table across pages, gzipped, into a private bucket', async () => {
    const fake = fakeSupabase({ rows: { project_tasks: 2500, projects: 3 }, missing: ['job_opportunities'] });
    const result = await runBackup(fake.client, new Date('2026-11-16T13:00:00Z'));
    expect(fake.bucketCreated).toBe(true);
    expect(result.name).toBe('backup-2026-11-16.json.gz');
    const payload = JSON.parse(gunzipSync(fake.uploads[0].body).toString());
    expect(payload.counts.project_tasks).toBe(2500); // three pages of 1000
    expect(payload.counts.projects).toBe(3);
    expect(payload.tables.job_opportunities).toBeUndefined(); // missing table skipped
    expect(Object.keys(payload.tables)).toHaveLength(BACKUP_TABLES.length - 1);
  });

  it(`keeps only the newest ${BACKUP_KEEP_DAYS} backups`, async () => {
    const existing = Array.from({ length: 16 }, (_, i) => `backup-2026-10-${String(i + 1).padStart(2, '0')}.json.gz`);
    const fake = fakeSupabase({ rows: {}, existing });
    const result = await runBackup(fake.client, new Date('2026-11-16T13:00:00Z'));
    expect(result.pruned).toBe(3);
    expect(fake.removed[0]).toEqual(['backup-2026-10-03.json.gz', 'backup-2026-10-02.json.gz', 'backup-2026-10-01.json.gz']);
  });
});
