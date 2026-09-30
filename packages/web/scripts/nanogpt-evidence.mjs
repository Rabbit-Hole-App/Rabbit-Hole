// Print the nanogpt-deep-dive evidence table (markdown) from what the code
// and the browser run actually say: each card module's `evidence` export,
// plus e2e/shots/nanogpt/results.json from e2e/nanogpt-board-check.mjs.
//   node scripts/nanogpt-evidence.mjs > evidence.md
import { existsSync, readFileSync } from 'node:fs';
import { NANOGPT_FIRST_BATCH } from '../src/nanogpt/board.js';

const runPath = new URL('../e2e/shots/nanogpt/results.json', import.meta.url);
const run = existsSync(runPath) ? JSON.parse(readFileSync(runPath, 'utf8')) : null;
const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

if (run) console.log(`Browser run: ${run.boardUrl} — bundle \`${run.bundle}\`, seed s${run.seed}\n`);
console.log('| # | Card | Concept | Source revision | Provenance | Control | Consequence | Interaction purpose | Task | Capability exercised | Browser-verified |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const { scene, evidence: e } of NANOGPT_FIRST_BATCH) {
  const seen = run?.cards.find(c => c.card === scene.id);
  const browser = seen
    ? (seen.afterInputs ? `drove ${cell(JSON.stringify(seen.afterInputs))}; ${seen.after.length} line(s) changed; reset restored; chat context sent` : cell(seen.note))
    : 'not run';
  console.log(`| ${e.card} | ${cell(e.title)} | ${cell(e.concept)} | ${cell(e.sourceRevision)} | ${cell(e.provenance)} | ${cell(e.control)} | ${cell(e.consequence)} | ${cell(e.interactionPurpose)} | ${cell(e.task)} | ${cell(e.capability)} | ${browser} |`);
}
if (run?.practice) {
  const p = run.practice;
  console.log(`\nPractice (${p.card}): answered the final checkpoint (${p.wrongAnswer}) → graded wrong: “${cell(p.wrongFeedback)}”; answered ${p.rightAnswer} → passed: “${cell(p.rightFeedback)}”.`);
}
