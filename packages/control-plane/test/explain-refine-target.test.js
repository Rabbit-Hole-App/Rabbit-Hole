// The proposal card's Edit on an /explain brief (conversational editing): the composer's instruction names the revision it was
// written for (refine { message, proposal: { proposal_id, version } }), and the job refines only the published current revision of
// its brief, through the real job (explain-fixture.js) and its scripted brief call. A refinement without it keeps today's behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explainPipeline } from '../src/explain-job.js';
import { proposalRecord } from '../src/generation-proposal.js';
import { BOARD, OWNER, explainStack, rows } from './explain-fixture.js';

const STUB_RENDER = async () => ({ captures: [{ id: 'light', data: 'iVBORw0KGgo=', mediaType: 'image/png' }], renders: [{ ok: true }] });
const brief = (extra = {}) => ({ title: 'Where rain comes from', summary: 'The card follows water from the sea to the sky and back. Sunlight warms the sea and vapour rises. It cools into clouds and falls as rain.', presentation: 'static', components: ['flow'], assumptions: ['x'], ambiguous: false, expanded: false, ...extra });
function scripted(t, queues) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body), name = body.tools[0].name, input = queues[name]?.shift();
    calls.push(name);
    if (input === undefined) throw new Error(`no scripted reply for ${name}`);
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name, input }], stop_reason: 'tool_use', usage: { input_tokens: 1500, output_tokens: 400 } });
  };
  return { count: name => calls.filter(c => c === name).length };
}
const posted = s => rows(s.sqlite, 'chat_message_meta').map(r => JSON.parse(r.meta_json)).filter(m => m.proposal);

test('Edit on a brief: the instruction refines exactly the revision it names; another or an older revision is refused with no model call', async t => {
  const s = explainStack(t, { pipeline: { ...explainPipeline, render: STUB_RENDER } });
  s.sqlite.prepare("INSERT INTO threads (id, org, user, scope_ref) VALUES ('th1', ?, ?, ?)").run(OWNER.org, OWNER.email, BOARD.app);
  const model = scripted(t, { explain_brief: [brief(), brief({ title: 'Rain over time', presentation: 'time' })] });
  const { body } = await s.create({ requestClass: 'researched', threadId: 'th1', prompt: 'Explain where rain comes from.' });
  assert.equal((await s.run(body.job.id)).stage, 'awaiting_approval');
  const v1 = posted(s)[0].proposal, named = p => ({ proposal_id: p.proposal_id, version: p.version });
  // A revision it does not have, or another proposal: refused before any brief call; the brief still waits, unchanged.
  for (const proposal of [{ ...named(v1), version: 2 }, { ...named(v1), proposal_id: 'gp-ffffffffffffffff' }, null]) {
    const refused = await s.send('refine', { message: 'Show it over time.', proposal }, body.job.id);
    assert.deepEqual([refused.status, refused.body.code], [409, 'brief_stale'], JSON.stringify(proposal));
  }
  assert.equal((await s.job(body.job.id)).job.stage, 'awaiting_approval');
  assert.equal(model.count('explain_brief'), 1, 'no brief call for a refused Edit');
  // The named current revision: refined into the next version of the same proposal, on the same job.
  assert.equal((await s.send('refine', { message: 'Show it over time.', proposal: named(v1) }, body.job.id)).status, 202);
  assert.equal((await s.run(body.job.id)).stage, 'awaiting_approval');
  const v2 = posted(s)[1].proposal;
  assert.deepEqual([v2.proposal_id, v2.version, v2.title, v2.input.job], [v1.proposal_id, 2, 'Rain over time', body.job.id]);
  assert.equal((await proposalRecord(s.env.LEARN_DB, OWNER.email, BOARD.app, v1.proposal_id)).current.version, 2);
  // The old card's Edit, sent after v2 was published: refused; v1 is history, never revised again.
  const stale = await s.send('refine', { message: 'Smaller.', proposal: named(v1) }, body.job.id);
  assert.deepEqual([stale.status, stale.body.code], [409, 'brief_stale']);
  assert.equal(model.count('explain_brief'), 2);
  // Generate on the edited revision is still the learner's own press: a refine never approves.
  assert.equal((await s.job(body.job.id)).job.stage, 'awaiting_approval');
});
