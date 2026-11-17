# Product video

A ~1:47 product intro for TableWise, made entirely from the real app:

* **Screen recordings** of the running app (Chrome DevTools screencast at 1.5× resolution with a drawn cursor
  and click ripples) — `recorder.cjs`, `scenes.cjs`
* **Motion graphics** — title, kinetic "One app." hook, captions with Tamil subtitles, browser and phone frames,
  camera zooms onto GST / UPI / licence details, feature recap and call-to-action — rendered frame by frame
  in Chromium from `compose.html` + `compose.js`, laid out by `timeline.mjs`
* **Original music** synthesised from scratch (100 BPM, D major, plucked strings, bansuri-style flute,
  tabla-flavoured percussion, scene whooshes) — `music.py`. No third-party audio, so no licensing issues.

## Regenerate

Needs Postgres, the dev setup from the main README, ffmpeg and Python 3 with numpy.

```bash
./make-video.sh            # everything: record + edit + mux (≈15 min)
./make-video.sh edit       # re-edit from existing recordings (captions, timing, music)
./make-video.sh mux        # only re-mux video + music
```

The demo is filmed at 12:35 pm IST whatever the real time is: `start-servers.sh` shifts the clock of the
demo servers and the recording browser (`fake-now.mjs`, `virtual-now.mjs`) so the dashboard shows a
lunch service. This only affects the video tooling, never the product.

Edit captions, durations and zooms in `timeline.mjs`. The on-premise scene uses the bundled on-prem
server (see docs/ONPREM.md) on port 8080.
