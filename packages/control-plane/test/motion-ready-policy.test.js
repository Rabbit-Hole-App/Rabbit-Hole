// The Motion readiness policies (src/motion-ready-policy.js): the legacy policy that reproduces production today, and the measured policy that
// is enabled strictly where a receipt on the measured renderer shows a pass and is switched on by one config line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIDENCE_LIMITATIONS, LEGACY_POLICY_VERSION, LEGACY_READY_POLICY, MEASURED_POLICY_VERSION, MEASURED_READY_POLICY, MEASURED_RENDERER_CODE_HASH, MEASURED_RENDERER_CONFIG, MEASURED_RENDERER_REVISION, MODEL_RUNS, MODEL_RUNS_NOT_COMPLETED, PASSED, TIMED_OUT, evidenceGroups } from '../src/motion-ready-policy.js';
import { MOTION_NOT_READY, MOTION_RATIOS, motionBinding, motionExecutionTerms, motionGenerationCheck, motionReadiness, readyPolicy } from '../src/motion-settings.js';
import { approvedProposal, acceptanceEmails, motionPaused } from '../src/generation-proposal.js';
import { rendererCodeHashes } from '../../learn-render/motion/orchestrator.mjs';

const live = { MOTION_RENDERER_CONFIG: MEASURED_RENDERER_CONFIG };
const SECONDS = Array.from({ length: 12 }, (_, i) => 5 + 5 * i);
const at = (env, seconds, aspect_ratio) => motionReadiness(env, { duration_seconds: seconds, aspect_ratio });
const key = (r, s) => `${r}|${s}`;
const grid = env => { const ready = [], refused = []; for (const r of MOTION_RATIOS) for (const s of SECONDS) (at(env, s, r).ready ? ready : refused).push(key(r, s)); return { ready: ready.sort(), refused }; };

// The activated pairs, written out so a change to the evidence has to change this list too. 45 and 60 s are withheld in the first expanded
// release; 9:16 at 30 s is also backed by a model-built video (mmr-M2-r2), 16:9 at 15 s by another (mmr-M1-2).
const EXPECTED = [
  ...[5, 10, 15, 20, 25, 30].map(s => key('16:9', s)),
  ...['9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'].map(r => key(r, 15)),
  ...['9:16', '1:1', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'].map(r => key(r, 30)),
].sort();

test('LEGACY (nothing configured, production today): 16:9 and 5 to 30 seconds, nothing else, and the request body is the one the deployed orchestrator accepts', () => {
  const { ready, refused } = grid({});
  assert.deepEqual(ready, [5, 10, 15, 20, 25, 30].map(s => key('16:9', s)).sort());
  assert.equal(refused.length, 108 - 6);
  assert.deepEqual(at({}, 10, '16:9'), { ready: true, complexity: ['simple', 'standard', 'heavy'], policy_version: LEGACY_POLICY_VERSION });
  for (const [s, r] of [[35, '16:9'], [45, '16:9'], [60, '16:9'], [10, '9:16'], [15, '1:1']]) assert.equal(at({}, s, r).ready, false, `${s} ${r}`);
  // The worker's request to the orchestrator has no field the deployed one (main) rejects: no aspect_ratio for 16:9, no renderer_config, no allowed_complexity.
  const p = { title: 'T', description: 'D', settings: { duration_seconds: 15, audio: false } };
  assert.deepEqual(motionExecutionTerms({}, p.settings), {});
  assert.deepEqual(approvedProposal(p, motionExecutionTerms({}, p.settings)), { title: 'T', duration_seconds: 15, description: 'D' });
  assert.deepEqual(approvedProposal({ ...p, settings: { ...p.settings, aspect_ratio: '16:9' } }), { title: 'T', duration_seconds: 15, description: 'D' });
  assert.equal(motionBinding({}, p.settings).renderer_config, null);
  assert.equal(motionGenerationCheck({}, { request: '/motion x', proposal: p }), null, 'a 15 s 16:9 proposal still generates');
  assert.equal(motionGenerationCheck({}, { request: '/motion x', proposal: { ...p, settings: { duration_seconds: 15, aspect_ratio: '9:16', audio: false } } }).code, MOTION_NOT_READY, 'the ratio stays visible but is refused');
  assert.equal(motionGenerationCheck({}, { request: '/motion x', proposal: { ...p, settings: { duration_seconds: 45, audio: false } } }).code, MOTION_NOT_READY);
});

test('ACTIVATED (MOTION_RENDERER_CONFIG = the measured id): exactly the receipt-backed pairs are ready, none interpolated, 45 and 60 s stay refused', () => {
  const { ready, refused } = grid(live);
  assert.deepEqual(ready, EXPECTED);
  assert.equal(EXPECTED.length, 22);
  for (const k of ready) { const [r, s] = k.split('|'), x = at(live, Number(s), r); assert.deepEqual([x.complexity, x.policy_version], [['simple'], MEASURED_POLICY_VERSION]); }
  for (const k of refused) { const [r, s] = k.split('|'), x = at(live, Number(s), r); assert.equal(x.code, MOTION_NOT_READY); assert.doesNotMatch(x.message, /\.\.\.|…|\$/, 'one plain line, credits only'); }
  // Neighbours stay refused: the 16:9 steps of 5 are each measured, so 35 and above are not enabled by 30 passing, and an off-step second is not covered.
  assert.equal(at(live, 12, '16:9').ready, false, 'a saved 12 s proposal passed in legacy mode but has no receipt');
  for (const s of [35, 40, 45, 50, 55, 60]) assert.equal(at(live, s, '16:9').ready, false, `16:9 ${s}`);
  for (const s of [10, 20, 25]) assert.equal(at(live, s, '9:16').ready, false, `9:16 ${s}`);
  // 45 and 60 s pass in fixtures but are withheld, visibly: every one of them has a receipt and a reason.
  const withheld = PASSED.filter(c => c.withheld);
  assert.deepEqual(withheld.map(c => c.seconds).sort((a, b) => a - b), [45, 60, 60, 60, 60, 60]);
  for (const c of withheld) { assert.ok(c.receipt && c.withheld); assert.equal(at(live, c.seconds, c.ratio).ready, false, `${c.ratio} ${c.seconds} withheld`); }
});

test('each enabled pair names a passing receipt on the measured renderer; fixture passes are inside the 420 s limit; timeouts and unfinished 60 s model runs enable nothing', () => {
  for (const c of PASSED) { assert.match(c.receipt, /^mv-(D\d\d-c4|[EF][\d-]+-c5)$/, 'the 03f2a1ef matrix only'); assert.ok(c.service_total_s > 0 && c.service_total_s < 420, c.receipt); }
  assert.deepEqual(MODEL_RUNS.map(c => [c.ratio, c.seconds, c.receipt]), [['16:9', 15, 'mmr-M1-2'], ['9:16', 30, 'mmr-M2-r2'], ['9:16', 15, 'mmr-M4'], ['16:9', 10, 'mmr-M5']]);
  for (const e of MEASURED_READY_POLICY.entries) {
    assert.equal(e.min_seconds, e.max_seconds, 'one measured duration per entry');
    assert.ok(e.receipts.length >= 1);
  }
  assert.deepEqual(TIMED_OUT.map(c => c.receipt), ['mv-D18-c4', 'mv-D20-c4', 'mv-D21-c4']);
  assert.deepEqual(MODEL_RUNS_NOT_COMPLETED, ['mmr-M3', 'mmr-M3-r2', 'mmr-M3-r3']);
  assert.equal(PASSED.filter(c => /-c4$/.test(c.receipt)).length + TIMED_OUT.length, 21, 'the 21 runs of the c4 matrix');
  assert.equal(PASSED.filter(c => /-c5$/.test(c.receipt)).length, 10, 'the ten c5 runs');
  assert.deepEqual(LEGACY_READY_POLICY.entries.map(e => [e.aspect_ratio, e.min_seconds, e.max_seconds]), [['16:9', 5, 30]]);
});

test('fails closed: another renderer configuration, an explicit empty or malformed variable', () => {
  assert.equal(at({ MOTION_RENDERER_CONFIG: 'something-else' }, 15, '16:9').ready, false, 'another configuration than the measured one: nothing');
  assert.equal(at({ ...live, MOTION_READY_POLICY: '' }, 15, '16:9').ready, false, 'an explicit empty variable overrides the policy');
  assert.equal(at({ MOTION_READY_POLICY: '' }, 15, '16:9').ready, false);
  assert.equal(at({ ...live, MOTION_READY_POLICY: 'not json' }, 15, '16:9').ready, false);
  assert.equal(readyPolicy(live).entries.length, 22);
  assert.equal(readyPolicy({}).version, LEGACY_POLICY_VERSION);
});

test('the variable still overrides the policies, and the checks and execution terms follow the activated policy', () => {
  const one = { ...live, MOTION_READY_POLICY: JSON.stringify({ version: 'x', renderer_config: MEASURED_RENDERER_CONFIG, entries: [{ aspect_ratio: '1:1', min_seconds: 10, max_seconds: 10, complexity: ['simple'] }] }) };
  assert.deepEqual([at(one, 10, '1:1').ready, at(one, 15, '16:9').ready], [true, false]);
  const proposal = settings => ({ request: '/motion x', proposal: { settings } });
  assert.equal(motionGenerationCheck(live, proposal({ duration_seconds: 15, aspect_ratio: '2:3', audio: false })), null);
  assert.equal(motionGenerationCheck(live, proposal({ duration_seconds: 20, aspect_ratio: '2:3', audio: false })).code, MOTION_NOT_READY);
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 30, aspect_ratio: '9:16' }), { renderer_config: MEASURED_RENDERER_CONFIG, allowed_complexity: ['simple'] });
  assert.deepEqual(motionExecutionTerms(live, { duration_seconds: 60, aspect_ratio: '3:4' }), { renderer_config: MEASURED_RENDERER_CONFIG }, 'withheld: no cover, the start is refused first');
});

// R2 (owner 2026-10-25): the committed config is the ACTIVATION: public generation on, the measured policy applied, the same id in both files, the R1
// acceptance ceiling gone, the owner-only list kept. 45 and 60 s stay refused by the policy itself.
test('R2 config: MOTION_RENDERER_CONFIG is the measured id in the production Worker vars and the orchestrator env, generation is unpaused, the ceiling is gone, the owner list stays', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const worker = read('../../web/wrangler.rabbit-hole-prod.jsonc'), orchestrator = read('../../learn-render/motion/service/fly.orchestrator.toml');
  const noComments = (s, mark) => s.replace(new RegExp(`^\\s*${mark}.*$`, 'gm'), '');
  const vars = JSON.parse(noComments(worker, '//')).vars;
  assert.equal(vars.MOTION_RENDERER_CONFIG, MEASURED_RENDERER_CONFIG);
  assert.ok(noComments(orchestrator, '#').includes(`MOTION_RENDERER_CONFIG = "${MEASURED_RENDERER_CONFIG}"`), 'the orchestrator carries the same id, uncommented');
  assert.equal(vars.MOTION_GENERATION_PAUSED, '0', 'public generation is back on');
  assert.doesNotMatch(noComments(orchestrator, '#'), /MOTION_JOB_CEILING_USD/, 'the R1 acceptance ceiling is removed');
  // The owner path admits the Google account's PRINCIPAL (a provider email never becomes a principal) and the Gmail address (emailed-code sign-in only).
  assert.deepEqual(acceptanceEmails(vars), ['user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', 'yudhisteer.chin@gmail.com']);
  assert.equal(motionPaused(vars, 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid'), false, 'the Google account principal');
  assert.equal(motionPaused({ ...vars, MOTION_GENERATION_PAUSED: '1' }, 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid'), false, 'admitted while paused');
  assert.equal(motionPaused({ ...vars, MOTION_GENERATION_PAUSED: '1' }, 'user@0000000000000000000000000000000f.rabbithole.invalid'), true, 'another account principal is refused');
  assert.equal(motionPaused({ ...vars, MOTION_GENERATION_PAUSED: '1' }, 'yudhisteer.chin01@gmail.com'), true, 'the look-alike is refused');
  // The owner path survives a later pause and still never admits the look-alike account.
  assert.equal(motionPaused({ ...vars, MOTION_GENERATION_PAUSED: '1' }, 'yudhisteer.chin@gmail.com'), false);
  assert.equal(motionPaused({ ...vars, MOTION_GENERATION_PAUSED: '1' }, 'yudhisteer.chin01@gmail.com'), true);
  assert.equal(motionPaused(vars, 'anyone@example.test'), false, 'unpaused: everyone');
  // With this config the policy that applies is the measured one: the 22 pairs, nothing at 45 or 60 s.
  assert.equal(readyPolicy({ MOTION_RENDERER_CONFIG: vars.MOTION_RENDERER_CONFIG }).entries.length, 22);
  for (const s of [45, 60]) assert.equal(at({ MOTION_RENDERER_CONFIG: vars.MOTION_RENDERER_CONFIG }, s, '16:9').ready, false, `${s} s stays unavailable`);
  assert.ok(MEASURED_RENDERER_REVISION.startsWith(MEASURED_RENDERER_CONFIG.split('-')[0]));
});

// The renderer code the receipts were taken on is the renderer code in this checkout: edit a renderer file and this fails until it is measured again.
test('this checkout renders with the code that was measured (the hash the service reports and the orchestrator checks)', () => {
  assert.ok(rendererCodeHashes().includes(MEASURED_RENDERER_CODE_HASH), `renderer code changed since the measurement: ${rendererCodeHashes()} vs ${MEASURED_RENDERER_CODE_HASH}`);
});

// The card and the policy never claim more than a receipt shows: no word of promise in any message, and a ready answer carries no capacity field.
test('no refusal or ready answer promises an outcome or names a capacity', () => {
  for (const env of [{}, live]) for (const r of MOTION_RATIOS) for (const s of SECONDS) {
    const x = at(env, s, r);
    if (x.ready) assert.deepEqual(Object.keys(x).sort(), ['complexity', 'policy_version', 'ready']);
    else assert.doesNotMatch(x.message, /succeed|guarantee|validated|supported|will (render|work|finish)|capacity|seconds? limit|\$|\.\.\.|…/i, x.message);
  }
});

// The evidence statement: every enabled pair is in exactly one group, A (a model-built video made at the pair) or B (fixture receipts only).
test('evidence groups: A = pairs with a model-driven run, B = fixture-only; together exactly the enabled pairs; the limitations name what is not established', () => {
  const { A, B } = evidenceGroups();
  const keys = g => g.map(x => key(x.aspect_ratio, x.seconds));
  assert.deepEqual([...keys(A), ...keys(B)].sort(), EXPECTED);
  assert.deepEqual(keys(A).sort(), [key('16:9', 15), key('9:16', 30), ...[["9:16",15],["16:9",10]].map(([r, s]) => key(r, s))].sort());
  assert.ok(B.every(x => x.receipts.every(rc => /-c[45]$/.test(rc))), 'group B rests on fixture receipts only');
  assert.match(EVIDENCE_LIMITATIONS.join(' '), /No canary has run on the production renderer/);
  assert.match(EVIDENCE_LIMITATIONS.join(' '), /not a capacity check/);
  assert.match(EVIDENCE_LIMITATIONS.join(' '), /zero credits/);
});
