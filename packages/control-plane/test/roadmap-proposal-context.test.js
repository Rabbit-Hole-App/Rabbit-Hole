// R5.03 server side: the proposal ContextRef passes the existing validator in exactly one shape, and its description is read from the actor's own row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { contextRefs } from '../src/chat-modes.js';
import { proposalContext } from '../src/roadmap/roadmap-proposal-context.js';
import { world, offered, rows } from './roadmap-fixture.js';

const ref = (id, extra = {}) => ({ kind: 'proposal', sourceId: `proposal:${id}`, name: 'Step one', version: '1', range: null, ...extra });
const user = (w, who = 'u-alice') => ({ org: 'team', email: `${who}@example.test`, userId: who });

test('contextRefs: one exact shape; wrong id, version, range and forged text are refused', () => {
  const id = 'pr_c0ffee0123456789abcdef02';
  assert.deepEqual(contextRefs([ref(id)]), [{ sourceId: `proposal:${id}`, kind: 'proposal', name: 'Step one', version: '1', range: null }]);
  for (const bad of [ref('pr_short'), ref('not-a-proposal'), ref(id, { version: 'abc' }), ref(id, { version: '0' }), ref(id, { range: { page: 1 } }), ref(id, { range: { quote: 'x' } }), ref(id, { text: 'FORGED BODY' }), ref(id, { sourceId: 'card:cd_1' }), ref(id, { name: '' })]) assert.throws(() => contextRefs([bad]), Error, JSON.stringify(bad).slice(0, 80));
  const ok = contextRefs([ref(id, { roadmapId: 'rm_x', stepId: 'st_x', title: 'forged' })])[0];
  assert.deepEqual(Object.keys(ok).sort(), ['kind', 'name', 'range', 'sourceId', 'version'], 'extra roadmap or step fields are dropped, not kept');
});

test('proposalContext reads the description from the actor row and refuses another learner, an unknown id and a version the learner did not see', async t => {
  const w = world(t);
  const o = await offered(w, w.access);
  const mine = ref(o.proposalId);
  const found = await proposalContext(w.env, user(w), [mine]);
  assert.deepEqual(found.refused, []);
  assert.match(found.text, /Title: Step one/);
  assert.match(found.text, /What it would cover: About Y/);
  assert.match(found.text, /not an explanation the learner has received/);
  assert.doesNotMatch(found.text, /\$|credit|price|answer/i);
  assert.deepEqual((await proposalContext(w.env, user(w, 'u-bob'), [mine])).refused, [mine.sourceId], 'another learner');
  assert.deepEqual((await proposalContext(w.env, user(w), [ref('pr_000000000000000000000000')])).refused, ['proposal:pr_000000000000000000000000']);
  assert.deepEqual((await proposalContext(w.env, user(w), [ref(o.proposalId, { version: '2' })])).refused, [mine.sourceId], 'a stale version');
  assert.deepEqual((await proposalContext(w.env, user(w), [mine], { boardId: 'lb_board00000000000003' })).refused, [mine.sourceId], 'the wrong board');
  assert.equal(rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n, 0, 'reading context buys nothing and accepts nothing');
  assert.equal(rows(w.sqlite, "SELECT state FROM learn_step_proposals")[0].state, 'pending');
});
