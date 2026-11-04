// One-line lineage note after the C9 note in docs/superpowers/plans/2026-10-30-animation.md: C10 = C9 + decision 29 azimuth line + decision 30 rim hold + label distance cap + primitives-check CI fix; platform day cap raised on the clone (decision 31). Idempotent.
// Usage: node plan-doc-update-c10.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.includes('C10 = C9 + decision 29'))) { console.log('the C10 note is already recorded; nothing to do'); process.exit(0); }
let k = lines.findIndex(l => l.includes('C9 = C8 + evidence'));
if (k < 0) throw new Error('the C9 note not found: the base must carry it');
lines.splice(k + 1, 0, '', 'Candidate lineage (4 November 2026): C10 = C9 + decision 29 azimuth line + decision 30 rim hold + label distance cap + primitives-check CI fix; platform day cap raised on the clone (decision 31); primitives-check fix: identical-frame redraw skip in session.js (FX-AN-107), fail-fast check. The prompt-files hash changes with the archetype file; the golden hash `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc` does not.');
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('C10 note recorded');
