// E2 (docs/features/explain.md "Approved interaction contract", EXP-10-C02 E-B2, EXP-12-C05): the additive interactions envelope of a newly authored written Explanation.
// Replies go through the production validator (generateArtifact); the envelope is created in the existing ONE author call (no metadata call). Offline: no provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERACTION_GUIDANCE, INTERACTION_LIMITS, contentRevision, fieldText, interactionsCurrent, interactionsEnabled, interactionsProblem, occurrences } from '../src/explanation-interactions.js';
import { explanationChars } from '../src/learn-primitives.js';
import { EXPLANATION_CAPS } from '../src/chat-depth.js';
import { generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { generateRoadmapCard } from '../src/roadmap/roadmap-generate.js';

const ON = { EXPLANATION_INTERACTIONS: 'true' };
const body = 'A **decision tree** splits the data with simple questions. Each question sends a case down one branch, and a leaf gives the answer. The tree stays small when each question removes the most doubt. A tree with one question is a stump.';
const questions = ['Why does a tree split on one question first?', 'What makes one question better than another?', 'When should a tree stop growing?'];
const terms = [{ label: 'decision tree', definition: 'A model that answers by following branches of questions.', field: 'body', quote: 'decision tree', occurrence: 0 },
  { label: 'leaf', definition: 'An end node that holds the answer.', field: 'body', quote: 'leaf', occurrence: 0 }];
const good = { title: 'Why trees split', body, questions, terms };
const scripted = (...inputs) => { const seen = []; return { seen, callModel: async (env, b) => { seen.push(b); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: inputs[Math.min(seen.length, inputs.length) - 1] }] }); } }; };
const run = async (inputs, { env = ON, depth, over = {}, repairs } = {}) => { const m = scripted(...inputs);
  const out = await generateArtifact(env, { command: 'explanation', args: 'How do decision trees work?', ...(depth ? { depth } : {}), ...over }, { callModel: m.callModel, ...(repairs !== undefined ? { repairs } : {}) }); return { out, m }; };
const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test('the switch is off by default: the request, the schema and the block are the E1 ones', async () => {
  assert.equal(interactionsEnabled({}), false);
  const off = prepareArtifactAuthorRequest({}, { command: 'explanation', args: 'q' });
  assert.deepEqual(Object.keys(off.body.tools[0].input_schema.properties), ['title', 'body', 'more']);
  assert.doesNotMatch(off.body.tools[0].description, /exactly three distinct questions/);
  const { out } = await run([{ title: 'T', body }], { env: {} });
  assert.equal(out.result, 'artifact');
  assert.equal('interactions' in out.block, false, 'an E1 card has no envelope and needs none');
  // An unrequested extra field is still refused by the card schema while the switch is off.
  assert.equal((await quiet(() => run([good, good], { env: {} }))).out.result, 'validation_error');
});

test('on: the tool takes three questions and anchored terms; a valid answer is bound with server ids, offsets and a content revision, at every Depth, in ONE call', async () => {
  const on = prepareArtifactAuthorRequest(ON, { command: 'explanation', args: 'q' });
  const tool = on.body.tools[0];
  assert.deepEqual(Object.keys(tool.input_schema.properties), ['title', 'body', 'more', 'questions', 'terms']);
  assert.deepEqual(tool.input_schema.required, ['title', 'body', 'questions']);
  assert.ok(tool.description.includes(INTERACTION_GUIDANCE));
  for (const depth of ['overview', 'standard', 'deep']) {
    const short = { ...good, body: 'A decision tree asks questions; a leaf gives the answer.', terms: [terms[0], terms[1]] };
    const { out, m } = await run([depth === 'overview' ? short : good], { depth });
    assert.equal(out.result, 'artifact', depth);
    assert.equal(m.seen.length, 1, 'the envelope comes from the one author call');
    const it = out.block.interactions;
    assert.deepEqual([it.version, it.displayTextVersion], [1, 1]);
    assert.equal(it.questions.length, 3);
    assert.equal(it.terms.length, 2);
    assert.match(it.contentRevision, /^r1-[0-9a-f]{16}$/);
    assert.match(it.questions[0].id, new RegExp(`^q-${it.contentRevision.slice(-8)}-1$`));
    assert.equal(it.contentRevision, await contentRevision(out.block), 'the revision is of the final saved card');
    for (const t of it.terms) assert.equal(Array.from(fieldText(out.block, 'body')).slice(t.anchor.start, t.anchor.end).join(''), t.label, 'the offsets are into the canonical display text');
    assert.ok(!('questions' in out.block) && !('terms' in out.block), 'the author fields are not saved raw');
    assert.deepEqual(JSON.parse(JSON.stringify(out.block)), out.block, 'save/read round trip');
  }
  // Same card, same ids; the ids belong to the revision.
  const a = (await run([good])).out.block.interactions, b = (await run([good])).out.block.interactions;
  assert.deepEqual(a, b);
  // Zero terms is fine; the questions are not optional.
  assert.equal((await run([{ ...good, terms: [] }])).out.block.interactions.terms.length, 0);
  assert.equal((await run([{ title: 'T', body, questions }])).out.result, 'artifact');
});

test('the accepted title wins before the revision is computed and before counting', async () => {
  const { out } = await run([good], { over: {} });
  const m = scripted(good);
  const titled = await generateArtifact(ON, { command: 'explanation', args: 'q' }, { callModel: m.callModel, title: 'Accepted step title' });
  assert.equal(titled.block.title, 'Accepted step title');
  assert.equal(titled.block.interactions.contentRevision, await contentRevision(titled.block));
  assert.notEqual(titled.block.interactions.contentRevision, out.block.interactions.contentRevision);
});

test('questions: exactly three, distinct, non-blank, at most 120 code points; the card is repaired once, then fails with the stable reason', async () => {
  const cases = [[['only one?'], /exactly 3 questions; received 1/], [[...questions, 'a fourth?'], /received 4/], [[questions[0], questions[0].toUpperCase(), questions[2]], /repeats another/], [[questions[0], '   ', questions[2]], /blank/],
    [[questions[0], questions[1], 'x'.repeat(121)], /121 characters; the limit is 120/], [[questions[0], questions[1], '\u{1F600}'.repeat(121)], /121 characters/]];
  for (const [bad, expected] of cases) {
    const r = await quiet(() => run([{ ...good, questions: bad }, { ...good, questions: bad }]));
    assert.equal(r.out.result, 'validation_error');
    assert.match(r.out.error, /^explanation_bad_interactions:/);
    assert.match(r.out.error, expected);
    assert.equal(r.m.seen.length, 2, 'author plus the one repair, never a metadata call');
  }
  assert.equal((await quiet(() => run([{ title: 'T', body }, good]))).out.repaired, true, 'a missing questions field is repaired');
  assert.equal((await run([{ ...good, questions: [questions[0], questions[1], '\u{1F600}'.repeat(120)] }])).out.result, 'artifact', 'exactly 120 code points is fine');
});

test('term anchors resolve against the final displayed text: exact quote, zero-based whole-word occurrence, no overlaps, literal Markdown and repeated words', async () => {
  const block = { title: 'T', body, more: [{ label: 'More', text: 'A tree grows. Another tree stops. `leaf` is code here.' }] };
  const check = term => interactionsProblem(block, { questions, terms: [{ definition: 'd', ...term }] });
  assert.equal(check({ label: 'decision tree', field: 'body', quote: 'decision tree', occurrence: 0 }), null, 'bold syntax is removed: the term is its underlying text');
  assert.equal(check({ label: 'tree', field: 'body', quote: 'tree', occurrence: 1 }), null, 'a repeated word: the second whole-word occurrence is explicit');
  assert.match(check({ label: 'tree', field: 'body', quote: 'tree', occurrence: 3 }), /no occurrence 3/);
  assert.match(check({ label: 'tree', field: 'more[0].text', quote: 'tree', occurrence: 2 }), /no occurrence 2 in more\[0\]\.text/);
  assert.equal(check({ label: 'tree', field: 'more[0].text', quote: 'tree', occurrence: 1 }), null);
  assert.match(check({ label: 'branch', field: 'body', quote: 'branch', occurrence: 1 }), /whole-word matches in the displayed text: 1/, 'a substring of a longer word (branches?) is not an occurrence');
  assert.match(check({ label: 'stump', field: 'more[1].text', quote: 'stump', occurrence: 0 }), /does not have/);
  assert.match(check({ label: 'tree', field: 'title', quote: 'tree', occurrence: 0 }), /field must be/);
  assert.match(check({ label: 'tree', field: 'body', quote: 'Tree', occurrence: 0 }), /quote must be exactly the label/);
  assert.match(check({ label: 'a very deep tree', field: 'body', quote: 'a very deep tree', occurrence: 0 }), /one or two words/);
  assert.match(check({ label: 'tree', definition: '', field: 'body', quote: 'tree', occurrence: 0 }), /no definition/);
  assert.match(check({ label: 'tree', definition: 'x'.repeat(161), field: 'body', quote: 'tree', occurrence: 0 }), /161 characters; the limit is 160/);
  assert.match(check({ label: 'tree', field: 'body', quote: 'tree', occurrence: -1 }), /zero-based integer/);
  assert.match(check({ label: 'tree', field: 'body', quote: 'tree', occurrence: 1.5 }), /zero-based integer/);
  // A code span is displayed as its literal text, so `leaf` counts as the word leaf.
  assert.equal(check({ label: 'leaf', field: 'more[0].text', quote: 'leaf', occurrence: 0 }), null);
  const two = [{ label: 'decision tree', definition: 'd', field: 'body', quote: 'decision tree', occurrence: 0 }, { label: 'tree', definition: 'd', field: 'body', quote: 'tree', occurrence: 0 }];
  assert.match(interactionsProblem(block, { questions, terms: two }), /overlaps another term/);
  assert.match(interactionsProblem(block, { questions, terms: Array.from({ length: 7 }, (_, i) => ({ label: 'tree', definition: 'd', field: 'more[0].text', quote: 'tree', occurrence: i % 2 })) }), /at most 6 terms/);
  assert.deepEqual(occurrences('tree trees tree', 'tree'), [{ start: 0, end: 4 }, { start: 11, end: 15 }]);
  assert.deepEqual(occurrences('café \u{1F600} café', 'café').map(o => [o.start, o.end]), [[0, 4], [7, 11]], 'offsets count Unicode code points, not UTF-16 units');
});

test('term and question text is a separate bounded allowance: the teaching cap is exact with it, one over fails', async () => {
  const longMeta = { questions: questions.map(q => q.padEnd(120, '?')), terms: terms.map(t => ({ ...t, definition: 'd'.repeat(160) })) };
  const fill = n => ({ title: 'T', body: 'y'.repeat(n - 2) }); // the count is title + one space + body
  for (const depth of ['overview', 'standard', 'deep']) {
    const cap = EXPLANATION_CAPS[depth];
    const exact = await run([{ ...fill(cap), ...longMeta, terms: [] }], { depth });
    assert.equal(explanationChars(exact.out.block), cap, `${depth}: exactly at the cap`);
    assert.equal(exact.out.result, 'artifact', 'questions never count toward the teaching cap');
    const over = await quiet(() => run([{ ...fill(cap + 1), ...longMeta, terms: [] }], { depth }));
    assert.equal(over.out.result, 'validation_error');
    assert.match(over.out.error, /explanation_over_budget/);
  }
  const worst = await run([{ ...good, questions: questions.map(q => q.padEnd(120, '?')), terms: [{ ...terms[0], definition: 'd'.repeat(160) }, { ...terms[1], definition: 'd'.repeat(160) }] }]);
  assert.equal(worst.out.result, 'artifact', 'the maximum allowance is accepted');
  assert.equal(INTERACTION_LIMITS.terms * INTERACTION_LIMITS.definition + INTERACTION_LIMITS.questions * INTERACTION_LIMITS.question, 1320);
});

test('the Tutor roadmap path: the same envelope in the one author call (zero repairs), a stable terminal reason when it is wrong, the accepted title bound', async () => {
  const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
  const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
  const rec = { cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'Why trees split', stepGoal: 'Explain splitting.', passageText: 'Trees split.', language: 'en', depth: 'standard', retry: 0 };
  const go = async (input, env = ON) => { const m = scripted(input); const out = await generateRoadmapCard(env, access, ref, { loadAccepted: async () => rec, withProviderCall: async e => e, callModel: m.callModel }); return { out, m }; };
  const ok = await go({ ...good, title: 'Model title' });
  assert.equal(ok.out.outcome, 'ok');
  assert.equal(ok.out.block.title, 'Why trees split');
  assert.equal(ok.out.block.interactions.contentRevision, await contentRevision(ok.out.block));
  assert.equal(ok.out.block.id, 'card_0000001');
  assert.equal(ok.m.seen.length, 1);
  const bad = await quiet(() => go({ ...good, questions: ['one?'] }));
  assert.deepEqual([bad.out.outcome, bad.out.failure_class, bad.out.code, bad.m.seen.length], ['failed', 'terminal_validation_failure', 'explanation_bad_interactions', 1]);
  const off = await go({ title: 'T', body }, {});
  assert.equal(off.out.outcome, 'ok', 'with the switch off a Tutor card needs no envelope');
  // E1 and E2 compose: a required table and the envelope are both checked, in one message.
  const withTable = { ...good, body: `${body}\n\n| A | B |\n| --- | --- |\n| 1 | 2 |` };
  const m = scripted({ ...withTable, questions: ['one?'] }, withTable);
  const both = await quiet(() => generateArtifact(ON, { command: 'explanation', args: 'q', visualRequirements: { version: 1, items: [{ id: 'vr-1', kind: 'table', purpose: 'a table' }] } }, { callModel: m.callModel }));
  assert.deepEqual([both.result, both.repaired, m.seen.length], ['artifact', true, 2]);
  assert.equal(both.block.visualRequirements.items[0].satisfied, true);
  assert.ok(both.block.interactions);
});

test('revision safety: a text edit changes the revision and the saved terms no longer belong to it; a resize, a move and a reload do not', async () => {
  const { out } = await run([good]);
  const card = out.block;
  assert.equal(await interactionsCurrent(card), true);
  assert.equal(await interactionsCurrent({ ...card, w: 700, h: 900, dx: 40, dy: 12, id: 'another-card-id' }), true, 'geometry, position and id are not content');
  assert.equal(await interactionsCurrent(JSON.parse(JSON.stringify(card))), true, 'a reload');
  assert.equal(await interactionsCurrent({ ...card, body: `${card.body} More.` }), false, 'an edit: old decorations must not attach to equal text in the new revision');
  assert.equal(await interactionsCurrent({ ...card, title: 'Renamed' }), false);
  assert.equal(await interactionsCurrent({ ...card, more: [{ label: 'x', text: 'y' }] }), false);
  const { interactions: _gone, ...legacy } = card;
  assert.equal(await interactionsCurrent(legacy), false, 'a legacy or E1 card has no envelope and shows no blank rows');
});
