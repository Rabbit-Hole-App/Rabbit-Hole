// Offline regression replays of genuine run sandbox-ex1-a (no model call; not genuine-generation acceptance). The surviving last draft is a
// fixture only (test/fixtures/explain-ex1-a, copied from that run's diagnosis folder); no subject is in the generator, prompts or rules.
// The job-level replays (history, repair routing, rounds, scene path) are in explain-m3.test.js; this file replays the draft through the REAL
// interpreter and holds the unit tests of the history caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkProgramDraft } from '../src/explain-program.js';
import { HISTORY_LIMITS, recordRound, resolveVersion, programHashOf, versionKey } from '../src/explain-history.js';
import { loadEngine, runProgram } from '../../web/src/explain-program/runtime.js';
import { LIMITS } from '../../web/src/explain-program/limits.js';
import { normalizeFrame } from '../../web/src/explain-program/frame.js';
import { textOverlaps, textBoxes } from '../../web/src/explain-program/frame-overlap.js';

const source = readFileSync(new URL('./fixtures/explain-ex1-a/last-draft-source.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('./fixtures/explain-ex1-a/last-draft-manifest.json', import.meta.url), 'utf8'));
const ENGINE = loadEngine();
const run = async (room, time, limits = { ...LIMITS, interruptMs: 500 }) => runProgram(await ENGINE, { source, request: { inputs: { room }, time, seed: 0, state: null } }, limits);
const involved = (overlaps, a, b) => overlaps.find(o => (o.a === a && o.b === b) || (o.a === b && o.b === a));

test('(a) duplicate input and readout ids are refused with feedback that names the id and both uses', () => {
  const draft = { source, manifest: { ...manifest, readouts: [...manifest.readouts, { id: 'room', label: 'Room', unit: '°C', decimals: 0 }] } };
  const { problems } = checkProgramDraft(draft);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^manifest\.inputs: input and readout ids must be unique \(they share one namespace\): "room" is used more than once, as an input and a readout; rename one of each pair$/);
  assert.equal(checkProgramDraft({ source, manifest }).bundle?.manifest.inputs[0].id, 'room', 'the surviving draft itself is valid');
});

test('(b) a run stopped by the interpreter reports its phase and elapsed time', async () => {
  const looping = await runProgram(await ENGINE, { source: 'export function evaluate() { for (;;) {} }', request: { inputs: {}, time: 0, seed: 0, state: null } }, { ...LIMITS, interruptMs: 30 });
  assert.deepEqual([looping.ok, looping.code, looping.phase], [false, 'runtime_limit', 'evaluate']);
  assert.ok(looping.metrics.ms >= 30, 'the failure carries its timing');
});

test('(g) the surviving program at the reviewed control boundaries: frames are valid and the reported label collisions are detected as numbers', async () => {
  const measured = {};
  for (const [room, pair] of [[-10, ['roomlab', 'n4']], [10, ['roomlab', 'n2']], [30, ['roomlab', 'eq']]]) {
    for (const time of [0, 10, 20]) {
      const out = await run(room, time);
      assert.equal(out.ok, true, JSON.stringify(out));
      const frame = out.value.frame;
      assert.equal(normalizeFrame(frame, manifest).ok, true, 'the real renderer path accepts the frame');
      const overlap = involved(textOverlaps(frame), ...pair);
      assert.ok(overlap, `room ${room} time ${time}: ${pair.join(' vs ')} overlap detected`);
      assert.ok(overlap.width > 0 && overlap.height > 0);
      measured[`room ${room}`] = { ...overlap, frameObjects: frame.objects.length, ms: Math.round(out.metrics.ms * 10) / 10 };
    }
  }
  // The measured numbers (estimated text boxes, px): printed for the record.
  console.log('ex1-a label collisions', JSON.stringify(measured));
  assert.deepEqual(Object.values(measured).map(m => [m.a, m.b]), [['roomlab', 'n4'], ['roomlab', 'n2'], ['roomlab', 'eq']]);
});

test('(g) the detector is generic: a clear layout has no overlap, a moved label clears the collision, and only text objects are measured', async () => {
  const frame = (await run(10, 0)).value.frame;
  assert.ok(involved(textOverlaps(frame), 'roomlab', 'n2'));
  const moved = { ...frame, objects: frame.objects.map(o => (o.id === 'roomlab' ? { ...o, x: o.x - 40 } : o)) };
  assert.equal(involved(textOverlaps(moved), 'roomlab', 'n2'), undefined);
  assert.deepEqual(textOverlaps({ objects: [{ kind: 'text', id: 'a', x: 0, y: 20, text: 'one' }, { kind: 'text', id: 'b', x: 200, y: 20, text: 'two' }] }), []);
  assert.deepEqual(textOverlaps({ objects: [{ kind: 'text', id: 'a', x: 0, y: 20, text: 'overlapping' }, { kind: 'text', id: 'b', x: 10, y: 20, text: 'words', align: 'start' }] }, 1).length, 1);
  assert.equal(textBoxes({ objects: [{ kind: 'box', id: 'k', x: 0, y: 0, w: 10, h: 10 }] }).length, 0, 'only text objects are measured');
});

// ---- the history: small entries, complete versions by reference ------------------------------------------------------------------------
const MAX_SOURCE = HISTORY_LIMITS.sourceBytes, MAX_MANIFEST = HISTORY_LIMITS.manifestBytes; // 16,384 and 4,096: the contract's own limits
const manifestOf = n => ({ title: 'M'.repeat(MAX_MANIFEST - 12 - String(n).length) + n });   // JSON is exactly MAX_MANIFEST bytes
const maxProgram = n => ({ source: String(n).padEnd(MAX_SOURCE, 'a'), manifest: manifestOf(n) });
const jobWith = (over = {}) => ({ id: 'job1', round: 0, attempt: 1, program: { source: 'export function evaluate() {}', manifest: { title: 'T' } }, ...over });
const store = (fail = false) => { const map = new Map(); return { map, put: async (k, v) => { if (fail) throw new Error('quota'); map.set(k, structuredClone(v)); }, get: async k => structuredClone(map.get(k)), delete: async k => map.delete(k) }; };
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
const sha256 = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

test('history: the maximum valid program (16 KiB source + 4 KiB manifest) is stored whole, resolves for the owner and re-verifies from the stored text', async () => {
  assert.equal(size(manifestOf(1)), MAX_MANIFEST);
  const storage = store(), job = jobWith({ program: maxProgram(1) });
  await recordRound(job, { stage: 'validating', outcome: 'invalid', problems: ['x'] }, storage);
  const [entry] = job.history;
  assert.deepEqual([entry.version.stored, entry.sizes, entry.truncated], [true, { sourceBytes: MAX_SOURCE, manifestBytes: MAX_MANIFEST }, false]);
  assert.equal(entry.version.key, versionKey('job1', entry.hashes.programHash));
  assert.ok(size(entry) < 1500, `the entry holds no program text: ${size(entry)} bytes`);
  const found = await resolveVersion(job, entry.hashes.programHash, storage);
  assert.deepEqual([found.stored, found.source.length, found.verified], [true, MAX_SOURCE, { programHash: true, sourceHash: true }]);
  assert.equal(await sha256(found.source), entry.hashes.sourceHash, 'the stored source hashes to the recorded hash');
  assert.equal(await programHashOf(found), entry.hashes.programHash);
  // A tampered stored value does not verify.
  storage.map.get(entry.version.key).source += ' ';
  assert.deepEqual((await resolveVersion(job, entry.hashes.programHash, storage)).verified, { programHash: false, sourceHash: false });
  assert.deepEqual(await resolveVersion(job, 'ffffffffffffffff', storage), { stored: false, reason: 'unknown_version' });
});

test('history: a multi-round job at the maxima keeps every version whole, stays far under the record cap, and bounds the objects it stores', async () => {
  const storage = store(), job = jobWith();
  const findings = Array.from({ length: 12 }, (_, i) => ({ id: `rf${i}`, category: 'spec', severity: 'major', verdict: 'visual', target: { capture: 'c', object: 'o' }, message: 'm'.repeat(900) }));
  for (let round = 0; round < 12; round++) {
    job.round = round; job.program = maxProgram(round);
    await recordRound(job, { stage: 'reviewing', outcome: 'rejected', findings, problems: Array.from({ length: 20 }, () => 'p'.repeat(900)) }, storage);
    assert.ok(size(job.history) <= HISTORY_LIMITS.totalBytes, `round ${round}: ${size(job.history)} bytes of history`);
    assert.ok(size(job) <= HISTORY_LIMITS.recordBytes);
  }
  assert.equal(job.history.length, HISTORY_LIMITS.entries);
  assert.equal(job.historyDropped, 4, 'rounds past the cap are counted, not stored');
  assert.equal(storage.map.size, HISTORY_LIMITS.entries, 'at most one stored version per entry: 8 objects of about 21 KiB');
  for (const entry of job.history) {
    assert.equal(entry.truncated, true, 'the 12 findings and 20 problems are cut to the text budget, and say so');
    assert.ok(entry.findings.every(f => f.programHash === entry.hashes.programHash) && entry.problems.every(p => p.programHash === entry.hashes.programHash));
    const found = await resolveVersion(job, entry.hashes.programHash, storage);
    assert.deepEqual([found.stored, found.source.length, found.verified], [true, MAX_SOURCE, { programHash: true, sourceHash: true }]);
  }
  assert.equal(new Set(job.history.map(h => h.hashes.programHash)).size, 8);
});

test('history: a version over the contract maximum or a failed write is stored:false with its reason, never replayable, and the entry still records its hashes', async () => {
  const oversize = jobWith({ program: { source: 'a'.repeat(MAX_SOURCE + 1), manifest: { title: 'T' } } });
  await recordRound(oversize, { stage: 'validating', outcome: 'invalid', problems: ['the source is over 16384 bytes'] }, store());
  assert.deepEqual(oversize.history[0].version, { stored: false, reason: 'source_over_contract_limit' });
  const wide = jobWith({ program: { source: 'x', manifest: { title: 'M'.repeat(MAX_MANIFEST) } } });
  await recordRound(wide, { stage: 'validating', outcome: 'invalid' }, store());
  assert.deepEqual(wide.history[0].version, { stored: false, reason: 'manifest_over_contract_limit' });
  const failing = jobWith({ program: maxProgram(7) }), storage = store(true);
  await recordRound(failing, { stage: 'rendering', outcome: 'runtime', runtime: { code: 'runtime_limit', phase: 'load', ms: 61.2 } }, storage);
  const [entry] = failing.history;
  assert.deepEqual(entry.version, { stored: false, reason: 'storage_failed' });
  assert.deepEqual(entry.runtime, { code: 'runtime_limit', phase: 'load', ms: 61.2, programHash: entry.hashes.programHash });
  assert.equal(entry.hashes.programHash.length, 16);
  for (const job of [oversize, failing]) assert.deepEqual(await resolveVersion(job, job.history[0].hashes.programHash, storage), { stored: false, reason: job.history[0].version.reason });
  const none = jobWith();
  await recordRound(none, { stage: 'validating', outcome: 'invalid' });
  assert.deepEqual(none.history[0].version, { stored: false, reason: 'no_storage' });
});

test('history: the same candidate rendered again is stored once (content-addressed), and a record with no room for the entry removes the version it just wrote', async () => {
  const storage = store(), job = jobWith({ program: maxProgram(3) });
  await recordRound(job, { stage: 'rendering', outcome: 'runtime' }, storage);
  await recordRound(job, { stage: 'reviewing', outcome: 'rejected' }, storage);
  assert.deepEqual([job.history.length, storage.map.size, job.history[0].version.key === job.history[1].version.key], [2, 1, true]);
  const full = jobWith({ program: maxProgram(4), context: 'c'.repeat(HISTORY_LIMITS.recordBytes) }), other = store();
  await recordRound(full, { stage: 'validating', outcome: 'invalid', problems: ['p'] }, other);
  assert.deepEqual([full.history, full.historyDropped, other.map.size], [undefined, 1, 0]);
});
