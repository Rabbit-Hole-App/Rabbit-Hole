// SAME-1 measurement plan (NOT RUN by the author; the lead runs it, cap US$1). Builds plan.json offline.
//   items: the three SAME-1 questions as archived (A and C bare, B wrapped; exact texts from ../records.md), 2 reps each; about ten softmax / top-k / temperature / normalise questions;
//   up to 12 existing transformation prompts of the VAR-1 bench set (numericKinds includes 'transformation'). Every item runs on both profiles (google-low, fireworks-low) and on every arm.
import fs from 'node:fs';
const records = fs.readFileSync('C:/s/film-evidence/docs/features/explain/checks/same-1/records.md', 'utf8');
const grab = label => { const m = records.match(new RegExp(`^- ${label}: \`([^\`]+)\``, 'm')); if (!m) throw new Error(`records.md has no question ${label}`); return m[1]; };
const trio = [['A', grab('A')], ['B', grab('B').replace(/ \(wrapped\)$/, '')], ['C', grab('C')]];
const softmaxQuestions = [
  'How does softmax turn raw scores into probabilities?',
  'What does temperature do to a softmax distribution over tokens?',
  'Why do we subtract the maximum logit before applying softmax?',
  'How does top-k sampling pick the next token from the probabilities?',
  'How does top-p (nucleus) sampling differ from top-k sampling?',
  'How do logits become a probability for each word in a language model?',
  'What happens to the probabilities when the temperature is 0.5 versus 2?',
  'How do we normalise attention scores so they sum to one?',
  'How is the probability of a generated sequence computed from per-token probabilities?',
  'Why does a larger temperature make a model output more random?',
];
const bench = JSON.parse(fs.readFileSync('C:/s/sprint2-evidence/var-1-bench/plan.json', 'utf8'));
const seen = new Set(), transformation = bench.items.filter(it => it.set === 'audit' && (it.numericKinds || []).includes('transformation') && !seen.has(it.prompt) && seen.add(it.prompt)).slice(0, 12);
const base = [
  ...trio.flatMap(([id, prompt]) => [1, 2].map(rep => ({ set: 'same1', tag: id, prompt, depth: 'balanced', rep }))),
  ...softmaxQuestions.map((prompt, i) => ({ set: 'softmax', tag: `S${i + 1}`, prompt, depth: 'balanced', rep: 1 })),
  ...transformation.map((it, i) => ({ set: 'transformation', tag: `T${i + 1}`, prompt: it.prompt, depth: it.depth, rep: 1 })),
];
const items = base.flatMap((it, i) => ['google-low', 'fireworks-low'].map((profile, j) => ({ ...it, profile, idx: i * 2 + j })));
fs.writeFileSync(new URL('./plan.json', import.meta.url), JSON.stringify({ meta: { items: items.length, baseItems: base.length, transformationPrompts: transformation.length, profiles: ['google-low', 'fireworks-low'] }, items }, null, 1));
console.log(`plan.json: ${base.length} questions x 2 profiles = ${items.length} items (same1 ${trio.length * 2}, softmax ${softmaxQuestions.length}, transformation ${transformation.length}); x 3 arms (before, after, afterb) = ${items.length * 3} runs`);
