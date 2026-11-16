// Learn sections, Reviewer 11:00: the recorded run as RECORDED RUN lines for a Make turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordedRun, runLines } from '../src/learn-section-record.js';

const record = { steps: [{ id: 'prepare_data', cmd: 'python prepare.py', rc: 0, sec: 0.85, log: 'logs/prepare_data-1.log', files: { 'data/train.bin': { bytes: 2007708 } } }] };
const log = 'length of dataset in characters: 1,115,394\nall the unique characters:\n !$&\nvocab size: 65\ntrain has 1,003,854 tokens\n--- stderr ---\nwarning 12';

test('runLines: each step with its command, exit code, seconds, files and the numbered lines of its log, stderr dropped', () => {
  assert.equal(runLines(record, { 'logs/prepare_data-1.log': log }), [
    'step prepare_data: python prepare.py (exit 0, 0.85 s)',
    '  file data/train.bin: 2007708 bytes',
    '  length of dataset in characters: 1,115,394',
    '  vocab size: 65',
    '  train has 1,003,854 tokens',
  ].join('\n'));
  const long = Array.from({ length: 30 }, (_, i) => `iter ${i}: loss ${i}`).join('\n');
  const lines = runLines(record, { 'logs/prepare_data-1.log': long }).split('\n');
  assert.deepEqual([lines[2], lines.includes('  ...'), lines.at(-1)], ['  iter 0: loss 0', true, '  iter 29: loss 29'], 'head and tail of a long log');
});

test('recordedRun: reads every rehearsal record of the version; nothing for an unrehearsed version or without a bucket', async () => {
  const objects = { 'learn-repositories-dev/7/abc/rehearsal-route_a-cpu.json': record, 'learn-repositories-dev/7/abc/catalogue-cpu.json': {} };
  const bucket = { list: async ({ prefix }) => ({ objects: Object.keys(objects).filter(k => k.startsWith(prefix)).map(key => ({ key })) }), get: async key => (objects[key] ? { json: async () => objects[key] } : null) };
  assert.equal(await recordedRun({ REPOSITORY_SNAPSHOTS: bucket }, { id: 7, commit: 'abc' }), 'step prepare_data: python prepare.py (exit 0, 0.85 s)\n  file data/train.bin: 2007708 bytes');
  assert.equal(await recordedRun({ REPOSITORY_SNAPSHOTS: bucket }, { id: 8, commit: 'abc' }), '');
  assert.equal(await recordedRun({}, { id: 7, commit: 'abc' }), '');
});
