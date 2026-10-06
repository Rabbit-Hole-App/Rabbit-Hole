// packages/control-plane/test/learn-journey-anti-hardcoding.test.js
// Anti-hardcoding regression, server side (docs/features/adaptive-learning-path-v1-anti-hardcoding-audit.md): the
// journey route and the Tutor evaluate route, unchanged, on the two synthetic domains of
// web/src/__fixtures__/journey-synthetic-domains.mjs - other topics, ids, counts and order than any prompt example,
// fixture or corpus - and on each domain reordered. The planners answer with the domain as the model would (a scripted
// callModel, never the fixture model), JEV is a scripted deps.ask. Covered: start (topic from the learner's words),
// intake, diagnosticOutput, the walker on keyed and free-text probes (the free-text spec rebuilt from this registry, equal
// to the browser's evaluationSpec), pathOutput, accept (only the first non-optional section is planned, sectionOutput),
// section_materialized, and a section check graded by its key. node:sqlite as LEARN_DB; no real model call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { journeyRoute } from '../src/learn-journey.js';
import { tutorRoute } from '../src/learn-tutor-routes.js';
import { tutorJevRequest } from '../src/agents/learn-tutor.js';
import { JEV_TRANSPORTS } from '../src/learn-grade-jev.js';
import { evaluationSpec } from '../../web/src/learn-tutor.js';
import { AQUEDUCTS, TIDES, reordered } from '../../web/src/__fixtures__/journey-synthetic-domains.mjs';

const APP = 'canvas-5e6f7a8b', BOARD = 'main', WHO = { email: 'ida@test', org: 'ws-ida', user_id: 'u-ida-31' };
const never = { ask: async () => { throw new Error('JEV must not be called'); }, callModel: async () => { throw new Error('no model call'); } };
// JEV answering every question: values[key], else a confident no. Records each request.
function jev(values = {}) {
  const asked = [];
  const ask = async (_env, request) => {
    asked.push(request);
    return { body: { answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { type: 'noul', noul: values[key] ?? 0.02 }])) } };
  };
  return { asked, ask };
}

function serve(t, D) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      if (request.headers.get('cookie') !== 'small_session=ida') return new Response('sign in', { status: 401 });
      return new URL(request.url).pathname === '/api/me' ? Response.json({ ...WHO, orgName: null }) : new Response('no', { status: 404 });
    },
  };
  sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run(WHO.org, APP, WHO.email, 'A canvas');
  const env = { LEARN_DB, CONTROL_PLANE, TYPESAFE_API_KEY: 'jev' };
  // The planners answer with this domain, as the model would; any other role is a failure of the test.
  const calls = [], REPLIES = { journey_diagnostic: D.diagnostic, journey_path: D.path, journey_section: D.plan };
  const callModel = async (_e, body) => {
    const role = body.tools[0].name, text = body.messages[0].content;
    calls.push({ role, input: JSON.parse(text.slice(text.indexOf('input = ') + 8)) });
    assert.ok(REPLIES[role], `unexpected planner ${role}`);
    return Response.json({ content: [{ type: 'tool_use', name: role, input: structuredClone(REPLIES[role]) }] });
  };
  const request = (path, body) => new Request(`https://app.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'small_session=ida' }, body: JSON.stringify({ app: APP, board: BOARD, ...body }) });
  const reply = async response => ({ status: response.status, body: await response.json() });
  return {
    calls,
    journey: async body => reply(await journeyRoute('/api/learn/journey', request('/api/learn/journey', body), env, { callModel })),
    evaluate: async (body, deps) => reply(await tutorRoute('/api/learn/tutor/evaluate', request('/api/learn/tutor/evaluate', body), env, deps)),
  };
}

async function run(t, D) {
  const s = serve(t, D), probes = D.diagnostic.probes;
  let r = await s.journey({ action: 'start', text: D.text });
  assert.equal(r.status, 200);
  for (const [slot, option_id] of D.intake) {
    assert.equal(r.body.tray.slot, slot);
    r = await s.journey({ action: 'intake_answer', slot, option_id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.deepEqual([s.calls[0].role, s.calls[0].input.topic], ['journey_diagnostic', D.topic], 'the topic is the learner\'s, read from the text');
  const id = r.body.journey.id, results = [];
  for (const [probe_id, answer, result] of D.walk) {
    assert.equal(r.body.tray.probe_id, probe_id, 'the walker asks this ladder\'s own probe');
    const probe = probes.find(p => p.id === probe_id);
    let e;
    if (answer.option_id) e = await s.evaluate({ journey_id: id, probe_id, option_id: answer.option_id }, never);
    else {
      const { asked, ask } = jev({ c0_idea0: 0.95 });
      e = await s.evaluate({ journey_id: id, probe_id, message: answer.text, answering: true, question: probe.prompt }, { ask });
      // The route's spec is rebuilt from this registry, exactly as the browser's evaluationSpec builds it.
      const spec = evaluationSpec({ answering: true }, probe.claims, { events: [], open: { text: probe.prompt } }, { claims: D.diagnostic.registry.claims });
      assert.deepEqual(asked[0], tutorJevRequest(spec, answer.text, JEV_TRANSPORTS.direct.model));
    }
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.deepEqual(e.body.events.map(ev => ev.claim), probe.claims);
    assert.ok(e.body.events.every(ev => (result === 'pass' ? ev.result === 'pass' : ev.result === 'fail' || ev.result === 'misconception')));
    results.push(...e.body.events.map(ev => [ev.claim, ev.result, ev.kind, ev.misconception_id ?? null]));
    r = await s.journey({ action: 'probe_advance', probe_id });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  // The walk stopped by the walker's rules, on this ladder; the draft rests on this registry and its evidence.
  assert.equal(r.body.journey.state, 'path_review');
  const draft = s.calls.at(-1);
  assert.equal(draft.role, 'journey_path');
  assert.deepEqual(draft.input.registry, D.diagnostic.registry);
  assert.equal(draft.input.diagnostic_evidence_refs.length, results.length);
  assert.deepEqual(r.body.path.sections.map(x => x.id), D.path.path.sections.map(x => x.id));
  assert.equal(r.body.tray.mode, 'path_preview');

  // Accept: the first section that is not optional is current, and only it is planned.
  r = await s.journey({ action: 'accept' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.journey.state, r.body.journey.active_section_id], ['active', D.active]);
  assert.deepEqual(s.calls.filter(c => c.role === 'journey_section').map(c => c.input.section.id), [D.active]);
  const before = D.path.path.sections;
  assert.deepEqual(r.body.path.sections.map(x => [x.id, x.status, x.generation_state]),
    before.map(x => (x.id === D.active ? [x.id, 'current', 'planning'] : [x.id, x.status, 'not_generated'])));
  r = await s.journey({ action: 'section_materialized', journey_id: id, section_id: D.active, heading_block_id: 'hd-1' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const active = r.body.path.sections.find(x => x.id === D.active);
  assert.deepEqual([active.generation_state, active.heading_block_id], ['generated', 'hd-1']);

  // A section check is graded by its own key, tagged with this section.
  for (const check of D.plan.checks) {
    const e = await s.evaluate({ journey_id: id, probe_id: check.id, option_id: check.key.correct }, never);
    assert.equal(e.status, 200, JSON.stringify(e.body));
    results.push(...e.body.events.map(ev => [ev.claim, ev.result, ev.kind, ev.misconception_id ?? null]));
  }
  return { roles: s.calls.map(c => c.role), results, sections: r.body.path.sections.map(x => [x.id, x.status, x.generation_state]), asked: r.body.journey.diagnostic.asked.map(a => a.probe_id) };
}

for (const D of [AQUEDUCTS, TIDES]) {
  test(`anti-hardcoding route: ${D.topic} through start, intake, the walker, the path, accept and materialization`, async t => {
    const out = await run(t, D);
    assert.deepEqual(out.roles, ['journey_diagnostic', 'journey_path', 'journey_section']);
    assert.deepEqual(out.asked, D.walk.map(([id]) => id));
    assert.equal(out.results.length, D.walk.reduce((n, [id]) => n + D.diagnostic.probes.find(p => p.id === id).claims.length, 0) + D.plan.checks.reduce((n, c) => n + c.claims.length, 0));
  });

  test(`anti-hardcoding route: ${D.topic} reordered (map keys, probe options) gives the same journey and grades`, async t => {
    assert.deepEqual(await run(t, reordered(D)), await run(t, D));
  });
}
