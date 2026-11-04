// Tests for scripts/animation/author-sample-report.mjs on a fixture batch folder (no model, no browser).
// Run: node --test scripts/animation-author-sample-report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, reportOf } from './animation/author-sample-report.mjs';

function batch() {
  const dir = mkdtempSync(join(tmpdir(), 'an20-report-'));
  const runs = [
    { id: 'p-r01', plan: 'p', session: 'a', status: 'valid', validator: true, assertions: null, problems: [], error: null },
    { id: 'p-r02', plan: 'p', session: 'b', status: 'valid', validator: true, assertions: null, problems: [], error: null },
    { id: 'p-r03', plan: 'p', session: 'a', status: 'invalid', validator: false, assertions: null, problems: ['parameters: the approved default is 0.1'], error: null },
  ];
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ ids: { candidate: 'abc1234', prompts: 'a'.repeat(64), golden: 'absent' }, transport: 'fake', settled: 12.5, stopped: null, runs }));
  for (const r of runs) { mkdirSync(join(dir, r.id), { recursive: true }); if (r.status === 'valid') writeFileSync(join(dir, r.id, 'draft.json'), '{}'); }
  mkdirSync(join(dir, 'p-r01', 'captures')); for (const f of ['v1-s0.png', 'v0-s0.png', 'notes.txt']) writeFileSync(join(dir, 'p-r01', 'captures', f), 'x');
  return dir;
}

test('the report lists each run with its draft and its captures, sorted, images only, and flags valid runs with no captures', () => {
  const dir = batch(), { text, runs, missing } = reportOf(dir);
  assert.deepEqual(runs[0].captures.map(c => c.split(/[\\/]/).pop()), ['v0-s0.png', 'v1-s0.png']);
  assert.deepEqual(missing, ['p-r02']);
  assert.match(text, /candidate abc1234 {3}prompt-files a{64} {3}golden absent/);
  assert.match(text, /\| p-r01 \| valid \| PASS \| n\/a \| 2 \| \|/);
  assert.match(text, /\| p-r03 \| invalid \| FAIL \| n\/a \| 0 \| \|/);
  assert.match(text, /- parameters: the approved default is 0\.1/);
  assert.match(text, /captures: MISSING/);
});

test('--captures reads DIR/<run id>/ instead, and the command writes report.md', () => {
  const dir = batch(), caps = mkdtempSync(join(tmpdir(), 'an20-caps-'));
  mkdirSync(join(caps, 'p-r02')); writeFileSync(join(caps, 'p-r02', 'default.png'), 'x');
  const lines = [], code = main([dir, '--captures', caps], { out: s => lines.push(s), err: s => lines.push(s) });
  assert.equal(code, 0);
  assert.match(readFileSync(join(dir, 'report.md'), 'utf8'), /\| p-r02 \| valid \| PASS \| n\/a \| 1 \|/);
  assert.match(lines.join('\n'), /WARN 1 valid run\(s\) have no captures yet: p-r01/);
  assert.equal(main([join(dir, 'nope')], { out: () => {}, err: () => {} }), 1);
});
