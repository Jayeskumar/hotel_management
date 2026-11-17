#!/usr/bin/env bash
# Builds the TableWise product video end to end:
#   1. demo servers at "lunch time"   2. staged demo data   3. screen recordings
#   4. frame extraction               5. music               6. frame-by-frame render   7. final mux
# Output: build/TableWise-Product-Video.mp4 (1920x1080, 30 fps, H.264 + AAC) and a poster image.
set -euo pipefail
cd "$(dirname "$0")"
STEP=${1:-all}

if [[ $STEP == all || $STEP == record ]]; then
  ./start-servers.sh
  ./reset-demo.sh
  [ -d /opt/tw-onprem-test ] && ./stage-backups.sh >/dev/null
  node scenes.cjs
fi
if [[ $STEP == all || $STEP == record || $STEP == edit ]]; then
  node prepare.mjs
  python3 music.py
  node render.cjs
fi
ffmpeg -y -loglevel error -i build/video-silent.mp4 -i build/music.wav \
  -filter:a "loudnorm=I=-14:TP=-1.5:LRA=11" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart \
  build/TableWise-Product-Video.mp4
ffmpeg -y -loglevel error -ss 3.2 -i build/video-silent.mp4 -frames:v 1 -q:v 2 build/TableWise-Poster.jpg
echo "✔ build/TableWise-Product-Video.mp4"
