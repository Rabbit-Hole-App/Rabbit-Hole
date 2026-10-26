// IMG-01 public activation: the three CODE gates that open image generation to everyone move together or not at all, and the public
// flag never widens what only the owner may do. PUBLIC below is the one reviewed switch. The inert tip leaves it false. The held
// flip commit (branch feat/image-activation-public-flip, FOR OWNER GO ONLY) changes PUBLIC and the three gates in one commit:
// changing any one of them alone fails the first test, naming the gate that disagrees.
//   web          export const IMAGE_GENERATION            web/src/agent/slash.js
//   primitive    PRIMITIVES.image_generate.ready          control-plane/src/learn-primitives.js
//   server       vars.IMAGE_GENERATE_ENABLED === 'true'   web/wrangler.rabbit-hole-prod.jsonc (the Worker behind digrabbithole.com)
// Not a gate, and untouched by the flip: IMAGE_ACCEPTANCE_EMAILS (the owner-only path), IMAGE_GENERATE_RESERVED_USD (the hold), the
// provider secrets, TRANSCRIBE_ENABLED, and the dev configs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGE_GENERATION } from '../../web/src/agent/slash.js';
import { isReady } from '../src/learn-primitives.js';
import { imageAllowed, imageOperatorAllowed } from '../src/image-settings.js';
import { imageJobsEnabled, imageJobsRoute } from '../src/image-jobs.js';
import { artifactPlan, generateArtifact } from '../src/learn-artifact.js';

const PUBLIC = true; // public activation (owner GO): set together with the primitive and the server flag
// The web constant is NOT flipped (decision in the hand-back): with the server's flag public, GET /api/learn/image-jobs answers available for everyone and the build
// lists the command from that answer (image-capability.js). Flipping the constant too would make the UI offer the command whatever the server says, so turning the
// server flag off (the rollback) would leave it listed and refused, and it rewrites 20 web tests written for the per-caller design.
const WEB_CONSTANT = false;

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const SOURCES = { web: read('../../web/src/agent/slash.js'), primitive: read('../src/learn-primitives.js'), server: read('../../web/wrangler.rabbit-hole-prod.jsonc') };
const jsonc = text => JSON.parse(text.split('\n').filter(line => !line.trim().startsWith('//')).join('\n'));
const bool = (text, pattern, what) => { const m = text.match(pattern); assert.ok(m, `${what} not found: the gate moved, update this test with it`); return m[1] === 'true'; };
// The three gates read from source text, so a single flip can be simulated on the real files.
const gatesOf = s => ({
  web: bool(s.web, /export const IMAGE_GENERATION = (true|false);/, 'IMAGE_GENERATION'),
  primitive: bool(s.primitive, /\n\s*image_generate: \{ ready: (true|false)/, 'image_generate.ready'),
  server: jsonc(s.server).vars.IMAGE_GENERATE_ENABLED === 'true',
});
const uniform = g => g.primitive === g.server && g.web === WEB_CONSTANT; // the gates that must move together, and the one that must not move
const prodVars = jsonc(SOURCES.server).vars;
const OWNERS = String(prodVars.IMAGE_ACCEPTANCE_EMAILS).split(/\s+/);
const LEARNER = 'learner@example.test', LOOKALIKE = 'yudhisteer.chin01@gmail.com';

test('the three code gates agree with each other and with the one reviewed switch', () => {
  assert.deepEqual(gatesOf(SOURCES), { web: WEB_CONSTANT, primitive: PUBLIC, server: PUBLIC }, 'primitive ready flag and server flag must both equal PUBLIC; the web constant stays at WEB_CONSTANT');
  // The text the test reads is the code that runs.
  assert.equal(IMAGE_GENERATION, WEB_CONSTANT);
  assert.equal(isReady('image_generate'), PUBLIC);
  assert.equal(imageJobsEnabled(prodVars), PUBLIC);
});

test('negative control: flipping the primitive, the server flag or the web constant alone, or the web constant with either, is caught on the real files', () => {
  const flip = {
    web: s => ({ ...s, web: s.web.replace(/(export const IMAGE_GENERATION = )(true|false);/, (_, a, b) => `${a}${b === 'true' ? 'false' : 'true'};`) }),
    primitive: s => ({ ...s, primitive: s.primitive.replace(/(\n\s*image_generate: \{ ready: )(true|false)/, (_, a, b) => `${a}${b === 'true' ? 'false' : 'true'}`) }),
    server: s => ({ ...s, server: s.server.replace(/("IMAGE_GENERATE_ENABLED": ")(true|false)"/, (_, a, b) => `${a}${b === 'true' ? 'false' : 'true'}"`) }),
  };
  const names = Object.keys(flip);
  for (const one of names) {
    const g = gatesOf(flip[one](SOURCES));
    assert.equal(uniform(g), false, `flipping only ${one} must be caught`);
    assert.notEqual(g[one], one === 'web' ? WEB_CONSTANT : PUBLIC, `${one} really flipped`);
  }
  for (const skip of ['primitive', 'server']) assert.equal(uniform(gatesOf(names.filter(n => n !== skip).reduce((s, n) => flip[n](s), SOURCES))), false, `flipping all but ${skip} must be caught`);
  // The one allowed move: the primitive and the server flag together (what the flip commit does) is uniform and is the opposite of PUBLIC.
  const both = gatesOf(['primitive', 'server'].reduce((s, n) => flip[n](s), SOURCES));
  assert.equal(uniform(both), true);
  assert.equal(both.server, !PUBLIC);
});

test('the committed production config: only the listed owner reaches image generation unless the public gate is on', async () => {
  assert.deepEqual(OWNERS, ['user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid', 'yudhisteer.chin@gmail.com']);
  for (const owner of OWNERS) assert.equal(imageAllowed(prodVars, owner), true, `the owner path works: ${owner}`);
  assert.equal(imageAllowed(prodVars, LEARNER), PUBLIC);
  assert.equal(imageAllowed(prodVars, LOOKALIKE), PUBLIC, 'a look-alike address is a learner');
  assert.equal(imageAllowed(prodVars, null), PUBLIC);
  // What the browser is told (GET /api/learn/image-jobs): available for a learner exactly when public; operatorOnly only while it is not.
  const env = { ...prodVars, IMAGE_JOBS: {}, LEARN_DB: {}, LEARN_MEDIA: {} };
  const capability = async email => (await imageJobsRoute('/api/learn/image-jobs', new Request('https://app.example/api/learn/image-jobs'), env, { identity: async () => ({ org: 'o', email }) })).json();
  const learner = await capability(LEARNER), owner = await capability(OWNERS[1]);
  assert.equal(learner.available, PUBLIC);
  assert.equal(learner.operatorOnly, undefined);
  assert.deepEqual([owner.available, owner.operatorOnly], [true, PUBLIC ? undefined : true]);
});

test('the public gate never widens operator-only surfaces: inspect (dollar data) and fault injection', async () => {
  const env = { ...prodVars, IMAGE_JOBS: { idFromName: () => assert.fail('ImageJobs addressed'), get: () => assert.fail('ImageJobs addressed') }, LEARN_DB: {}, LEARN_MEDIA: {} };
  const identity = async () => ({ org: 'o', email: LEARNER });
  assert.equal(imageOperatorAllowed(prodVars, LEARNER), false);
  const inspect = await imageJobsRoute(`/api/learn/image-jobs/img-${'a'.repeat(16)}/inspect`, new Request('https://app.example/x'), env, { identity });
  assert.equal(inspect.status, 404, 'a learner never reads inspect');
  const create = await imageJobsRoute('/api/learn/image-jobs', new Request('https://app.example/api/learn/image-jobs', { method: 'POST', body: JSON.stringify({ generationId: `img-${'a'.repeat(16)}`, app: 'canvas-1', proposal: { x: 1 }, fault: 'provider_400' }) }), env, { identity });
  const body = await create.json();
  // Off: refused as off. Public: past the gate, the fault is still the operators' alone. Either way nothing is created.
  assert.deepEqual([create.status, body.code], PUBLIC ? [400, 'fault_not_allowed'] : [503, 'image_generation_disabled']);
});

test('the primitive is not a model path: /generate-image never reaches the planning model, whichever way the gates stand', async () => {
  const plan = artifactPlan('generate-image', { args: 'a red lighthouse' });
  assert.equal(plan.result, 'unsupported');
  let called = 0;
  const out = await generateArtifact({}, { command: 'generate-image', args: 'a red lighthouse' }, { callModel: async () => { called++; throw new Error('the planning model was called'); } });
  assert.equal(out.result, 'unsupported');
  assert.equal(called, 0);
});
