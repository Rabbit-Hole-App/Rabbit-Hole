// One-line lineage note after the C8 note (or after decision 24) in docs/superpowers/plans/2026-10-30-animation.md: C9 = C8 + evidence + the owner's C9 list. Idempotent.
// Usage: node plan-doc-update-c9.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.includes('C9 = C8 + evidence'))) { console.log('the C9 note is already recorded; nothing to do'); process.exit(0); }
let k = lines.findIndex(l => l.includes('C8 = C7 + FX-AN-098'));
if (k < 0) k = lines.findIndex(l => l.startsWith('24. **Decision 24'));
if (k < 0) throw new Error('neither the C8 note nor decision 24 found: the base must carry one');
lines.splice(k + 1, 0, '', 'Candidate lineage (4 November 2026): C9 = C8 + evidence + the owner\'s C9 list: the gate evidence for C3\', C4, C6 and C7 (docs only, `docs/features/animation/evidence/`), camera floor 35 degrees, label caps and hiding a label when its arrow is too short, trail polylines as label obstacles, a ball-under-the-surface check, stripping fields that are irrelevant to the object kind, a trail-every-step archetype line, `pathLength` at the default step count, and the review role at 8,000 output tokens (decision 28). The prompt-files hash changes with it; the golden hash `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc` does not.');
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('C9 note recorded');
