// Renders compose.html frame by frame into an H.264 video (no audio).
//   node render.cjs                       full video → build/video-silent.mp4
//   node render.cjs --stills 3,12,40      review stills → build/stills/
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const build = path.join(__dirname, 'build');
const data = JSON.parse(fs.readFileSync(path.join(build, 'compose-data.json'), 'utf8'));
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto('file://' + path.join(__dirname, 'compose.html'));
  await page.evaluate((d) => window.init(d), data);

  if (stillsArg) {
    const dir = path.join(build, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of stillsArg.split(',').map(Number)) {
      await page.evaluate((x) => window.renderAt(x), t);
      await page.screenshot({ path: path.join(dir, `t${String(t).padStart(6, '0')}.png`) });
    }
    console.log(`stills → ${dir}`);
    await browser.close();
    return;
  }

  const frames = Math.round(data.total * data.fps);
  const out = path.join(build, 'video-silent.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(data.fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((x) => window.renderAt(x), i / data.fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`  frame ${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log(`✔ ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
