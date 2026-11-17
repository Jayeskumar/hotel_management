// Extracts the exact frames each scene needs (re-timed to its on-screen duration) and gathers
// icons + timeline data for the composition page.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FPS, layout } from './timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(here, 'build');
const clips = path.join(build, 'clips');
const framesRoot = path.join(build, 'frames');
const { scenes, total } = layout();

for (const s of scenes.filter((x) => x.clip)) {
  const dir = path.join(framesRoot, s.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const clipDur = s.receiptAfter ?? s.dur;
  const [a, b] = s.src;
  s.speed = (b - a) / clipDur;
  const width = s.kind === 'phone' ? 520 : 1800;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(a), '-t', String(b - a), '-i', path.join(clips, `${s.clip}.mp4`),
    '-vf', `setpts=(PTS-STARTPTS)/${s.speed},fps=${FPS},scale=${width}:-2:flags=lanczos`, '-q:v', '2', path.join(dir, '%05d.jpg')]);
  s.frames = fs.readdirSync(dir).length;
  s.frameDir = pathToFileURL(dir).href;
  // zooms → local on-screen time
  s.zoomsLocal = (s.zooms ?? []).map((z) => ({ ...z, from: (z.from - a) / s.speed, to: (z.to - a) / s.speed }));
  console.log(`${s.id.padEnd(10)} ${s.frames} frames  speed ×${s.speed.toFixed(2)}`);
}

const iconNames = {
  floor: 'layout-grid', kot: 'chef-hat', gst: 'receipt-text', upi: 'qr-code', lang: 'languages', reports: 'chart-column',
  stock: 'boxes', resv: 'calendar-days', branches: 'store', phone: 'smartphone', server: 'server', roles: 'shield-check',
  logo: 'utensils-crossed', windows: 'monitor-smartphone', wifi: 'wifi',
};
const icons = {};
for (const [k, name] of Object.entries(iconNames)) {
  const mod = await import(pathToFileURL(path.join(here, '../../node_modules/lucide-react/dist/esm/icons', `${name}.js`)).href);
  icons[k] = mod.__iconNode.map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).filter(([n]) => n !== 'key').map(([n, v]) => `${n}="${v}"`).join(' ')}/>`).join('');
}

const fontsDir = pathToFileURL(path.join(here, '../../node_modules')).href;
fs.writeFileSync(path.join(build, 'compose-data.json'), JSON.stringify({
  scenes, total, fps: FPS, icons, fontsDir,
  invoice: pathToFileURL(path.join(clips, 'invoice.png')).href,
}, null, 2));
console.log(`total ${total.toFixed(2)}s → ${Math.round(total * FPS)} frames`);
