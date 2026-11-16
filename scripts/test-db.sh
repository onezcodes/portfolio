#!/usr/bin/env bash
# Database permission tests. Each supabase/tests/[1-9]*.sql file runs in a fresh database
# built from supabase/tests/00_stub.sql plus every migration in order. Any FAIL raises.
#
# Needs a Postgres you can create databases in. Uses the usual PG* env vars
# (default: postgres@127.0.0.1:5432). Locally, for example:
#   PGPORT=54329 scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
psql_q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

failed=0
for test in supabase/tests/[1-9]*.sql; do
  name="$(basename "$test" .sql)"
  db="oc_test_${name}"
  psql_q -d postgres -c "drop database if exists ${db}" -c "create database ${db}" >/dev/null 2>&1
  psql_q -d "$db" -f supabase/tests/00_stub.sql >/dev/null 2>&1
  for migration in supabase/migrations/*.sql; do
    if ! out=$(psql_q -d "$db" -f "$migration" 2>&1 >/dev/null); then
      echo "✗ ${name}: migration $(basename "$migration") failed"; echo "$out"; failed=1; continue 2
    fi
  done
  echo "▸ ${name}"
  if out=$(cd supabase/tests && psql_q -d "$db" -f "$(basename "$test")" 2>&1 >/dev/null); then
    echo "$out" | grep -o 'ok: .*' | sed 's/^/  ✓ /'
  else
    echo "$out" | grep -o 'ok: .*' | sed 's/^/  ✓ /' || true
    echo "$out" | grep -E 'ERROR|FAIL|WARNING' | sed 's/^/  ✗ /'
    failed=1
  fi
  psql_q -d postgres -c "drop database if exists ${db}" >/dev/null 2>&1
done
exit $failed
