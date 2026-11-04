// One-line lineage note after the C10 note in docs/superpowers/plans/2026-10-30-animation.md: C11 = C10 + decision 34 (the golden retune and the exemplar re-pin). Idempotent.
// Usage: node plan-doc-update-c11.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.includes('C11 = C10 + decision 34'))) { console.log('the C11 note is already recorded; nothing to do'); process.exit(0); }
const k = lines.findIndex(l => l.includes('C10 = C9 + decision 29'));
if (k < 0) throw new Error('the C10 note not found: the base must carry it');
lines.splice(k + 1, 0, '', 'Candidate lineage (4 November 2026): C11 = C10 + decision 34: the golden (the exemplar) retuned after the job-0 control rejected it (arrow scale, Full-batch step arrow and label, arrow colours, rim-consistent path); exemplar pin re-pinned (golden file ae82facb429a..., exemplar draft 9ae7fe47...); C10 CI green; golden and prompt-files hashes change; primitives check renamed slopeArrow->fullArrow.');
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('C11 note recorded');
