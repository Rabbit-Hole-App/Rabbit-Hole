// packages/control-plane/test/learn-attempt-fixture.js
// Shared world for the attempt-store and assessment tests (Tutor Tasks 05 and 06).
//   * node:sqlite built from repository-schema.sql: learn 0025 and 0026 included.
//   * Goals, criteria and activities are made through Task 02's real coaching actions, so the attempt store reads what
//     the producer writes.
//   * No provider is ever reached. JEV is deps.ask and the larger evaluator deps.callModel; the stubs count their calls.
import { learnDb } from './learn-grade-fixture.js';
import { applyCoachingAction, readCoachingState } from '../src/learn-coaching-store.js';
import { createJourney, goalIdOf, saveJourney } from '../src/learn-journey-store.js';
import { fixtureFor } from '../src/learn-journey-fixtures.js';
import { attemptRoute } from '../src/learn-attempt-routes.js';

export const ANA = { org: 'team-ws', userId: 'u-ana-5d1e', app: 'canvas-0a1b2c3d', board: 'main' };
export const BEN = { ...ANA, userId: 'u-ben-7f2a' };
const DIAG = fixtureFor('journey_diagnostic', { topic: 'logistic regression', intake: { slots: {} } });
export const REG = DIAG.registry;
export const MECH = 'logistic-regression-core/mechanism'; // one idea, misconception mechanism-confusion, one prerequisite
export const CHECK = { id: 'c1', kind: 'mcq', prompt: 'Which holds?', options: [{ id: 'x', label: 'One' }, { id: 'y', label: 'Two' }], claims: [MECH], purpose: 'check', transfer: false, key: { correct: 'y', misconceptions: { x: 'mechanism-confusion' } } };
export const CRITERION = { criterionId: 'mech', label: 'Explain the mechanism', requirement: 'Explain how the score becomes a probability', requiresReasoning: true, skillKey: MECH };
const START = { request: { raw_user_message: 'I want to learn logistic regression', topic: 'logistic regression', intent: { kind: 'learning_journey', topic: 'logistic regression' }, channel: 'text' }, grounding: { kind: 'topic' }, intake: { slots: {} } };
const scopeOf = a => ({ org: a.org, owner_user_id: a.userId, app: a.app, board: a.board });

export function world(t, envExtra = {}) {
  const { LEARN_DB, sqlite } = learnDb(t);
  sqlite.prepare('INSERT INTO canvases(org, name, owner_email, title) VALUES (?, ?, ?, ?)').run(ANA.org, ANA.app, 'ana@test', 'Logistic regression');
  return { sqlite, env: { LEARN_DB, SMALL_ENV: 'test', TYPESAFE_API_KEY: 'jev', ...envExtra } };
}

let seq = 0;
export const act = async (env, actor, action, payload) =>
  applyCoachingAction(env, actor, { actionId: `act-${++seq}`, expectedRevision: (await readCoachingState(env, actor)).revision, action, payload });

// A journey-backed goal: its registry holds MECH and its current section plan holds the keyed check c1. The goal gets
// criteria (skillKey = MECH) and a current activity.
export async function journeyActivity(env, actor = ANA, { responseKind = 'text', criteria = [CRITERION], sourceRefs = [], prompt = 'In one or two sentences, what is the core idea?', checkpoint } = {}) {
  const created = await createJourney(env, scopeOf(actor), START);
  const journey = await saveJourney(env, { ...created, state: 'active', registry: REG, diagnostic: { probes: DIAG.probes, asked: [], skipped: false }, active_section_id: 's1', section_plan: { section_id: 's1', checks: [CHECK] } }, 0);
  const goalId = goalIdOf(journey.id);
  await act(env, actor, 'change_scope', { goalId, criteria });
  const state = (await act(env, actor, 'activate_activity', { activity: { goalId, objective: 'Explain the mechanism', prompt, responseKind, criterionRefs: criteria.map(c => ({ criterionId: c.criterionId, version: 1 })), sourceRefs, ...(checkpoint ? { checkpoint } : {}) } })).state;
  return { journey, goalId, activity: state.activities.find(a => a.activityId === state.activeActivityId) };
}

// A JEV stub answering every question: values[key], else a confident no. It yields once, so concurrent callers interleave.
export function jev(values = {}) {
  const asked = [];
  const ask = async (_env, request) => {
    asked.push(request);
    await new Promise(resolve => setImmediate(resolve));
    return { body: { model: 'jev-1.13.0', answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, { type: 'noul', noul: values[key] ?? 0.02 }])) } };
  };
  return { asked, ask };
}
// The larger evaluator's stub: "yes" for the keys in yes, "no" for the rest, and the usage it reports.
export function larger(yes = [], usage = { input_tokens: 700, output_tokens: 40 }) {
  const calls = [];
  const callModel = async (_env, body, model) => {
    calls.push({ body, model });
    const keys = body.messages[0].content.match(/keys are exactly (.+) and whose values/)[1].split(', ');
    return Response.json({ model: 'claude-opus-5-5', usage, content: [{ type: 'text', text: JSON.stringify(Object.fromEntries(keys.map(k => [k, yes.includes(k) ? 'yes' : 'no']))) }] });
  };
  return { calls, callModel };
}
export const never = { ask: async () => { throw new Error('JEV must not be called'); }, callModel: async () => { throw new Error('no model call'); } };

// The routes as the learner calls them. authorize stands in for authorizedBoardApp: a canvas this account may open.
const authorize = actor => async () => ({ kind: 'canvas', org: actor.org, user_id: actor.userId, email: `${actor.userId}@test` });
export async function call(env, actor, method, path, body = {}, deps = {}) {
  const url = method === 'GET' ? `https://app.test${path}?app=${actor.app}&board=${actor.board}` : `https://app.test${path}`;
  const req = new Request(url, method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify({ app: actor.app, board: actor.board, ...body }) });
  const response = await attemptRoute(path, req, env, { authorize: authorize(actor), ...deps });
  const text = await response.text();
  // No users.id and no answer key ever leave the server.
  for (const leak of [ANA.userId, BEN.userId, '"key"', '"correct"']) if (text.includes(leak)) throw new Error(`response carries ${leak}`);
  return { status: response.status, body: JSON.parse(text) };
}
export const submit = (env, actor, activity, extra = {}, deps = {}) => call(env, actor, 'POST', '/api/learn/tutor/attempts', {
  activityId: activity.activityId, activityRevision: activity.revision, submissionKey: 'sub-0001-aaaa', submittedContent: { text: 'The weighted score goes through the sigmoid.' }, sourceRefs: [], assistanceRefs: [], ...extra,
}, deps);
