#!/usr/bin/env node
// scripts/interact/run.mjs: the offline entry to the SAME stage implementation the durable /interact job uses (packages/control-plane/src/
// interact-runner.js). INT-07B-C06 to C10. Fixture mode (--fixture) has no provider transport at all: roles are scripted, capture runs the sealed
// programs in the pinned engine in this process, and the run reports zero paid calls.
//   node scripts/interact/run.mjs --fixture toss-drop-standard --depth balanced --until plan --run-dir .tmp/interact-plan
//   node scripts/interact/run.mjs --resume .tmp/interact-plan --until card --approve-plan-hash <the hash the first command printed>
// Exit: 0 reached the requested stage; 1 failed, blocked or incomplete (no card); 2 usage error or a refused approval.
import { parseArgs } from 'node:util';
import { basename, resolve } from 'node:path';
import { fixtureRun, FIXTURE_IDS } from '../../packages/control-plane/src/interact-fixtures.js';
import { resolveInteractProfile } from '../../packages/control-plane/src/interact-models.js';
import { runInteract } from '../../packages/control-plane/src/interact-runner.js';
import { createRunDirStore } from './run-dir-store.mjs';
import { depthOf } from '../../packages/control-plane/src/chat-depth.js';

const DEFAULT_PROMPT = { 'toss-drop-standard': 'Why does a ball thrown straight up still accelerate at the top, when its velocity is zero?', 'pendulum-period': 'Does a longer pendulum swing more slowly, and by how much?' };
const say = line => console.log(line);
const die = (code, line) => { console.error(`x ${line}`); process.exit(code); };

const { values: a } = parseArgs({ options: {
  prompt: { type: 'string' }, depth: { type: 'string' }, profile: { type: 'string' }, until: { type: 'string' }, 'run-dir': { type: 'string' }, resume: { type: 'string' },
  'approve-plan-hash': { type: 'string' }, fixture: { type: 'string' }, 'cap-usd': { type: 'string' }, help: { type: 'boolean' },
}, strict: true });
if (a.help) { say('usage: run.mjs (--fixture <id> --depth balanced|detailed | --prompt <text> --depth <d> --cap-usd <n>) --run-dir <dir> [--until plan|card] [--profile <id>]\n       run.mjs --resume <dir> --until card --approve-plan-hash <hash>\nfixtures: ' + FIXTURE_IDS.join(', ')); process.exit(0); }

const dir = a.resume ?? a['run-dir'];
if (!dir) die(2, 'give --run-dir <dir> (a new run) or --resume <dir>');
const until = a.until ?? 'plan';
if (!['plan', 'card'].includes(until)) die(2, '--until is plan or card');
const store = createRunDirStore(resolve(dir));
const saved = await store.load();
if (a.resume && !saved) die(2, `${dir} holds no run to resume`);
if (!a.resume && saved) die(2, `${dir} already holds run ${saved.runId}; use --resume ${dir} to continue it, or choose a new --run-dir`);

const fixture = saved?.request.fixture ?? a.fixture;
const depth = depthOf(saved?.request.depth ?? a.depth ?? 'balanced'); // the old names still work on the command line and in a saved run
if (!fixture) {
  // ponytail: the paid standalone path needs the design stage (interact-design.js, the design lane) and an admitted transport with the product's
  // spending policy (INT-07B-C11); neither is wired into this script yet, and it never takes a raw key. Fixture runs are the supported path here.
  if (!(Number(a['cap-usd']) > 0)) die(2, 'a paid run needs a positive --cap-usd; use --fixture for an offline run');
  die(2, 'the paid standalone path is not wired in this build (it needs the design stage and an admitted transport); use --fixture');
}
let profile;
try { profile = resolveInteractProfile(a.profile ?? saved?.profile.id ?? 'opus-baseline'); } catch (error) { die(2, error.message); }
const fx = await fixtureRun(fixture, depth).catch(error => die(2, error.message));
const request = { runId: saved?.runId ?? `fixture-${fixture}-${depth}-${basename(resolve(dir))}`, prompt: saved?.request.prompt ?? a.prompt ?? DEFAULT_PROMPT[fixture], depth, fixture };

say(`ok fixture: ${fixture} (${depth}), scripted roles, zero paid calls`);
say(`ok profile: ${profile.id}@${profile.version}`);
let state;
try { state = await runInteract(request, { ctx: { ...fx, profile, applyEffect: effect => store.applyEffect(effect) }, store, until, approvedPlanHash: a['approve-plan-hash'] ?? null }); }
catch (error) { die(error.code === 'profile_mismatch' || error.code === 'request_mismatch' ? 2 : 1, `${error.code ?? 'error'}: ${error.message}`); }

if (state.planHash) say(`ok plan: "${state.plan.title}" planHash=${state.planHash}`);
if (state.stage === 'plan_ready' && state.refused) die(2, `approval refused: ${state.refused.reason}`);
if (state.stage === 'plan_ready' && until === 'card') die(2, 'the plan is ready; approve it with --approve-plan-hash <hash> (the hash printed above)');
if (state.stage === 'plan_ready') {
  say('ok stage: plan_ready (a plan only, no card was built)');
  say(`next: node scripts/interact/run.mjs --resume ${dir} --until card --approve-plan-hash ${state.planHash}`);
  process.exit(0);
}
if (state.approval) say(`ok approval: ${state.approval.planHash.slice(0, 12)} matches the ready plan`);
if (state.composition) say(`ok composition: ${state.composition.order.join(' > ')}  envelopeHash=${state.composition.envelopeHash}`);
if (state.check) say(`ok checks: ${state.check.cases.length} captures, ${state.check.oracle.checked} oracle comparisons, ${state.round} correction round(s)`);
if (state.stage === 'card_ready') { say(`ok card_ready: ${state.calls.length} scripted role calls, 0 paid calls`); process.exit(0); }
console.error(`x ${state.stage}: ${state.failure?.reason ?? state.failure?.kind ?? 'no card was made'}`);
process.exit(1);
