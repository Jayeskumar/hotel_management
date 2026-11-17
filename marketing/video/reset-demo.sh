#!/usr/bin/env bash
# Rebuilds the demo database and stages it for recording. Needs the API dev server running.
set -euo pipefail
cd "$(dirname "$0")"
su postgres -c "psql -qc \"select pg_terminate_backend(pid) from pg_stat_activity where datname='tablewise' and pid <> pg_backend_pid()\" -c 'drop database if exists tablewise' -c 'create database tablewise owner tablewise'" >/dev/null
(cd ../../apps/api && DATABASE_URL=postgres://tablewise:tablewise@localhost:5432/tablewise npx tsx src/db/seed.ts | tail -1)
node stage-data.mjs >/dev/null
VNOW=$(cut -d' ' -f2 build/now.txt)
PGPASSWORD=tablewise psql -h localhost -U tablewise tablewise -q -v vnow="$VNOW" -f age-data.sql
echo "Demo staged."
