// Records owner decision 23 and the evening order change in docs/superpowers/plans/2026-10-30-animation.md (decision list, section 6, the ladder table,
// the order list and AN-21). Idempotent: does nothing when decision 23 is already there. Usage: node plan-doc-update.mjs <path to the plan>
import fs from 'node:fs';
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));
if (lines.some(l => l.startsWith('23. **One combined fast-path release'))) { console.log('decision 23 is already recorded; nothing to do'); process.exit(0); }

const D23 = '23. **One combined fast-path release (owner, 3 November 2026).** One combined fast-path release carries MVP2b, MVP3, MVP4 and MVP5 after the `--mvp` branch and both gates pass. There is no separate MVP2b or MVP3 release. There is one integration branch and `main` is merged once, at the end. Gate 2 starts the moment MVP4\'s preview is up. If Gate 1 fails, the whole candidate is held and fixed; nothing partial ships. **Order change (owner, 3 November 2026, evening):** the final tree is one, so C4 = C5: the prompts, the harness, the AN-21 scripts, the copy-and-claim commit, the smoke and recovery tooling and the recovery-branch cut are all in it. Its isolated dev-clone preview is deployed immediately after the push, before CI is green, and both gates start on it; **the gates stand only if CI is green on that SHA.** Gates run on that preview of a frozen candidate (decision 21); they do not wait for the release.';
const S6 = '**Release plan as of decision 23.** MVP2b, MVP3, MVP4 and MVP5 are not released one by one: they ship together as one fast-path release carrying the final tree (C4 = C5, see decision 23), after the `--mvp` branch has landed and Gate 1 and Gate 2 have passed on its frozen candidate\'s preview. The rows above keep their task content and acceptance; read their "release" cells through this paragraph.';
const LADDER = 'Release mode, decision 23: MVP2b, MVP3, MVP4 and MVP5 are one combined fast-path release carrying one final tree. The ordinary gate applies to MVP2a and to the `--mvp` branch; the combined release is the fast path after both gates pass; `main` is merged once.';
const ORDER6 = '6. Owner order of 3 November 2026 (evening, decision 23): MVP2a releases first (ordinary gate), then the `--mvp` branch (ordinary gate, owner `!` command), then ONE fast-path release carrying MVP2b, MVP3, MVP4 and MVP5 together. The final tree is one (C4 = C5). Its preview is deployed right after the push, before CI is green, and both gates start on it; they stand only if CI is green on that SHA. If Gate 1 fails, the whole candidate is held; nothing partial ships.';
const AN21_RELEASE = ' Under decision 23 this is the single combined release (MVP2b to MVP5 together), run after both gates pass on the preview of the frozen final tree and after the `--mvp` branch has landed; `main` is merged once.';
const AN21_PRODUCT = ' The copy-and-claim commit (product copy only: the "not supported yet" line removed, the loss-surface line added) is part of the final tree (C4 = C5), not a later commit.';

const find = (pred, what) => { const k = lines.findIndex(pred); if (k < 0) throw new Error(`anchor not found: ${what}`); return k; };
const kD22 = find(l => l.startsWith('22. **Gate 1 carry-over rule'), 'decision 22');
const kDo = find(l => l.startsWith('Do not save all pushes for milestones'), 'section 6 closing paragraph');
const kL = find(l => l.startsWith('| MVP5 | AN-21 |'), 'ladder table MVP5 row');
const kO5 = find(l => l.startsWith("5. MVP4's candidate"), 'order item 5');
const kRel = find(l => l.startsWith('- [ ] Release: the candidate through `verify`'), 'AN-21 release bullet');
const kProd = find(l => l.startsWith('- [ ] Product: remove the "not yet supported" copy'), 'AN-21 product bullet');

// Apply from the bottom up so earlier indexes stay valid.
lines[kProd] += AN21_PRODUCT;
lines[kRel] += AN21_RELEASE;
lines.splice(kO5 + 1, 0, ORDER6);
lines.splice(kL + 1, 0, '', LADDER);
lines.splice(kDo, 0, S6, '');
lines.splice(kD22 + 1, 0, '', D23);
fs.writeFileSync(file, lines.join(crlf ? '\r\n' : '\n'));
console.log('decision 23 recorded: decision list, section 6, ladder table, order list, AN-21 release and product bullets');
