// Records every scene of the product video. Run after ./reset-demo.sh with the dev servers up.
//   node scenes.cjs [sceneName...]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { Scene, sleep } = require('./recorder.cjs');

const OUT = process.env.OUT ?? path.join(__dirname, 'build', 'clips');
const WEB = 'http://localhost:5173';
const ONPREM = 'http://localhost:8080';
const OWNER = ['owner@demo.tablewise.app', 'Password123'];
const DESK = { width: 1440, height: 900, scale: 1.5, lang: 'en' };
const only = new Set(process.argv.slice(2));
fs.mkdirSync(OUT, { recursive: true });

const scenes = {
  async dashboard(b) {
    const s = new Scene(b, OUT, 'dashboard', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.waitForSelector('text=Sales today');
    await sleep(800);
    await s.start();
    await sleep(1200);
    await s.point('text=Sales today', 900);
    await sleep(700);
    await s.point('text=Tables occupied', 700);
    await sleep(600);
    await s.point('text=Kitchen queue', 600);
    await sleep(600);
    await s.point('text=Upcoming reservations (next 4h)', 900);
    await sleep(1400);
    await s.stop();
    await s.close();
  },

  async floor_pos(b) {
    const s = new Scene(b, OUT, 'floor', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.click('nav >> text=Floor & Tables');
    await p.waitForSelector('text=AC Hall');
    await sleep(600);
    await s.start('floor');
    await sleep(900);
    await s.point('button:has-text("A1")', 800);
    await sleep(500);
    await s.point('button:has-text("N2")', 700);
    await sleep(400);
    await s.click('button:has-text("A4")');
    await p.waitForSelector('text=Seat guests & start order');
    await s.click('div[role=dialog] button:has-text("+")', { ms: 500, after: 300 });
    await s.click('div[role=dialog] button:has-text("+")', { ms: 200, after: 400 });
    await s.click('text=Seat guests & start order');
    await p.waitForSelector('text=Send KOT');
    await sleep(700);
    await s.stop();

    await s.start('pos');
    await sleep(600);
    await s.click('button:has-text("Tiffin")', { ms: 700 });
    await s.click('button:has-text("Ghee Roast Dosa")');
    await s.click('label:has-text("Extra ghee")', { ms: 500 });
    await s.click('div[role=dialog] button:has-text("Add ·")', { ms: 500, after: 600 });
    await s.click('button:has-text("Idli (2 pcs)")');
    await s.click('div[role=dialog] button:has-text("Add ·")', { ms: 500, after: 600 });
    await s.click('button:has-text("Beverages")', { ms: 600 });
    await s.click('button:has-text("Filter Coffee")');
    await s.click('label:has-text("Strong")', { ms: 500 });
    await s.click('div[role=dialog] button:has-text("Add ·")', { ms: 500, after: 600 });
    await s.click('button:has-text("Non-Veg Specials")', { ms: 600 });
    await s.click('button:has-text("Chicken 65")', { after: 800 });
    await s.point('text=CGST @ 2.5%', 800);
    await sleep(1300);
    await s.click('button:has-text("Send KOT")', { after: 1500 });
    await s.stop();
    await s.close();
  },

  async kitchen(b) {
    const s = new Scene(b, OUT, 'kitchen', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.goto(`${WEB}/kitchen`);
    await p.waitForSelector('text=Bump — all ready');
    await sleep(800);
    await s.start();
    await sleep(1500);
    await s.click('button:has-text("Tiffin / Dosa")', { ms: 800, after: 1000 });
    const dosa = p.locator('li button:has-text("Ghee Roast Dosa")').last();
    await s.click(dosa, { after: 800 });
    await s.click(dosa, { after: 700 });
    await s.click('button:has-text("All stations")', { ms: 700, after: 900 });
    await s.click(p.locator('button:has-text("Bump — all ready")').first(), { after: 1500 });
    await s.stop();
    await s.close();
  },

  async billing(b) {
    const s = new Scene(b, OUT, 'billing', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.click('nav >> text=Floor & Tables');
    await p.waitForSelector('text=AC Hall');
    await sleep(500);
    await s.start();
    await sleep(500);
    await s.click('button:has-text("N2")', { after: 900 });
    await p.waitForSelector('text=Take payment');
    await s.point('text=SGST @ 2.5%', 800);
    await sleep(900);
    await s.click('button:has-text("Take payment")', { after: 400 });
    await p.waitForSelector('img[alt="UPI QR"]');
    await sleep(600);
    await s.point('img[alt="UPI QR"]', 800);
    await sleep(1800);
    await s.click('div[role=dialog] button:has-text("Collect")', { after: 1800 });
    await s.stop();
    // Still image of the printed GST invoice for the edit.
    await p.emulateMedia({ media: 'print' });
    await p.setViewportSize({ width: 360, height: 1000 });
    await p.locator('.print-area').screenshot({ path: path.join(OUT, 'invoice.png') });
    await s.close();
  },

  async tamil(b) {
    const s = new Scene(b, OUT, 'tamil', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.click('nav >> text=Floor & Tables');
    await p.click('button:has-text("A2")');
    await p.waitForSelector('text=Send KOT');
    await sleep(800);
    await s.start();
    await sleep(1200);
    await s.click('nav >> xpath=.. >> button[role=radio]:has-text("தமிழ்")', { ms: 1100, after: 1600 });
    await s.point('button:has-text("நெய் ரோஸ்ட்")', 900);
    await sleep(700);
    await s.point('button:has-text("செட்டிநாடு சிக்கன்")', 800);
    await sleep(700);
    await s.point('text=CGST @ 2.5%', 900);
    await sleep(900);
    await s.click('nav >> text=சமையலறை (KOT)', { after: 2200 });
    await s.stop();
    await s.close();
  },

  async reports(b) {
    const s = new Scene(b, OUT, 'reports', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.goto(`${WEB}/reports`);
    await p.waitForSelector('text=GST summary');
    await sleep(1200);
    await s.start();
    await sleep(800);
    await s.click('button:has-text("30 days")', { after: 1500 });
    await s.point('text=Sales by hour of day', 700);
    await sleep(500);
    await s.scroll(520, 1500, 'main');
    await sleep(900);
    await s.scroll(420, 1300);
    await s.point('text=Taxable value', 700);
    await sleep(1600);
    await s.stop();
    await s.close();
  },

  async menu(b) {
    const s = new Scene(b, OUT, 'menu', DESK);
    const p = await s.open(WEB, ...OWNER);
    await p.goto(`${WEB}/menu`);
    await p.waitForSelector('text=Nethili Fry');
    await sleep(800);
    await s.start();
    await sleep(700);
    await s.scroll(560, 1200, 'main');
    await sleep(400);
    await s.click('button[role=switch][aria-label="Nethili Fry available"]', { after: 1200 });
    await s.click('button[role=switch][aria-label="Chicken 65 available"]', { after: 1400 });
    await s.stop();
    // restore availability for later scenes
    await p.click('button[role=switch][aria-label="Nethili Fry available"]');
    await p.click('button[role=switch][aria-label="Chicken 65 available"]');
    await sleep(500);
    await s.close();
  },

  async onprem(b) {
    const s = new Scene(b, OUT, 'onprem', DESK);
    const p = await s.open(ONPREM, 'owner@thendral.local', 'Sup3rSecret1');
    await p.goto(`${ONPREM}/settings?tab=system`);
    await p.waitForSelector('text=Connect other devices');
    // This test install runs on Linux; show what a real Windows install displays.
    await p.evaluate(() => {
      for (const el of document.querySelectorAll('code')) {
        if (el.textContent.startsWith('/')) el.textContent = 'C:\\ProgramData\\TableWise';
      }
    });
    await sleep(800);
    await s.start();
    await sleep(1000);
    await s.point('img[alt^="http"]', 900);
    await sleep(1400);
    await s.click('textarea', { ms: 900, after: 300 });
    await p.locator('textarea').fill(fs.readFileSync(path.join(__dirname, 'build', 'license.txt'), 'utf8').trim());
    await sleep(700);
    await s.click('button:has-text("Activate licence")', { after: 1800 });
    await p.evaluate(() => {
      for (const el of document.querySelectorAll('code')) {
        if (el.textContent.startsWith('/')) el.textContent = 'C:\\ProgramData\\TableWise';
      }
    });
    await s.point('text=Licensed to', 700);
    await sleep(900);
    await s.scroll(300, 700, 'main');
    await s.point('text=nightly.dump', 800);
    await sleep(1500);
    await s.stop();
    await s.close();
  },

  async phone(b) {
    const s = new Scene(b, OUT, 'phone', { width: 390, height: 844, scale: 3, lang: 'ta', mobile: true });
    const p = await s.open(WEB, 'waiter@demo.tablewise.app', 'Password123');
    await p.goto(`${WEB}/floor`);
    await p.waitForSelector('text=AC Hall');
    await sleep(800);
    await s.start();
    await sleep(1200);
    await s.click('button:has-text("A5")', { after: 700 });
    await s.click('text=அமரவைத்து ஆர்டர் தொடங்கு', { after: 1200 });
    await p.waitForSelector('text=ஆர்டர் #');
    await s.click('button:has-text("டிஃபன்")', { after: 600 });
    await s.click('button:has-text("மசாலா தோசை")', { after: 700 });
    await s.click('div[role=dialog] button:has-text("சேர் ·")', { after: 700 });
    await s.click('button:has-text("மெது வடை")', { after: 900 });
    await s.click('button:has-text("பானங்கள்")', { after: 600 });
    await s.click('button:has-text("ஃபில்டர் காபி")', { after: 700 });
    await s.click('div[role=dialog] button:has-text("சேர் ·")', { after: 900 });
    await sleep(600);
    // Scroll down to the ticket with GST and the KOT button.
    await p.evaluate(() => document.querySelector('main').scrollBy({ top: 1400, behavior: 'smooth' }));
    await sleep(1400);
    await p.evaluate(() => document.querySelector('main').scrollBy({ top: 2000, behavior: 'smooth' }));
    await sleep(1800);
    await s.stop();
    await s.close();
  },
};

(async () => {
  const b = await chromium.launch();
  for (const [name, fn] of Object.entries(scenes)) {
    if (only.size && !only.has(name)) continue;
    console.log(`▶ ${name}`);
    await fn(b);
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
