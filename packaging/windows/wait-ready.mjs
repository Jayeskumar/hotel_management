// Used by the installer: waits (up to 90 s) for the freshly started service to answer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let port = '8080';
try { port = fs.readFileSync(path.join(dir, 'port.txt'), 'utf8').trim() || port; } catch { /* default */ }
const deadline = Date.now() + 90_000;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    if (r.ok) process.exit(0);
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 1500));
}
process.exit(1);
