#!/usr/bin/env bash
# Creates real backups on the on-prem test install and dates them like the last three nightly runs.
set -euo pipefail
D=/opt/tw-onprem-test/data/backups
ENV="TABLEWISE_DATA=/opt/tw-onprem-test/data PG_BIN=/usr/lib/postgresql/16/bin"
rm -f "$D"/*
for n in 3 2 1; do
  f=$(su postgres -s /bin/bash -c "cd /opt/tw-onprem-test/app && $ENV node server.mjs backup" | tail -1)
  day=$(TZ=Asia/Kolkata date -d "-$n day" +%Y%m%d)
  mv "$f" "$D/tablewise-$day-230000-nightly.dump"
  TZ=Asia/Kolkata touch -d "$(TZ=Asia/Kolkata date -d "-$n day" +%Y-%m-%d) 23:00:12" "$D/tablewise-$day-230000-nightly.dump"
  sleep 1
done
ls -la "$D"
