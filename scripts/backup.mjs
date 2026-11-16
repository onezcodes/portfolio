#!/usr/bin/env node
// Backups made by the nightly job (src/lib/backup.ts).
//
//   node scripts/backup.mjs list                      list stored backups
//   node scripts/backup.mjs download [name]           save one locally (default: newest)
//   node scripts/backup.mjs restore <file> [--tables a,b] [--apply]
//
// restore is a dry run unless --apply is given. With --apply it UPSERTS rows by
// primary key: rows in the backup overwrite current rows with the same key, and
// rows created after the backup are left alone. Needs PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (read from the environment or .env).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'backups';
const KEYS = {
  project_members: 'project_id,email',
  task_followers: 'task_id,email',
  task_dependencies: 'task_id,depends_on_id',
  studio_credential_access: 'credential_id,email',
  team_members: 'email',
  project_share_links: 'project_id',
  calendar_feed_tokens: 'email',
};

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function client() {
  const url = env('PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    console.error('Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env).');
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const [command, arg, ...rest] = process.argv.slice(2);

if (command === 'list') {
  const { data, error } = await client().storage.from(BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  for (const f of data ?? []) console.log(`${f.name}\t${Math.round((f.metadata?.size ?? 0) / 1024)} KB`);
} else if (command === 'download') {
  const supabase = client();
  let name = arg;
  if (!name) {
    const { data } = await supabase.storage.from(BUCKET).list('', { limit: 1, sortBy: { column: 'name', order: 'desc' } });
    name = data?.[0]?.name;
  }
  if (!name) throw new Error('No backups found.');
  const { data, error } = await supabase.storage.from(BUCKET).download(name);
  if (error) throw error;
  writeFileSync(name, Buffer.from(await data.arrayBuffer()));
  console.log(`Saved ${name}`);
} else if (command === 'restore') {
  if (!arg) throw new Error('Usage: restore <file.json.gz> [--tables a,b] [--apply]');
  const apply = rest.includes('--apply');
  const only = rest.find((r) => r.startsWith('--tables'))?.split('=')[1] ?? rest[rest.indexOf('--tables') + 1];
  const wanted = only && !only.startsWith('--') ? new Set(only.split(',')) : null;
  const backup = JSON.parse(gunzipSync(readFileSync(arg)).toString('utf8'));
  console.log(`Backup from ${backup.created_at}${apply ? '' : ' (dry run; add --apply to write)'}`);
  const supabase = apply ? client() : null;
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (wanted && !wanted.has(table)) continue;
    console.log(`${table}: ${rows.length} rows`);
    if (!apply || rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: KEYS[table] ?? 'id' });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }
  console.log(apply ? 'Restore finished.' : 'Dry run finished. Nothing was written.');
} else {
  console.log('Usage: node scripts/backup.mjs list | download [name] | restore <file> [--tables a,b] [--apply]');
}
