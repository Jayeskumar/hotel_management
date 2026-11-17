#!/usr/bin/env bash
# Starts the demo servers for filming with the clock shifted to 12:35 pm IST (lunch service).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
read -r OFFSET VNOW < <(node virtual-now.mjs)
echo "$OFFSET $VNOW" > build/now.txt
LOG=${LOG_DIR:-build}
pkill -f "src/main.ts" || true
pkill -f "node server.mjs run" || true
sleep 1
FAKE=$(pwd)/fake-now.mjs
(cd ../../apps/api && FAKE_NOW_OFFSET_MS=$OFFSET NODE_OPTIONS="--import $FAKE" nohup npx tsx --env-file=.env src/main.ts > "$OLDPWD/$LOG/api.log" 2>&1 < /dev/null &)
pgrep -f "vite --port 5173" >/dev/null || (cd ../../apps/web && nohup npx vite --port 5173 > "$OLDPWD/$LOG/web.log" 2>&1 < /dev/null &)
if [ -d /opt/tw-onprem-test/app ]; then
  chmod 755 "$(pwd)" && cp fake-now.mjs /opt/tw-onprem-test/fake-now.mjs && chown postgres /opt/tw-onprem-test/fake-now.mjs
  su postgres -s /bin/bash -c "cd /opt/tw-onprem-test/app && FAKE_NOW_OFFSET_MS=$OFFSET NODE_OPTIONS='--import /opt/tw-onprem-test/fake-now.mjs' TABLEWISE_DATA=/opt/tw-onprem-test/data PG_BIN=/usr/lib/postgresql/16/bin nohup node server.mjs run > /opt/tw-onprem-test/run-video.log 2>&1 < /dev/null &" > /dev/null 2>&1
fi
for i in $(seq 1 30); do curl -sf localhost:4000/ready >/dev/null && break; sleep 1; done
echo "Servers up. Virtual now: $VNOW"
