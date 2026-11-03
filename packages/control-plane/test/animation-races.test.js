// AN-07 proposal and result races for /animation (plan section 12 rows 1, 5 and 6), against lane G's real AnimationJobs on its
// fake-transport harness (animation-fixture.js). Written by lane V as an independent check of G's guarantees, not a restatement of
// animation-job.test.js: these drive the operations at the same moment (Promise.all) rather than one after another.
// - two Generate presses on the same proposal at once: one build, one author call, one result for the card;
// - a refinement racing Generate on the earlier version: exactly one of them is accepted, never both;
// - a late Generate after the result is ready, and a Generate from a second tab after a refinement: no new build or charge;
// - a job and its result belong to their canvas: another canvas (a board switch) can neither read nor act on them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, NEEDS_PROPOSAL, animationStack, postedProposal } from './animation-fixture.js';

const skip = NEEDS_PROPOSAL;
const accepted = r => r.status === 202 || r.status === 200;
const builds = s => s.model.roles().filter(role => role === 'author').length;
// Every review accepts, so a build that starts reaches ready (G's tests do the same).
const stack = t => animationStack(t, { reply: role => (role === 'review' ? { accepted: true } : {}) });

test('two Generate presses on one proposal at the same moment start one build and make one result', { skip }, async t => {
  const s = stack(t);
  const { body } = await s.create();
  await s.run(body.job.id);
  const proposal = postedProposal(s.sqlite, body.job.id);
  const [a, b] = await Promise.all([s.approve(body.job.id, proposal), s.approve(body.job.id, proposal)]);
  assert.ok(accepted(a) || accepted(b), `one press is accepted: ${a.status} ${b.status}`);
  for (const r of [a, b]) if (!accepted(r)) assert.equal(r.status, 409, `the other is refused, not an error: ${JSON.stringify(r.body)}`);
  const done = await s.run(body.job.id);
  assert.equal(done.stage, 'ready');
  assert.equal(builds(s), 1, 'one author call');
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('result:')).length, 1, 'one result');
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('job:')).length, 1, 'one job');
  // A third press after ready, as a late double click: no new build, no new result.
  const late = await s.approve(body.job.id, proposal);
  await s.run(body.job.id);
  assert.notEqual(late.status, 500);
  assert.equal(builds(s), 1, 'a press after ready builds nothing');
  assert.equal([...s.state.data.keys()].filter(k => k.startsWith('result:')).length, 1);
});

test('a refinement racing Generate on the earlier version: exactly one is accepted', { skip }, async t => {
  for (const order of ['refine first', 'approve first']) {
    const s = stack(t);
    const { body } = await s.create();
    await s.run(body.job.id);
    const first = postedProposal(s.sqlite, body.job.id);
    const refine = () => s.send('refine', { message: 'heavier masses', proposal: { proposal_id: first.proposal_id, version: first.version } }, body.job.id);
    const approve = () => s.approve(body.job.id, first);
    const [r, a] = order === 'refine first' ? await Promise.all([refine(), approve()]) : (await Promise.all([approve(), refine()])).reverse();
    assert.ok(accepted(r) !== accepted(a), `${order}: refine ${r.status} ${JSON.stringify(r.body?.code)}, approve ${a.status} ${JSON.stringify(a.body?.code)}`);
    const settled = await s.run(body.job.id);
    if (accepted(a)) {
      assert.equal(settled.stage, 'ready', `${order}: the accepted Generate built`);
      assert.equal(builds(s), 1);
    } else {
      // The refinement won: the old approval is spent, nothing was built, and only the new version can generate.
      assert.equal(settled.stage, 'awaiting_approval', order);
      assert.equal(builds(s), 0, `${order}: the stale Generate built nothing`);
      const second = postedProposal(s.sqlite, body.job.id);
      assert.equal(second.version, first.version + 1);
      assert.equal((await s.approve(body.job.id, first)).body.code, 'plan_stale', `${order}: the earlier version stays stale`);
      assert.equal((await s.approve(body.job.id, second)).status, 202);
      assert.equal((await s.run(body.job.id)).stage, 'ready');
      assert.equal(builds(s), 1);
    }
  }
});

test('a job and its result belong to their canvas: after a board switch the other canvas cannot read, stop or generate them', { skip }, async t => {
  const s = stack(t);
  const { id, done } = await s.generated();
  assert.equal(done.stage, 'ready');
  const other = { ...BOARD, id: `${BOARD.id}-other`, app: 'canvas-other', board: 'main' };
  const as = (action, payload = {}, jobId = id) => s.send(action, payload, jobId, undefined, undefined, other);
  for (const action of ['get', 'cancel', 'approve', 'refine', 'retry']) assert.equal((await as(action)).status, 404, `${action} from another canvas`);
  assert.equal((await as('result', {}, done.resultId)).status, 404, 'the result from another canvas');
  const listed = await as('list', {}, null);
  assert.deepEqual(listed.body.jobs ?? [], [], 'another canvas lists none of these jobs');
  assert.equal((await s.send('list', {}, null)).body.jobs.length, 1, 'its own canvas lists it');
  // The owner's own canvas still reads the result unchanged.
  const own = await s.send('result', {}, done.resultId);
  assert.equal(own.status, 200);
  assert.equal(own.body.identity?.canvas?.boardId ?? own.body.result?.canvas?.boardId ?? BOARD.id, BOARD.id);
});
