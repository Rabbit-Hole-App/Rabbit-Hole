// One-line lineage note after decision 24 in docs/superpowers/plans/2026-10-30-animation.md: C8 = C7 + FX-AN-098. Idempotent.
// Usage: node plan-doc-update-c8.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.includes('C8 = C7 + FX-AN-098'))) { console.log('the C8 note is already recorded; nothing to do'); process.exit(0); }
const k24 = lines.findIndex(l => l.startsWith('24. **Decision 24'));
if (k24 < 0) throw new Error('decision 24 not found: the base must carry it');
lines.splice(k24 + 1, 0, '', 'Candidate lineage (4 November 2026): C8 = C7 + FX-AN-098, the review page\'s readout strip no longer drops text readouts (`card.js` `readoutLines`, `animation3d-render.js` `showOverlay`), so the reviewers see the Status word. No prompt file changed; the golden is unchanged.');
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('C8 note recorded after decision 24');
