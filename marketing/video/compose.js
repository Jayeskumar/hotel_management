// Deterministic renderer: window.renderAt(t) lays out frame t (seconds). No CSS animations —
// every property is computed from t, so the headless renderer can capture exact frames.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const backOut = (x) => { x = clamp(x); const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const prog = (t, a, d) => clamp((t - a) / d);
const svg = (paths, extra = '') => `<svg viewBox="0 0 24 24" ${extra}>${paths}</svg>`;

let D;
const els = {};

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function fonts(dir) {
  const ta = (w) => `@font-face{font-family:'Noto Sans Tamil';font-weight:${w};src:url('${dir}/@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-${w}-normal.woff2') format('woff2');}`;
  document.getElementById('fonts').textContent =
    `@font-face{font-family:'Inter';font-weight:100 900;src:url('${dir}/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2') format('woff2');}` +
    [400, 500, 600, 700].map(ta).join('');
}

function featureScene(s) {
  const url = s.id === 'onprem' ? 'TableWise on-premise · this PC, port 8080' : 'TableWise · Thendral — T. Nagar';
  return el(`<div class="scene" id="sc-${s.id}">
    <div class="glow"></div>
    <div class="cap">
      <div class="num">${s.num}</div>
      <div class="title" style="font-size:${s.title.length > 18 ? 52 : 60}px">${s.title}</div>
      <div class="subta ta">${s.ta}</div>
      <div class="desc">${s.desc}</div>
      <div class="chips">${s.chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
    </div>
    <div class="win">
      <div class="bar"><span class="dot" style="background:#f87171"></span><span class="dot" style="background:#fbbf24"></span><span class="dot" style="background:#34d399"></span>
        <span class="url">${svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 'width="12" height="12" style="stroke:#94a3b8"')}${url}</span></div>
      <div class="view"><img /></div>
    </div>
    ${s.receiptAfter ? `<div class="receipt"><img src="${D.invoice}"/></div>` : ''}
  </div>`);
}

function phoneScene(s) {
  return el(`<div class="scene" id="sc-${s.id}">
    <div class="glow" style="left:860px;width:900px"></div>
    <div class="cap">
      <div class="num">${s.num}</div>
      <div class="title" style="font-size:${s.title.length > 18 ? 52 : 60}px">${s.title}</div>
      <div class="subta ta">${s.ta}</div>
      <div class="desc">${s.desc}</div>
      <div class="chips">${s.chips.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
    </div>
    <div class="phone"><div class="screen"><div class="notch"></div><img /></div></div>
    <div class="badge" id="pb1" style="left:700px;top:300px">${svg(D.icons.kot)}KOT sent to kitchen</div>
    <div class="badge" id="pb2" style="left:1580px;top:640px">${svg(D.icons.lang)}<span class="ta">தமிழ்</span>&nbsp;/ English</div>
  </div>`);
}

function titleScene() {
  return el(`<div class="scene" id="sc-title"><div class="center">
    <div class="mark">${svg(D.icons.logo)}</div>
    <div class="word">${[...'TableWise'].map((c) => `<span>${c}</span>`).join('')}</div>
    <div class="tag">Restaurant management, made for India</div>
    <div class="tagta ta">உணவக மேலாண்மை — தமிழிலும் ஆங்கிலத்திலும்</div>
  </div></div>`);
}

function hookScene() {
  return el(`<div class="scene" id="sc-hook"><div class="center">
    <div class="hookline" id="h1">Every table.</div>
    <div class="hookline" id="h2">Every KOT.</div>
    <div class="hookline" id="h3">Every bill.</div>
    <div class="one" id="h4">One app.</div>
    <div class="tagta ta" id="h5" style="margin-top:6px">ஒவ்வொரு மேசை · ஒவ்வொரு KOT · ஒவ்வொரு பில் — ஒரே செயலியில்</div>
  </div></div>`);
}

const TILES = [
  ['floor', 'Floor & tables', 'மேசைகள்'], ['kot', 'Kitchen display', 'சமையலறைத் திரை'], ['gst', 'GST billing', 'GST பில்'],
  ['upi', 'UPI QR payments', 'UPI கட்டணம்'], ['lang', 'Tamil & English', 'தமிழ் & ஆங்கிலம்'], ['reports', 'Reports & GST', 'அறிக்கைகள்'],
  ['stock', 'Inventory & recipes', 'சரக்கு இருப்பு'], ['resv', 'Reservations', 'முன்பதிவுகள்'], ['branches', 'Multi-branch', 'பல கிளைகள்'],
  ['phone', 'Phones & tablets', 'போன் & டேப்லெட்'], ['server', 'Cloud or on-premise', 'கிளவுட் / உள்ளக'], ['roles', 'Staff roles & audit', 'பணியாளர் அனுமதிகள்'],
];

function recapScene() {
  return el(`<div class="scene" id="sc-recap"><div class="center">
    <div class="h2" id="rt">Everything your restaurant needs</div>
    <div class="tagta ta" id="rta">உங்கள் உணவகத்திற்குத் தேவையான அனைத்தும்</div>
    <div class="grid">${TILES.map(([ic, en, ta]) => `<div class="tile"><div class="ic">${svg(D.icons[ic])}</div><div><b>${en}</b><i class="ta">${ta}</i></div></div>`).join('')}</div>
  </div></div>`);
}

function outroScene() {
  return el(`<div class="scene" id="sc-outro"><div class="center">
    <div class="mark">${svg(D.icons.logo)}</div>
    <div class="word" style="font-size:110px">TableWise</div>
    <div class="tag">Cloud or on-premise · Tamil &amp; English</div>
    <div class="meta"><span>${svg(D.icons.windows)}Web &amp; Windows</span><span>${svg(D.icons.phone)}Phones &amp; tablets</span><span>${svg(D.icons.gst)}GST-ready</span></div>
    <div class="cta">Book a free demo</div>
    <div class="tagta ta" style="margin-top:22px">இலவச டெமோவுக்கு இன்றே தொடர்பு கொள்ளுங்கள்</div>
  </div></div>`);
}

window.init = (data) => {
  D = data;
  fonts(D.fontsDir);
  const root = document.getElementById('scenes');
  for (const s of D.scenes) {
    const node = s.kind === 'feature' ? featureScene(s) : s.kind === 'phone' ? phoneScene(s)
      : s.kind === 'title' ? titleScene() : s.kind === 'hook' ? hookScene() : s.kind === 'recap' ? recapScene() : outroScene();
    node.style.opacity = 0;
    root.appendChild(node);
    els[s.id] = node;
  }
  return document.fonts.ready.then(() => true);
};

// ---- per-scene animation
function setT(node, { x = 0, y = 0, s = 1, r = 0, o = 1 }) {
  node.style.transform = `translate(${x}px,${y}px) scale(${s}) rotate(${r}deg)`;
  node.style.opacity = o;
}

function zoomAt(s, lt) {
  let cx = 0.5, cy = 0.5, z = 1;
  for (const k of s.zoomsLocal ?? []) {
    const ramp = 0.75;
    const a = ease(prog(lt, k.from, ramp)) * (1 - ease(prog(lt, k.to - ramp, ramp)));
    if (a > 0) { z = 1 + (k.s - 1) * a; cx = 0.5 + (k.cx - 0.5) * a; cy = 0.5 + (k.cy - 0.5) * a; }
  }
  // gentle drift so static moments still feel alive
  z *= 1 + 0.02 * ease(prog(lt, 0, s.dur));
  return { cx, cy, z };
}

function frameSrc(s, lt) {
  const i = Math.min(s.frames - 1, Math.max(0, Math.floor(lt * D.fps)));
  return `${s.frameDir}/${String(i + 1).padStart(5, '0')}.jpg`;
}

function animateCaption(node, lt) {
  const parts = node.querySelectorAll('.cap > *');
  parts.forEach((p, i) => {
    const a = easeOut(prog(lt, 0.15 + i * 0.09, 0.6));
    setT(p, { x: -40 * (1 - a), o: a });
  });
  node.querySelectorAll('.chip').forEach((c, i) => {
    const a = backOut(prog(lt, 0.7 + i * 0.07, 0.45));
    setT(c, { s: 0.85 + 0.15 * a, o: clamp(a) });
  });
}

const pending = [];
function setImg(img, src) {
  if (img.getAttribute('src') !== src) { img.setAttribute('src', src); pending.push(img.decode().catch(() => {})); }
}

function renderFeature(s, node, lt) {
  animateCaption(node, lt);
  const w = node.querySelector('.win');
  const a = easeOut(prog(lt, 0.05, 0.8));
  setT(w, { y: 60 * (1 - a), s: 0.96 + 0.04 * a, o: clamp(a * 1.4) });
  const img = node.querySelector('.view img');
  const clipT = s.receiptAfter ? Math.min(lt, s.receiptAfter - 0.01) : lt;
  setImg(img, frameSrc(s, clipT));
  const { cx, cy, z } = zoomAt(s, lt);
  const W = 1200, H = 750;
  const tx = clamp(W / 2 - cx * W * z, W - W * z, 0), ty = clamp(H / 2 - cy * H * z, H - H * z, 0);
  img.style.transform = `translate(${tx}px,${ty}px) scale(${z})`;
  if (s.receiptAfter) {
    const r = node.querySelector('.receipt');
    const b = easeOut(prog(lt, s.receiptAfter - 0.4, 0.9));
    setT(r, { x: 140 * (1 - b), y: 40 * (1 - b), r: -3 + 1.5 * (1 - b), o: b });
    // dim the window behind the invoice
    w.style.filter = `brightness(${1 - 0.25 * b})`;
  }
}

function renderPhone(s, node, lt) {
  animateCaption(node, lt);
  const p = node.querySelector('.phone');
  const a = easeOut(prog(lt, 0.05, 0.9));
  setT(p, { y: 120 * (1 - a), r: 4 * (1 - a), o: clamp(a * 1.4) });
  setImg(node.querySelector('.screen img'), frameSrc(s, lt));
  const b1 = backOut(prog(lt, 1.4, 0.5)), b2 = backOut(prog(lt, 2.1, 0.5));
  setT(node.querySelector('#pb1'), { s: 0.8 + 0.2 * b1, o: clamp(b1), y: 6 * Math.sin(lt * 1.6) });
  setT(node.querySelector('#pb2'), { s: 0.8 + 0.2 * b2, o: clamp(b2), y: 6 * Math.sin(lt * 1.6 + 1.5) });
}

function renderTitle(node, lt) {
  const m = node.querySelector('.mark');
  const a = backOut(prog(lt, 0.2, 0.9));
  setT(m, { s: 0.4 + 0.6 * a, r: -12 * (1 - clamp(a)), o: clamp(a * 1.5) });
  node.querySelectorAll('.word span').forEach((sp, i) => {
    const b = easeOut(prog(lt, 0.7 + i * 0.05, 0.6));
    setT(sp, { y: 70 * (1 - b), o: b });
  });
  setT(node.querySelector('.tag'), { y: 20 * (1 - easeOut(prog(lt, 1.6, 0.7))), o: easeOut(prog(lt, 1.6, 0.7)) });
  setT(node.querySelector('.tagta'), { y: 20 * (1 - easeOut(prog(lt, 2.2, 0.7))), o: easeOut(prog(lt, 2.2, 0.7)) });
  setT(node.querySelector('.center'), { s: 1 + 0.03 * ease(prog(lt, 0, 6)) });
}

function renderHook(node, lt) {
  ['h1', 'h2', 'h3'].forEach((id, i) => {
    const a = easeOut(prog(lt, 0.2 + i * 0.55, 0.5));
    const fade = 1 - 0.55 * easeOut(prog(lt, 1.9, 0.5));
    setT(node.querySelector('#' + id), { y: 40 * (1 - a), o: a * fade });
  });
  const b = backOut(prog(lt, 2.0, 0.6));
  setT(node.querySelector('#h4'), { s: 0.7 + 0.3 * b, o: clamp(b) });
  setT(node.querySelector('#h5'), { o: easeOut(prog(lt, 2.6, 0.6)), y: 14 * (1 - easeOut(prog(lt, 2.6, 0.6))) });
}

function renderRecap(node, lt) {
  setT(node.querySelector('#rt'), { y: 30 * (1 - easeOut(prog(lt, 0.1, 0.6))), o: easeOut(prog(lt, 0.1, 0.6)) });
  setT(node.querySelector('#rta'), { o: easeOut(prog(lt, 0.4, 0.6)) });
  node.querySelectorAll('.tile').forEach((tile, i) => {
    const a = backOut(prog(lt, 0.6 + i * 0.09, 0.5));
    setT(tile, { y: 30 * (1 - clamp(a)), s: 0.9 + 0.1 * a, o: clamp(a) });
  });
}

function renderOutro(node, lt) {
  renderTitle(node, lt);
  const kids = [...node.querySelectorAll('.center > *')].slice(2);
  kids.forEach((k, i) => {
    const a = easeOut(prog(lt, 1.4 + i * 0.25, 0.6));
    setT(k, { y: 24 * (1 - a), o: a, s: k.classList.contains('cta') ? 0.9 + 0.1 * backOut(prog(lt, 1.4 + i * 0.25, 0.6)) + 0.015 * Math.sin(lt * 3) : 1 });
  });
}

window.renderAt = async (t) => {
  // background drift
  const b = (id, x, y, ax, ay, f) => { document.getElementById(id).style.transform = `translate(${x + ax * Math.sin(t * f)}px,${y + ay * Math.cos(t * f * 0.8)}px)`; };
  b('b1', -180, -260, 120, 80, 0.13);
  b('b2', 1300, 620, 140, 90, 0.11);
  b('b3', 900, -300, 160, 60, 0.09);

  for (const s of D.scenes) {
    const node = els[s.id];
    const lt = t - s.start;
    if (lt < 0 || t > s.end) { node.style.display = 'none'; continue; }
    node.style.display = 'block';
    const fadeIn = s.start === 0 ? 1 : ease(prog(lt, 0, 0.6));
    const fadeOut = 1 - ease(prog(t, s.end - 0.6, 0.6));
    node.style.opacity = Math.min(fadeIn, fadeOut);
    node.style.transform = `scale(${1 + 0.025 * (1 - fadeOut)})`;
    if (s.kind === 'feature') renderFeature(s, node, lt);
    else if (s.kind === 'phone') renderPhone(s, node, lt);
    else if (s.kind === 'title') renderTitle(node, lt);
    else if (s.kind === 'hook') renderHook(node, lt);
    else if (s.kind === 'recap') renderRecap(node, lt);
    else renderOutro(node, lt);
  }
  const all = pending.splice(0);
  await Promise.all(all);
  return true;
};
