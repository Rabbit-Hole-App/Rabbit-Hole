// Builds plan.json for the FALLBACKS BATCH bench: 11 prompt x depth cells x 3 reps, each item run on BEFORE (main 9531b382f) and AFTER (feat/fallbacks-batch tip).
// tags: gem-s1 = the GEM-S1 rerun cells (gem-s1/rerun-plan.json), simp-1 = the 6 fallback cells of card-numbers/section-6/fallback-trace/fallback-cards.md + 'compare a stack and a queue' (scripts/explain-bench/sets/baseline.json id stack-vs-queue),
// new = forward diffusion at brief and detailed (no gpt-oss evidence).
import fs from 'node:fs';
const DEC = 'How does the transformer decoder avoid looking ahead at later words?', DIFF = 'Can you show the numbers when forward diffusion adds known noise to a latent?', GINI_SPLIT = 'how do I compute the Gini impurity on both sides of a split and the information gain?';
const cells = [
  [DEC, 'balanced', ['gem-s1', 'simp-1']], [DEC, 'detailed', ['gem-s1', 'simp-1']],
  [DIFF, 'balanced', ['gem-s1', 'simp-1']], [DIFF, 'brief', ['new']], [DIFF, 'detailed', ['new']],
  [GINI_SPLIT, 'balanced', ['gem-s1']], ['what is gini impurity', 'brief', ['simp-1']],
  ['what is gradient descent?', 'brief', ['simp-1']], ['what is a learning rate schedule?', 'brief', ['simp-1']],
  ['compare a stack and a queue', 'balanced', ['simp-1']], ['compare a stack and a queue', 'brief', ['simp-1']],
];
const REPS = 3, items = [];
for (let rep = 1; rep <= REPS; rep++) cells.forEach(([prompt, depth, tags], c) => items.push({ idx: items.length + 1, set: tags[0], tags, cell: c + 1, prompt, depth, rep })); // rep-major: a provider drift hits every cell alike
fs.writeFileSync(new URL('plan.json', import.meta.url), JSON.stringify({ meta: { before: 'main 9531b382f6d2735393a7f9b3c7d82988007d1327', after: 'feat/fallbacks-batch tip', cells: cells.length, reps: REPS, runs: items.length * 2 }, items }, null, 1));
console.log('cells', cells.length, 'items', items.length, 'runs', items.length * 2);
