# Onez Codes

Static site for [Onez Codes](https://www.onezcodes.com) — tech solutions and software house. Built with Astro, almost no client JavaScript.

## Commands

```sh
npm install
npm run dev      # http://localhost:4321
npm run build
npm run preview
```

Copy lives in `src/data/site.ts` (name, email, services, projects). The contact form posts to `/api/contact` and emails the studio via Resend (`RESEND_API_KEY` in `.env`).

## Tests

- `npm test`: unit tests (permissions, health, time parsing, mentions, webhook checks, backups).
- `npm run test:db`: database permission tests. Each file in `supabase/tests/` runs in a fresh
  Postgres database built from every migration, with Supabase's roles and default grants stubbed.
  Needs a local Postgres (uses `PG*` env vars), e.g. `PGPORT=5432 npm run test:db`.
- GitHub Actions runs both, plus the build, on every push to `main` and on pull requests.

## Backups

The daily keepalive cron (`/api/cron/keepalive`) also exports every app table to the private
`backups` storage bucket as `backup-YYYY-MM-DD.json.gz` and keeps the last 14 days. Uploaded files
(vouchers, task attachments) and Supabase Auth accounts are not included.

Needs `SUPABASE_SERVICE_ROLE_KEY` (and `PUBLIC_SUPABASE_URL`) in your environment or `.env`:

```sh
npm run backup -- list                         # stored backups
npm run backup -- download                     # newest one, saved locally
npm run backup -- restore backup-2026-11-16.json.gz                    # dry run: counts only
npm run backup -- restore backup-2026-11-16.json.gz --tables projects --apply
```

`restore --apply` upserts rows by primary key: rows in the backup overwrite rows with the same key,
and newer rows are left alone. Restoring tasks also re-runs task triggers (an extra "created"
activity entry per task).
