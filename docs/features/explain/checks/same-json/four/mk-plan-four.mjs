// M1 measurement plan (the reviewer's order): the four declared references and top-k (parked: expected "as MAIN" on BRANCH), each asked by its own first prompt at Brief, Balanced and
// Detailed, five asks each = 75 asks per arm (arm "before" = main b29b6bdd7, arm "after" = the branch tip); then two asks per declared reference on the fallback model (profile fireworks-low),
// arm "after" only = 8 runs. Same prompts and seed scheme as the full build (bench-<idx>-<rep>).
import fs from 'node:fs';
const P = [
  { tag: 'top-k', refId: 'ml-sampling-top-k', prompt: 'Does top-k filtering affect the reported probability of the chosen token?' },
  { tag: 'softmax-probabilities', refId: 'softmax-probabilities', prompt: 'How do softmax probabilities compare two multiclass predictions?' },
  { tag: 'regression-mean-baseline', refId: 'regression-mean-baseline', prompt: 'What does predicting the mean give as a regression baseline?' },
  { tag: 'confusion-matrix-counts', refId: 'confusion-matrix-counts', prompt: 'Explain a confusion matrix with exact counts.' },
  { tag: 'ml-self-attention-token-links', refId: 'ml-self-attention-token-links', prompt: 'When the word sat attends to the sentence the cat sat on the mat, which words matter most?' },
];
const items = [];
for (const p of P) for (const depth of ['brief', 'balanced', 'detailed']) for (let rep = 1; rep <= 5; rep++) items.push({ idx: items.length + 1, set: 'four', tag: p.tag, refId: p.refId, rep, prompt: p.prompt, depth, profile: 'google-low' });
const main = items.length;
for (const p of P.filter(x => x.tag !== 'top-k')) for (let rep = 1; rep <= 2; rep++) items.push({ idx: items.length + 1, set: 'fallback', tag: p.tag, refId: p.refId, rep, prompt: p.prompt, depth: 'balanced', profile: 'fireworks-low', arms: ['after'] });
const runs = main * 2 + (items.length - main);
fs.writeFileSync(process.argv[2] ?? 'plan.json', JSON.stringify({ meta: { items: items.length, runs, estimateUsd: 0.6, stopLineUsd: 1.0 }, items }, null, 1));
console.log('plan', items.length, 'items,', runs, 'runs');
