// Same-JSON full-build measurement plan. The five declared references, each asked by its own first prompt, at Brief, Balanced and Detailed, five asks each, on main (arm main167) and on the branch (arm full):
// 75 asks x 2 arms = 150 runs; then two asks per reference on the fallback model (profile fireworks-low), branch only: 10 runs. Every ask has its own idx, so its own request seed (bench-<idx>-<ask>).
import fs from 'node:fs';
const P = [
  { tag: 'top-k', refId: 'ml-sampling-top-k', prompt: 'Does top-k filtering affect the reported probability of the chosen token?' },
  { tag: 'softmax-probabilities', refId: 'softmax-probabilities', prompt: 'How do softmax probabilities compare two multiclass predictions?' },
  { tag: 'regression-mean-baseline', refId: 'regression-mean-baseline', prompt: 'What does predicting the mean give as a regression baseline?' },
  { tag: 'confusion-matrix-counts', refId: 'confusion-matrix-counts', prompt: 'Explain a confusion matrix with exact counts.' },
  { tag: 'ml-self-attention-token-links', refId: 'ml-self-attention-token-links', prompt: 'When the word sat attends to the sentence the cat sat on the mat, which words matter most?' },
];
const items = [];
for (const p of P) for (const depth of ['brief', 'balanced', 'detailed']) for (let rep = 1; rep <= 5; rep++) items.push({ idx: items.length + 1, set: 'full', tag: p.tag, refId: p.refId, rep, prompt: p.prompt, depth, profile: 'google-low' });
const main = items.length;
for (const p of P) for (let rep = 1; rep <= 2; rep++) items.push({ idx: items.length + 1, set: 'fallback', tag: p.tag, refId: p.refId, rep, prompt: p.prompt, depth: 'balanced', profile: 'fireworks-low', arms: ['full'] });
fs.writeFileSync(process.argv[2] ?? 'plan.json', JSON.stringify({ meta: { items: items.length, runs: main * 2 + (items.length - main), estimateUsd: 0.6, stopLineUsd: 1.5 }, items }, null, 1));
console.log('plan', items.length, 'items,', main * 2 + (items.length - main), 'runs');
