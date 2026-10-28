// Offline regression replays of genuine run sandbox-ex1-a (no model call; not genuine-generation acceptance). The surviving last draft is a
// fixture only (test/fixtures/explain-ex1-a, copied from that run's diagnosis folder); no subject is in the generator, prompts or rules.
// The job-level replays (history, repair routing, rounds, scene path) are in explain-m3.test.js; this file replays the draft through the REAL
// interpreter and holds the unit tests of the history caps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkProgramDraft } from '../src/explain-program.js';
import { HISTORY_LIMITS, recordRound } from '../src/explain-history.js';
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

// ---- the history caps ---------------------------------------------------------------------------------------------------------------
const jobWith = (over = {}) => ({ round: 0, attempt: 1, program: { source: 'export function evaluate() {}', manifest: { title: 'T' } }, ...over });
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;

test('history caps: the source and the text are cut at their byte caps with an explicit flag, and nothing else is cut', async () => {
  const job = jobWith({ program: { source: 'é'.repeat(HISTORY_LIMITS.sourceBytes), manifest: { title: 'T'.repeat(5000) } } });
  const findings = Array.from({ length: 30 }, (_, i) => ({ id: `rf${i}`, category: 'spec', severity: 'major', verdict: 'visual', target: { capture: 'c', object: 'o' }, message: 'm'.repeat(900) }));
  await recordRound(job, { stage: 'reviewing', outcome: 'rejected', findings, problems: Array.from({ length: 20 }, () => 'p'.repeat(900)) });
  const [entry] = job.history;
  assert.equal(entry.truncated, true);
  assert.ok(entry.cut.includes('source') && entry.cut.includes('manifest') && entry.cut.includes('count'));
  assert.ok(new TextEncoder().encode(entry.source).length <= HISTORY_LIMITS.sourceBytes);
  assert.ok(new TextEncoder().encode(entry.manifest).length <= HISTORY_LIMITS.manifestBytes);
  assert.ok(entry.findings.length <= HISTORY_LIMITS.findings && entry.problems.length <= HISTORY_LIMITS.problems);
  assert.ok(size({ problems: entry.problems, findings: entry.findings }) <= HISTORY_LIMITS.textBytes + 200);
  assert.ok(entry.findings.every(f => f.message.length <= HISTORY_LIMITS.line));
  const small = jobWith();
  await recordRound(small, { stage: 'validating', outcome: 'invalid', problems: ['x'] });
  assert.deepEqual([small.history[0].truncated, small.history[0].cut], [false, []]);
});

test('history caps: at most eight entries, the total never passes 64 KiB, and a record near the 128 KiB value limit shrinks the entry instead of growing past it', async () => {
  const big = jobWith({ program: { source: 'a'.repeat(HISTORY_LIMITS.sourceBytes), manifest: { title: 'M'.repeat(HISTORY_LIMITS.manifestBytes - 40) } } });
  for (let round = 0; round < 12; round++) {
    big.round = round;
    await recordRound(big, { stage: 'reviewing', outcome: 'rejected', findings: [{ id: 'rf1', category: 'spec', severity: 'major', verdict: 'visual', message: 'x'.repeat(400) }] });
    assert.ok(size(big.history) <= HISTORY_LIMITS.totalBytes, `round ${round}: ${size(big.history)} bytes`);
  }
  assert.ok(big.history.length <= HISTORY_LIMITS.entries);
  assert.ok(big.history.length + big.historyDropped >= 8 && big.historyDropped >= 4, 'the rounds past the cap are counted, not stored');
  assert.ok(big.history.every(entry => entry.hashes.programHash.length === 16), 'the hashes survive any shrinking');
  // A job record already close to the limit: the entry is shrunk (source first) so that the whole value stays under 120 KiB.
  const heavy = jobWith({ context: 'c'.repeat(HISTORY_LIMITS.recordBytes - 9000) });
  await recordRound(heavy, { stage: 'validating', outcome: 'invalid', problems: ['p'] });
  assert.ok(size(heavy) <= HISTORY_LIMITS.recordBytes, String(size(heavy)));
  const full = jobWith({ context: 'c'.repeat(HISTORY_LIMITS.recordBytes) });
  await recordRound(full, { stage: 'validating', outcome: 'invalid', problems: ['p'] });
  assert.deepEqual([full.history, full.historyDropped], [undefined, 1], 'no room at all: counted, the job itself is never put over the limit by its history');
});
