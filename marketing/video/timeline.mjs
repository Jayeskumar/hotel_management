// The edit: every scene, its duration, which clip/range it uses, captions and camera moves.
// Times for `src`/`zooms` are in seconds of the recorded clip; `dur` is on-screen seconds.
export const FPS = 30;
export const OVERLAP = 0.6; // cross-fade between consecutive scenes

export const scenes = [
  { id: 'title', kind: 'title', dur: 6.0 },
  { id: 'hook', kind: 'hook', dur: 4.2 },
  {
    id: 'dashboard', kind: 'feature', dur: 7.0, clip: 'dashboard', src: [0.6, 8.4],
    title: 'Live dashboard', ta: 'நேரடி முகப்பு',
    desc: 'See the whole restaurant at a glance, updated the moment anything changes.',
    chips: ["Today's sales", 'Open orders', 'Table occupancy', 'Kitchen queue'],
  },
  {
    id: 'floor', kind: 'feature', dur: 7.4, clip: 'floor', src: [0.4, 10.4],
    title: 'Floor & tables', ta: 'மேசை நிர்வாகம்',
    desc: 'Every table with its status and running time. Seat guests in one tap.',
    chips: ['Live table status', 'Running timers', 'Dine-in · Parcel · Delivery'],
  },
  {
    id: 'pos', kind: 'feature', dur: 14.0, clip: 'pos', src: [0.3, 24.0],
    title: 'Fast ordering', ta: 'வேகமான ஆர்டர்',
    desc: 'Dishes in Tamil and English, add-ons and kitchen notes. GST is calculated for you.',
    chips: ['Tamil + English dishes', 'Add-ons & notes', 'CGST + SGST auto', 'Round-off'],
    zooms: [{ from: 18.6, to: 22.4, cx: 0.84, cy: 0.71, s: 1.85 }],
  },
  {
    id: 'kitchen', kind: 'feature', dur: 8.6, clip: 'kitchen', src: [0.8, 11.6],
    title: 'Kitchen display (KOT)', ta: 'சமையலறைத் திரை',
    desc: 'KOTs land on the right counter instantly, coloured by how long they have waited.',
    chips: ['Counter-wise KOTs', 'Colour = waiting time', 'Tap to update'],
  },
  {
    id: 'billing', kind: 'feature', dur: 12.6, clip: 'billing', src: [0.4, 11.8], receiptAfter: 9.2,
    title: 'GST billing with UPI', ta: 'UPI உடன் GST பில்',
    desc: 'A UPI QR with the exact amount, split payments, and a proper GST tax invoice.',
    chips: ['UPI QR, exact amount', 'Split payments', 'GSTIN + FSSAI invoice'],
    zooms: [{ from: 6.8, to: 10.6, cx: 0.5, cy: 0.47, s: 1.7 }],
  },
  {
    id: 'tamil', kind: 'feature', dur: 9.0, clip: 'tamil', src: [0.8, 14.6],
    title: 'Tamil ⇄ English, instantly', ta: 'தமிழ் ⇄ ஆங்கிலம்',
    desc: 'Every screen, bill and message in both languages. Each counter picks its own.',
    chips: ['Every screen', 'Every bill', 'Per-device language'],
    zooms: [{ from: 4.6, to: 9.6, cx: 0.42, cy: 0.38, s: 1.3 }],
  },
  {
    id: 'phone', kind: 'phone', dur: 9.0, clip: 'phone', src: [0.8, 15.0],
    title: 'Orders from any phone', ta: 'போனிலேயே ஆர்டர்',
    desc: 'Waiters take orders at the table on their phone. Kitchen screens run on tablets.',
    chips: ['Waiter phones', 'Kitchen tablets', 'Same live data'],
  },
  {
    id: 'reports', kind: 'feature', dur: 8.4, clip: 'reports', src: [0.6, 14.4],
    title: 'Reports & GST summary', ta: 'அறிக்கைகள் & GST சுருக்கம்',
    desc: 'Sales by day and hour, top dishes, staff performance and GST totals for filing.',
    chips: ['Sales & top dishes', 'Staff performance', 'GSTR-ready totals', 'CSV export'],
  },
  {
    id: 'menu', kind: 'feature', dur: 5.8, clip: 'menu', src: [0.5, 8.6],
    title: 'Menu & stock', ta: 'மெனு & சரக்கு இருப்பு',
    desc: 'Mark a dish sold out in one tap. Recipes deduct stock with every sale.',
    chips: ['Sold-out in one tap', 'Recipe-based stock', 'Low-stock alerts'],
  },
  {
    id: 'onprem', kind: 'feature', dur: 10.0, clip: 'onprem', src: [0.6, 14.8],
    title: 'Cloud or on-premise', ta: 'கிளவுட் அல்லது உள்ளக நிறுவல்',
    desc: 'Install on a Windows PC in the restaurant. Works on your own network, no internet needed.',
    chips: ['Windows installer', 'Runs on your LAN', 'Nightly backups', 'Offline licence'],
    zooms: [{ from: 1.6, to: 4.6, cx: 0.74, cy: 0.55, s: 1.6 }, { from: 8.4, to: 12.6, cx: 0.37, cy: 0.46, s: 1.55 }],
  },
  { id: 'recap', kind: 'recap', dur: 6.2 },
  { id: 'outro', kind: 'outro', dur: 6.8 },
];

/** Adds start times (with cross-fade overlaps) and numbering. */
export function layout() {
  let t = 0;
  let n = 0;
  const out = scenes.map((s, i) => {
    const start = i === 0 ? 0 : t - OVERLAP;
    t = start + s.dur;
    const num = s.kind === 'feature' || s.kind === 'phone' ? String(++n).padStart(2, '0') : null;
    return { ...s, start, end: start + s.dur, num };
  });
  return { scenes: out, total: t };
}
