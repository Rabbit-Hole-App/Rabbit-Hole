// GEN-1 R3 bench plan: BEFORE = the release 165 tree (feat/release-165 a42d5e0f1), AFTER = that + R3 only (feat/gen-1-r3). 15 on-topic questions x 3 seeds, 7 numeric questions x 3 seeds, both arms (google-low);
// the 29 R3-pre cells once, AFTER only. Offline: reports for every on-topic question whether its steer is exact.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const TREE = 'C:/s/gen1-r3-trees/after/packages/control-plane/src/';
const cells = JSON.parse(fs.readFileSync('C:/s/gen1-r3pre/cells.json', 'utf8'));
const ontopic = [
  'how do I compute the Gini impurity on both sides of a split and the information gain?', 'how does a random forest combine the predictions of its trees into one answer?',
  'compare impurity-based feature importance with permutation importance when one feature is random noise', 'How does voting combine several weak classifiers?',
  'How does the transformer decoder avoid looking ahead at later words?', 'What does a logarithmic axis do to a skewed positive feature?', 'How can learning curves show whether more data may help?',
  'How do bias, variance and noise contribute to expected squared error?', 'How do positive and negative residual corrections change an ensemble?', 'How do grid search and random search cover a hyperparameter space?',
  'How can predicted probabilities be checked for calibration?', 'How should I read an ACF stem plot?', 'Why should feature-selection stability be measured across resamples?',
  'Explain binary search tree and bst and insertion to me', 'Explain folder and directory and file hierarchy to me',
];
const numeric = [
  'what does softmax do?', 'Explain quartiles, IQR fences, whiskers and outliers on one scale.', 'How do IQR fences flag outliers in a box plot? Use the data 3, 5, 6, 7, 8, 9, 11, 12, 40.',
  'Show two histograms comparing raw and log-transformed values.', 'What happens to a skewed distribution when we take logs?', 'what does a bootstrap sample of the training rows look like, and which rows repeat?',
  'Can you show the numbers when forward diffusion adds known noise to a latent?',
];
const { selectWithSteer } = await import(pathToFileURL(TREE + 'explanation-references.js').href);
const log = console.log; console.log = () => {};
const steers = ontopic.map(q => { const s = selectWithSteer({ prompt: q, requiredKinds: [], plannedKinds: [], shapeFallback: false, depth: 'balanced' }).steer; return { q: q.slice(0, 60), id: s?.id ?? null, kind: s?.kind ?? null, exact: s?.exact ?? null }; });
console.log = log;
const items = []; let idx = 0;
const add = o => items.push({ idx: idx++, depth: 'balanced', profile: 'google-low', ...o });
const q = [...ontopic.map((p, i) => ({ set: 'ontopic', tag: `O${i + 1}`, prompt: p })), ...numeric.map((p, i) => ({ set: 'numeric', tag: `U${i + 1}`, prompt: p }))];
for (const rep of [1, 2, 3]) for (const x of q) add({ ...x, rep });
for (const c of cells) add({ set: 'r3pre', tag: `C${c.cell}`, prompt: c.prompt, depth: c.depth, rep: 1, arms: ['after'] });
fs.writeFileSync('C:/s/sprint2-evidence/gen1-r3-bench/plan.json', JSON.stringify({ meta: { onTopic: ontopic.length, numeric: numeric.length, r3pre: cells.length, items: items.length, runs: items.reduce((s, i) => s + (i.arms ? i.arms.length : 2), 0), steers }, items }, null, 1));
console.log('items', items.length, 'runs', items.reduce((s, i) => s + (i.arms ? i.arms.length : 2), 0));
console.log('on-topic steers (exact?):', steers.map(s => `${s.id ?? 'NONE'}${s.exact ? '' : s.id ? ' (not exact)' : ''}`).join(' | '));
