// Records owner decision 24 in docs/superpowers/plans/2026-10-30-animation.md, directly after decision 23. Idempotent: does nothing when decision 24 is
// already there. Usage: node plan-doc-update-24.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.startsWith('24. **Decision 24'))) { console.log('decision 24 is already recorded; nothing to do'); process.exit(0); }

const D24 = '24. **Decision 24 (owner, 4 November 2026).** Keep the 8-of-9 Gate 2 bar for one more cycle. C7 = C6 + the repair-slot fix for the correction ask + two `loss_surface` archetype lines (data only: the arrow scale keeps the largest typical step at the default rate under a quarter of the surface width; the camera line is "elevation 30 to 65 degrees, no azimuth, the whole surface and the path in view") + `framing.js` minimum camera elevation of 25 degrees for any scene with a surface node (the authored azimuth is kept). The golden is not changed tonight: its hash stays `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc`. Gate 2 reruns clean on C7 (all ten jobs, the guard retuned: `--typical author=45,review=20,repair=45`). Gate 1 reruns because the prompt-files hash changes. Strict tool output is parked with AN-22 as a schema-restructure item (55 optional parameters against the limit of 24); the lenient parse is the fix for now.';

const k23 = lines.findIndex(l => l.startsWith('23. **One combined fast-path release'));
if (k23 < 0) throw new Error('decision 23 not found: record it first (plan-doc-update.mjs)');
lines.splice(k23 + 1, 0, '', D24);
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('decision 24 recorded after decision 23');
