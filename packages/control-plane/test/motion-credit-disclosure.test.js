// Motion credit disclosure (owner 2026-10-26, D1a/D1b; docs/features/motion-credit-disclosure.md): the estimate, the MAXIMUM POSSIBLE CHARGE and the
// temporary reservation are three separate numbers; the maximum is signed into the quote, so changing it makes a card stale; and the public
// path can never show the estimate without the maximum. The settle-time guard (a charge never exceeds the signed maximum) runs the real ledger in
// motion-allowance.test.js. Pure: nothing is called or paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proposalUsage, signProposal, validateProposalInput, verifyProposal } from '../src/generation-proposal.js';
import { MOTION_MAX_UNKNOWN, MOTION_QUOTE_STALE, motionBinding, motionGenerationCheck, motionMaxCredits } from '../src/motion-settings.js';
import { motionReservationMicros } from '../src/motion-provider.js';
import { proposalView } from '../../web/src/generation-confirmation-schema.js';
import { READY, READY_POLICY } from './motion-ready-env.js';
import { moneyLeaks } from './no-money.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
// The production Worker's own variables, exactly as checked in (full-line // comments only).
const PROD = JSON.parse(read('../../web/wrangler.rabbit-hole-prod.jsonc').replace(/^\s*\/\/.*$/gm, '')).vars;
const ORCHESTRATOR_TOML = read('../../learn-render/motion/service/fly.orchestrator.toml');
const micros = usd => Math.round(Number(usd) * 1e6);
// What the orchestrator enforces per job: min(the Worker's grant = the hold, MOTION_JOB_CEILING_USD); with that line removed the grant alone is the ceiling.
const ceilingMicros = (vars, toml) => { const c = toml.match(/^\s*MOTION_JOB_CEILING_USD\s*=\s*"([^"]+)"/m)?.[1]; return Math.min(micros(vars.MOTION_JOB_RESERVATION_USD), c === undefined ? Infinity : micros(c)); };
const covered = (vars, toml) => micros(vars.MOTION_MAX_CHARGE_USD) >= ceilingMicros(vars, toml) && micros(vars.MOTION_MAX_CHARGE_USD) <= micros(vars.MOTION_JOB_RESERVATION_USD);

const DESCRIPTION = 'Sunlight warms a body of water, causing evaporation. Moist air rises and cools, forming droplets that gather into clouds. The droplets grow and fall as rain. Water collects again, completing the cycle.';
const input = { request: '/motion explain the water cycle', concept: 'Weather' };
const water = { command: 'motion', title: 'Water cycle: evaporation to rain', description: DESCRIPTION, settings: { duration_seconds: 10, audio: false } };
const sign = (env, over = {}) => signProposal(env, { ...validateProposalInput({ ...water, ...over }), input }, 'alice@example.test');
// Production's variables as they would be at R2 (generation not paused), with the secret and the renderer configuration R2 adds.
const R2 = { ...PROD, ...READY, MOTION_GENERATION_PAUSED: '0', MOTION_ORCHESTRATOR_TOKEN: 'm'.repeat(48) }; // READY last: R2a puts the real MOTION_RENDERER_CONFIG in PROD, which would not match READY's test policy
const { MOTION_MAX_CHARGE_USD: _removed, ...R2_WITHOUT_MAX } = R2; // eslint-disable-line no-unused-vars

test('the three numbers are separate and ordered: estimate 100, maximum 350, temporary reservation 896 credits', () => {
  assert.deepEqual([PROD.MOTION_ESTIMATE_USD, PROD.MOTION_MAX_CHARGE_USD, PROD.MOTION_JOB_RESERVATION_USD], ['1.00', '3.50', '8.96']);
  assert.deepEqual(proposalUsage(R2, 'motion', { duration_seconds: 10 }), { estimate_credits: 100, max_credits: 350, reserve_credits: 896, inputs: { duration_seconds: 10, aspect_ratio: '16:9' }, price_version: 'flat' });
});

test('the maximum is pinned to the orchestrator ceiling: at least the ceiling, at most the hold; removing or raising the ceiling fails here', () => {
  assert.equal(covered(PROD, ORCHESTRATOR_TOML), true, `MOTION_MAX_CHARGE_USD ${PROD.MOTION_MAX_CHARGE_USD} must cover fly.orchestrator.toml's per-job ceiling (${ceilingMicros(PROD, ORCHESTRATOR_TOML) / 1e6}) and not exceed the hold`);
  // Negative controls: the check really fails when the two drift (fixture TOML and variables, not the checked-in files).
  const toml = usd => `[env]\n  MOTION_JOB_CEILING_USD = "${usd}"\n`;
  assert.equal(covered(PROD, toml('3.50')), true, 'the approved 3.50 ceiling is covered');
  assert.equal(covered(PROD, toml('3.51')), false, 'a ceiling above the maximum');
  assert.equal(covered(PROD, '[env]\n  # MOTION_JOB_CEILING_USD = "2.00"\n'), false, 'no ceiling line: the ceiling is the whole hold (8.96), more than the maximum');
  assert.equal(covered({ ...PROD, MOTION_MAX_CHARGE_USD: '9.00' }, toml('3.50')), false, 'a maximum above the hold could never be held');
  assert.equal(covered({ ...PROD }, ORCHESTRATOR_TOML.replace(/MOTION_JOB_CEILING_USD\s*=\s*"[^"]+"/, 'MOTION_JOB_CEILING_USD = "4.00"')), false);
});

test('the signed quote carries the maximum: binding, usage and the card view agree', async () => {
  const p = await sign(R2);
  assert.equal(p.input.binding.max_credits, 350);
  assert.deepEqual([p.usage.estimate_credits, p.usage.max_credits, p.usage.reserve_credits], [100, 350, 896]);
  assert.equal(await verifyProposal(R2, p, 'alice@example.test'), null);
  assert.match(await verifyProposal(R2, { ...p, input: { ...p.input, binding: { ...p.input.binding, max_credits: 100 } } }, 'alice@example.test'), /changed/, 'the signed maximum cannot be edited');
  const view = proposalView(p);
  assert.deepEqual(view.usage, { estimate_credits: 100, max_credits: 350, reserve_credits: 896 });
  assert.equal(view.allowed_actions.includes('generate'), true);
  assert.equal(motionGenerationCheck(R2, { request: input.request, proposal: p }), null, 'unchanged: not stale');
});

test('what makes a quote stale: the maximum, the estimate, the price version, the policy version, the renderer configuration, or a proposal signed before the maximum existed', async () => {
  const p = await sign(R2);
  const check = env => motionGenerationCheck(env, { request: input.request, proposal: p });
  const maxChanged = check({ ...R2, MOTION_MAX_CHARGE_USD: '4.00' });
  assert.deepEqual([maxChanged.code, maxChanged.quote.max_credits, maxChanged.quote.estimate_credits], [MOTION_QUOTE_STALE, 400, 100], 'a new maximum is a stale quote answered with the UPDATED one');
  assert.match(maxChanged.error, /can cost up to 400 credits\. Review it and press Generate again to confirm\./);
  assert.equal(check({ ...R2, MOTION_ESTIMATE_USD: '1.10' }).code, MOTION_QUOTE_STALE, 'estimate');
  assert.equal(check({ ...R2, MOTION_PRICE_TABLE: JSON.stringify({ version: 'b1', buckets: [{ aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, estimate_usd: 1 }] }) }).code, MOTION_QUOTE_STALE, 'price version at the same amount');
  assert.equal(check({ ...R2, MOTION_READY_POLICY: JSON.stringify({ ...READY_POLICY, version: 'p-next' }) }).code, MOTION_QUOTE_STALE, 'policy version');
  assert.equal(check({ ...R2, MOTION_RENDERER_CONFIG: 'r-other', MOTION_READY_POLICY: JSON.stringify({ ...READY_POLICY, renderer_config: 'r-other' }) }).code, 'motion_renderer_changed', 'renderer configuration');
  const { max_credits: _m, ...unsignedBinding } = p.input.binding; // eslint-disable-line no-unused-vars
  assert.equal(motionGenerationCheck(R2, { request: input.request, proposal: { ...p, input: { ...p.input, binding: unsignedBinding } } }).code, MOTION_QUOTE_STALE, 'a quote signed before the maximum existed');
  // Nothing the stale answers say is money in dollars.
  assert.deepEqual(moneyLeaks({ code: maxChanged.code, error: maxChanged.error, quote: maxChanged.quote }), []);
});

test('a maximum that is unset or invalid blocks Generate: the card never states the estimate alone', async () => {
  for (const bad of [undefined, '', 'about 3.5', '0', '-1', '3.5.0', '25.01', '1e2']) assert.equal(motionMaxCredits({ MOTION_MAX_CHARGE_USD: bad }), null, String(bad));
  assert.equal(motionMaxCredits({ MOTION_MAX_CHARGE_USD: '3.50' }), 350);
  assert.equal(motionMaxCredits({ MOTION_MAX_CHARGE_USD: '3.501' }), 351, 'rounded up, never below what could be charged');
  const p = await sign(R2);
  assert.deepEqual(motionGenerationCheck(R2_WITHOUT_MAX, { request: input.request, proposal: p }), { error: 'The most this video can cost is not available yet, so it cannot be generated.', code: MOTION_MAX_UNKNOWN });
  // A proposal made while no maximum is configured: its usage has no maximum and the card is blocked, with no estimate line (negative control: R2 is the
  // same proposal with the maximum, drawn above as generatable).
  const bare = await sign(R2_WITHOUT_MAX);
  assert.equal(bare.usage.estimate_credits, 100);
  assert.equal(bare.usage.max_credits, null);
  const view = proposalView(bare);
  assert.deepEqual([view.usage, view.allowed_actions.includes('generate'), view.validation_errors.some(e => e.path === 'usage')], [{ estimate_credits: null, unknown: true }, false, true]);
  assert.equal(motionBinding(R2_WITHOUT_MAX, { duration_seconds: 10 }).max_credits, null);
});

test('R2 release gate: the production Worker config, with generation not paused, makes every Motion proposal carry the estimate, the maximum and the hold', async () => {
  // MOTION_GENERATION_PAUSED "0" is R2 (the activation release). If this fails, the checked-in config would show the single estimate publicly.
  assert.equal(motionReservationMicros(R2), 8_960_000);
  const p = await sign(R2);
  const view = proposalView(p);
  assert.ok(view.usage.estimate_credits > 0 && view.usage.max_credits >= view.usage.estimate_credits && view.usage.reserve_credits >= view.usage.max_credits, JSON.stringify(view.usage));
  assert.equal(view.usage.unknown, undefined);
  for (const seconds of [5, 30, 60]) {
    const q = proposalView(await sign(R2, { settings: { duration_seconds: seconds, audio: false } }));
    assert.equal(q.usage.max_credits, 350, `${seconds} s`);
  }
});

test('no dollars, micros or currency in anything the card or the list is given', async () => {
  const p = await sign(R2);
  assert.deepEqual(moneyLeaks({ usage: p.usage, readiness: p.readiness, view: proposalView(p).usage, motionHoldCredits: 896, motionMaxCredits: 350, motionEstimateCredits: 100 }), []);
  assert.deepEqual(moneyLeaks(motionGenerationCheck({ ...R2, MOTION_MAX_CHARGE_USD: '4.00' }, { request: input.request, proposal: p })), []);
});
