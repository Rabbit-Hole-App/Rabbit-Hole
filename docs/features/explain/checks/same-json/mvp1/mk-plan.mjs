// MVP1 same-json plan: 5 prompts x 5 asks, each ask its own item (own idx, so its own request seed), both arms run every item. Prompts fixed by the owner (spec v0.29 "Details settled").
import fs from 'node:fs';
const P = [
  { tag: 'top-k', refId: 'ml-sampling-top-k', kind: 'bar-chart', prompt: 'Does top-k filtering affect the reported probability of the chosen token?' },
  { tag: 'regression-mean-baseline', refId: 'regression-mean-baseline', kind: 'coordinate-plot', prompt: 'What does predicting the mean give as a regression baseline?' },
  { tag: 'confusion-matrix-counts', refId: 'confusion-matrix-counts', kind: 'heatmap', prompt: 'Explain a confusion matrix with exact counts.' },
  { tag: 'softmax-probabilities', refId: 'softmax-probabilities', kind: 'bar-chart', prompt: 'How do softmax probabilities compare two multiclass predictions?' },
  { tag: 'ml-self-attention-token-links', refId: 'ml-self-attention-token-links', kind: 'token-links', prompt: 'When the word sat attends to the sentence the cat sat on the mat, which words matter most?' },
];
const items = [];
for (const p of P) for (let rep = 1; rep <= 5; rep++) items.push({ idx: items.length + 1, set: 'mvp1', tag: p.tag, refId: p.refId, expectedKind: p.kind, rep, prompt: p.prompt, depth: 'balanced', profile: 'google-low' });
fs.writeFileSync(process.argv[2] ?? 'plan.json', JSON.stringify({ meta: { items: items.length, runs: items.length * 2, estimateUsd: 0.18, stopLineUsd: 0.5 }, items }, null, 1));
console.log('plan', items.length, 'items,', items.length * 2, 'runs');
