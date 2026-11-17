// Puts the seeded demo restaurant into a "busy lunch service" state for the product video.
// Usage: node stage-data.mjs  (API on http://localhost:4000, demo seed loaded)
const API = process.env.API ?? 'http://localhost:4000/api/v1';
let token = '';
async function call(method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { ...(method === 'GET' ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const login = await call('POST', '/auth/login', { email: 'owner@demo.tablewise.app', password: 'Password123' });
token = login.accessToken;
const outlet = login.outlets[0];
const base = `/outlets/${outlet.id}`;
const { items } = await call('GET', `${base}/menu`);
const { tables } = await call('GET', `${base}/floor`);
const dish = (n) => items.find((i) => i.name === n).id;
const table = (l) => tables.find((t) => t.label === l).id;

// Completed bills earlier today.
const combos = [
  ['Ghee Roast Dosa', 'Filter Coffee'], ['Idli (2 pcs)', 'Medu Vada', 'Filter Coffee'], ['Dindigul Mutton Biryani', 'Rose Milk'],
  ['South Indian Meals', 'Curd Rice'], ['Chettinad Chicken', 'Butter Naan', 'Jigarthanda'], ['Ven Pongal', 'Masala Tea'],
  ['Chicken Biryani', 'Chicken 65'], ['Masala Dosa', 'Rava Kesari'], ['Chicken Kothu Parotta', 'Fresh Lime Soda'],
  ['South Indian Meals', 'Elaneer Payasam'], ['Tandoori Chicken (Half)', 'Butter Naan', 'Butter Naan'], ['Idli (2 pcs)', 'Filter Coffee'],
];
const methods = ['UPI', 'UPI', 'CASH', 'UPI', 'CARD', 'UPI'];
for (const [i, c] of combos.entries()) {
  const o = await call('POST', `${base}/orders`, { type: i % 3 === 0 ? 'TAKEAWAY' : i % 3 === 1 ? 'DELIVERY' : 'TAKEAWAY', customerName: ['Arun', 'Kavitha', 'Ravi', 'Meena', 'Suresh', 'Divya'][i % 6], items: c.map((n) => ({ menuItemId: dish(n), quantity: 1 + (i % 2) })) });
  await call('POST', `${base}/orders/${o.id}/fire`);
  await call('POST', `${base}/orders/${o.id}/payments`, { method: methods[i % methods.length], amountCents: o.totalCents });
}

// Open tables, mid-service.
const open = [
  ['A1', 2, ['Ghee Roast Dosa', 'Filter Coffee', 'Filter Coffee']],
  ['A2', 2, ['Masala Dosa', 'Medu Vada']],
  ['A6', 4, ['Dindigul Mutton Biryani', 'Chicken 65', 'Rose Milk', 'Jigarthanda']],
  ['N2', 3, ['South Indian Meals', 'South Indian Meals', 'Curd Rice']],
  ['N4', 4, ['Chettinad Chicken', 'Butter Naan', 'Butter Naan', 'Tandoori Chicken (Half)']],
  ['F2', 6, ['Chicken Biryani', 'Chicken Biryani', 'Ven Pongal', 'Idli (2 pcs)', 'Fresh Lime Soda']],
];
const opened = [];
for (const [label, guests, dishes] of open) {
  const o = await call('POST', `${base}/orders`, { type: 'DINE_IN', tableId: table(label), guestCount: guests, items: dishes.map((n) => ({ menuItemId: dish(n), quantity: 1 })) });
  const fired = await call('POST', `${base}/orders/${o.id}/fire`);
  opened.push({ label, order: fired });
}
// Some kitchen progress so the KDS shows a mix of states.
const progress = async (label, n, status) => {
  const o = opened.find((x) => x.label === label).order;
  for (const it of o.items.slice(0, n)) await call('POST', `${base}/kitchen/items/${it.id}/status`, { status });
};
await progress('A1', 2, 'PREPARING');
await progress('A6', 1, 'PREPARING');
await progress('N2', 3, 'PREPARING');
await call('POST', `${base}/kitchen/orders/${opened.find((x) => x.label === 'N2').order.id}/bump`, {});
await call('POST', `${base}/kitchen/orders/${opened.find((x) => x.label === 'F2').order.id}/bump`, {});
await call('PATCH', `${base}/tables/${table('N5')}/status`, { status: 'CLEANING' });
await call('PATCH', `${base}/tables/${table('A8')}/status`, { status: 'RESERVED' });
await call('PATCH', `${base}/tables/${table('F1')}/status`, { status: 'RESERVED' });
console.log(JSON.stringify(opened.map((o) => ({ label: o.label, id: o.order.id }))));
