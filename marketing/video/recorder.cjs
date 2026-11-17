// High-quality scene recorder: Chrome DevTools screencast frames (not Playwright's low-bitrate
// video) + an injected cursor with click ripples, assembled into constant-30fps H.264 clips.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CURSOR_JS = `
(() => {
  const install = () => {
    if (document.getElementById('__tw_cursor')) return;
    const c = document.createElement('div');
    c.id = '__tw_cursor';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13.5 26 L17 24.5 L13 15.8 L20.5 15.5 Z" fill="#111827" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transition: 'none' });
    document.documentElement.appendChild(c);
    const style = document.createElement('style');
    style.textContent = '@keyframes __twr{from{transform:translate(-50%,-50%) scale(.2);opacity:.65}to{transform:translate(-50%,-50%) scale(1);opacity:0}}';
    document.documentElement.appendChild(style);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(20,184,166,.45)', border: '2px solid rgba(13,148,136,.9)', zIndex: 2147483646, pointerEvents: 'none', animation: '__twr .55s ease-out forwards' });
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Scene {
  constructor(browser, outDir, name, { width, height, scale, lang, mobile }) {
    Object.assign(this, { browser, outDir, name, width, height, scale, lang, mobile });
    this.frames = [];
    this.cursor = { x: width * 0.6, y: height * 0.55 };
  }

  async open(baseUrl, email, password) {
    this.context = await this.browser.newContext({
      viewport: { width: this.width, height: this.height }, deviceScaleFactor: this.scale, timezoneId: 'Asia/Kolkata', locale: 'en-IN',
      isMobile: !!this.mobile, hasTouch: !!this.mobile,
    });
    await this.context.addInitScript(`try{localStorage.setItem('tw.lang','${this.lang}')}catch(e){}`);
    // Film at "lunch time": same clock shift as the demo servers (see start-servers.sh).
    const nowFile = path.join(__dirname, 'build', 'now.txt');
    if (fs.existsSync(nowFile)) {
      const offset = Number(fs.readFileSync(nowFile, 'utf8').split(' ')[0]);
      await this.context.clock.install({ time: new Date(Date.now() + offset) });
    }
    await this.context.addInitScript(this.mobile ? CURSOR_JS.replace("addEventListener('mousedown'", "addEventListener('pointerdown'") : CURSOR_JS);
    if (this.mobile) await this.context.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#__tw_cursor{display:none!important}';document.head.appendChild(s)})`);
    this.page = await this.context.newPage();
    await this.page.goto(baseUrl);
    await this.page.fill('input[type=email]', email);
    await this.page.fill('input[type=password]', password);
    await this.page.click('button[type=submit]');
    await this.page.waitForSelector('main');
    await this.page.mouse.move(this.cursor.x, this.cursor.y);
    return this.page;
  }

  async start(name = this.name) {
    this.name = name;
    this.frames = [];
    const dir = path.join(this.outDir, this.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.cdp = await this.context.newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async (f) => {
      const file = path.join(dir, `f${String(this.frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push({ file, t: f.metadata.timestamp });
      await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 92, everyNthFrame: 1,
      maxWidth: Math.round(this.width * this.scale), maxHeight: Math.round(this.height * this.scale),
    });
    // Force an initial frame even if nothing changes.
    await this.page.evaluate(() => { document.body.style.outline = '0px solid transparent'; });
    await sleep(300);
    this.t0 = Date.now() / 1000;
  }

  async stop() {
    const tEnd = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast');
    await sleep(200);
    await this.cdp.detach().catch(() => {});
    if (!this.frames.length) throw new Error(`${this.name}: no frames captured`);
    // concat list with real per-frame durations, then resample to constant 30 fps.
    const lines = [];
    this.frames.forEach((fr, i) => {
      const next = i + 1 < this.frames.length ? this.frames[i + 1].t : tEnd;
      lines.push(`file '${fr.file}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
    });
    lines.push(`file '${this.frames[this.frames.length - 1].file}'`);
    const list = path.join(this.dir, 'list.txt');
    fs.writeFileSync(list, lines.join('\n'));
    const out = path.join(this.outDir, `${this.name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `fps=30,scale=${Math.round(this.width * this.scale / 2) * 2}:-2:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', out]);
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
    console.log(`  ${this.name}: ${this.frames.length} frames → ${dur.toFixed(1)}s`);
    return out;
  }

  async close() {
    await this.context.close();
  }

  // ---------- human-like actions
  async moveTo(x, y, ms = 650) {
    const steps = Math.max(8, Math.round(ms / 16));
    const { x: x0, y: y0 } = this.cursor;
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await sleep(ms / steps);
    }
    this.cursor = { x, y };
  }

  async point(locator, ms) {
    const l = typeof locator === 'string' ? this.page.locator(locator).first() : locator;
    await l.waitFor({ state: 'visible' });
    await l.scrollIntoViewIfNeeded();
    const b = await l.boundingBox();
    await this.moveTo(b.x + b.width / 2, b.y + b.height / 2, ms);
    return l;
  }

  async click(locator, { ms = 650, after = 450 } = {}) {
    if (this.mobile) {
      const l = typeof locator === 'string' ? this.page.locator(locator).first() : locator;
      await l.waitFor({ state: 'visible' });
      await sleep(250);
      await l.tap();
      await sleep(after);
      return;
    }
    await this.point(locator, ms);
    await sleep(120);
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
    await sleep(after);
  }

  async type(text, delay = 70) {
    await this.page.keyboard.type(text, { delay });
  }

  async scroll(dy, ms = 1400, selector) {
    const steps = Math.round(ms / 16);
    if (selector) {
      const b = await this.page.locator(selector).first().boundingBox();
      if (b) await this.moveTo(b.x + b.width / 2, Math.min(b.y + b.height / 2, this.height * 0.6), 300);
    }
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps);
      await sleep(16);
    }
  }
}

module.exports = { Scene, sleep };
