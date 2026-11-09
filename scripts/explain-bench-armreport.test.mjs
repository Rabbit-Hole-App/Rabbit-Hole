// Arm D report on fixtures: the side-by-side numbers and the decision rule (propose only if D is >= 10 points better on fully-matches-sketch or claims AND whole-card p90 <= 7 s).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armStats, decide, render } from './explain-bench/arm-report.mjs';

// n cards at Detailed: `fully` of them with a fully-faithful diagram, `claims` with a claim beyond the prose, each card has total/model ms.
const run = ({ n = 10, fully = 5, claims = 3, totalMs = 3000, modelMs = 2000, repaired = 1, follow = 9 } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'arm-')), cards = [], jsonl = [];
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    cards.push({ set: 'arm-d', id, run: 1, depth: 'deep', delivered: true, score: 'right', repaired: i < repaired, totalMs: totalMs + i, costUsd: 0.004, judge: { factual: { score: 5, errors: [] } },
      planCheck: { agree: i < follow }, diagrams: [{ kind: 'flow', edges: 4, labelledEdges: 2, labels: 8, numericLabels: 2, optional: ['caption'], faithful: { verdict: i < fully ? 'fully' : 'partly' }, beyond: { verdict: i < claims ? 'yes' : 'no' } }] });
    jsonl.push(JSON.stringify({ set: 'arm-d', id, run: 1, depth: 'deep', modelCalls: [{ ms: modelMs }] }));
  }
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ cards }));
  mkdirSync(join(dir, 'raw', 'arm-d-r1-deep'), { recursive: true }); writeFileSync(join(dir, 'raw', 'arm-d-r1-deep', 'results.jsonl'), jsonl.join('\n'));
  return dir;
};

test('armStats: rates, planner followed, richness, model-call and whole-card latency, cost', () => {
  const s = armStats(run({ n: 10, fully: 5, claims: 3, follow: 9, repaired: 1, totalMs: 3000, modelMs: 2000 }));
  assert.equal(s.delivered, 10); assert.equal(s.fully, 5); assert.equal(s.beyondYes, 3); assert.equal(s.planFollowed, 9); assert.equal(s.repaired, 1);
  assert.equal(s.labelledEdges, 20); assert.equal(s.edges, 40); assert.deepEqual(s.optional, { caption: 10 });
  assert.equal(s.modelP50, 2000); assert.equal(s.cardP90, 3009); assert.equal(s.costPerCard, 0.004);
});

test('decision rule: proposes D only when it is >= 10 points better on fully-matches or claims and p90 <= 7000 ms; otherwise C stays', () => {
  const C = armStats(run({ fully: 5, claims: 4 }));
  const better = decide(C, armStats(run({ fully: 7, claims: 4 })));
  assert.equal(better.fullyGain, 20); assert.equal(better.propose, true); assert.match(better.text, /^PROPOSE/);
  const claimsBetter = decide(C, armStats(run({ fully: 5, claims: 2 })));
  assert.equal(claimsBetter.claimsGain, 20); assert.equal(claimsBetter.propose, true);
  const slow = decide(C, armStats(run({ fully: 8, claims: 1, totalMs: 7500 })));
  assert.equal(slow.better, true); assert.equal(slow.fast, false); assert.equal(slow.propose, false); assert.match(slow.text, /^C stays/);
  const same = decide(C, armStats(run({ fully: 5, claims: 4 })));
  assert.equal(same.propose, false);
  const exactly = decide(C, armStats(run({ fully: 6, claims: 4 })));
  assert.equal(exactly.fullyGain, 10); assert.equal(exactly.better, true, '10 points exactly counts');
});

test('render: the side-by-side table, both arms and the verdict line', () => {
  const md = render(armStats(run({ fully: 5 })), armStats(run({ fully: 8 })));
  assert.match(md, /\| fully matches the sketch \(diagrams\) \| 5\/10 = 50% \| 8\/10 = 80% \|/);
  assert.match(md, /\| whole card p50 \/ p90 ms \|/);
  assert.match(md, /\*\*PROPOSE:/);
});
