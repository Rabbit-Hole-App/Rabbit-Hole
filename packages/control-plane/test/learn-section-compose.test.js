// learn_section_compose (spec B; DECISIONS D, F, H, N): the section-flow tool set, the validator's planted failures (B §6.4, B §8) and one route turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';
import { SECTION_TOOLS, checkToolCall, chatToolDefs, directTools, toolNameOf } from '../src/chat-tools.js';
import { SECTION_COMPOSE_FAILED, validateComposition } from '../src/learn-section-compose.js';
import { readSection, updateSection } from '../src/learn-section-store.js';
import { ACTOR, scripted, sectionSetup, toolUse } from './learn-section-fixture.js';

const ENV = { EXPLAIN_V2_ENABLED: 'true' };
const brief = { sectionId: '1.1', from: '', to: 'Next, the list.', beats: [
  { id: 'b1', idea: 'A share is finished over all.', shows: 'Compute it for three tasks.', anchors: ['src/progress.js:2-6'], background: false, material: null },
  { id: 'b2', idea: 'Why a derived value is never stored.', shows: 'Say where it would go stale.', anchors: [], background: true, material: { kind: 'video', query: 'derived state', lookFor: 'the stale copy' } },
] };
const commands = directTools(ENV, 'a@b', { sectionFlow: true }).map(t => t.command);
const check = ({ command, request, requirements }) => checkToolCall(ENV, 'a@b', { name: toolNameOf(command), input: { request, ...(requirements ? { requirements } : {}) } }, { sectionFlow: true }).error || null;
const item = (id, beatId, command, over = {}) => ({ id, beatId, command, request: 'Show how the share is computed for three tasks.', requirements: null, lookFor: null, why: 'It is a mechanism to read.', source: null, content: null, after: null, ...over });
const opts = { sectionId: '1.1', brief, commands, check };

test('directTools in the section flow: the ordinary set minus explain, quiz and flashcards, plus explanation, notebook, document and browser; ordinary chat unchanged (DECISIONS H, N; Reviewer 10:50)', () => {
  const ordinary = directTools(ENV, 'a@b').map(t => t.command);
  assert.ok(ordinary.includes('explain'));
  for (const command of Object.keys(SECTION_TOOLS)) assert.ok(!ordinary.includes(command), `${command} stays out of ordinary chat`);
  assert.ok(ordinary.includes('quiz') && ordinary.includes('flashcards'));
  assert.deepEqual(commands, [...ordinary.filter(c => !['explain', 'quiz', 'flashcards'].includes(c)), 'explanation', 'notebook', 'document', 'browser']);
  for (const command of ['notebook', 'document', 'browser']) assert.equal(CHAT_CAPABILITIES[command], undefined, 'nothing added to CHAT_CAPABILITIES');
  assert.deepEqual(chatToolDefs(ENV, 'a@b').map(d => d.name), ordinary.map(toolNameOf));
  assert.match(chatToolDefs(ENV, 'a@b', { sectionFlow: true }).find(d => d.name === 'run_document').description, /Limits: Text and equations to read; no code runs, no media\./);
  assert.match(checkToolCall(ENV, 'a@b', { name: 'run_explanation', input: { request: 'x', requirements: { interactive: true } } }, { sectionFlow: true }).error, /^Explanation is not interactive\. Tools that fit/);
  assert.match(checkToolCall(ENV, 'a@b', { name: 'run_notebook', input: { request: 'x' } }).error, /not available/, 'ordinary chat cannot call a section tool');
});

test('validateComposition accepts a covered section with D fields; found material carries lookFor', () => {
  const out = validateComposition({ items: [item('i1', 'b1', 'notebook', { content: 'authored' }), item('i2', 'b1', 'code', { source: 'repository', request: 'Show src/progress.js lines 2 to 6.' }), item('i3', 'b2', 'youtube', { lookFor: 'the stale copy at the start' })] }, opts);
  assert.equal(out.errors, undefined);
  assert.deepEqual(out.value.items.map(i => [i.id, i.source, i.content]), [['i1', null, 'authored'], ['i2', 'repository', null], ['i3', null, null]]);
});

test('validateComposition: a planted motion item and an unknown command are refused (B §6.4); a path in an explanation request is refused (B §8)', () => {
  const rest = [item('i2', 'b2', 'document')];
  assert.deepEqual(validateComposition({ items: [item('i1', 'b1', 'motion'), ...rest] }, opts).errors, [`item i1: motion is not one of the tools you were given (${commands.join(', ')})`, 'beat b1 has no item']);
  assert.match(validateComposition({ items: [item('i1', 'b1', 'teleport'), ...rest] }, opts).errors[0], /^item i1: teleport is not one of the tools you were given/);
  assert.match(validateComposition({ items: [item('i1', 'b1', 'explain'), ...rest] }, opts).errors[0], /^item i1: explain is not one of the tools/, 'the visual explain is not in the section set');
  assert.deepEqual(validateComposition({ items: [item('i1', 'b1', 'explanation', { request: 'Explain how src/progress.js computes the share.' }), ...rest] }, opts).errors, ['item i1: the request for explanation must have no path, file name or flag (found "src/progress.js")']);
});

// Reviewer 19:55 (section-run-fixes-spec.md §4): the brief's rule against the covering beat. A code name the beat spells may appear in backticks, exactly as the beat spells it.
test('validateComposition, the one rule (Reviewer 20:35): a request names code as it likes (`n_embd`, bare n_embd, `GPT.forward`, `logits[:, -1, :]`); a path, a file name or a flag is refused', () => {
  const rest = [item('i2', 'b2', 'document')];
  const errors = request => validateComposition({ items: [item('i1', 'b1', 'diagram', { request }), ...rest] }, opts).errors || [];
  for (const ok of ['Every box is labelled (b, t, `n_embd`).', 'Every box is labelled (b, t, n_embd).', 'Start at `GPT.forward`.', 'Keep `logits[:, -1, :]` only.']) assert.deepEqual(errors(ok), [], ok);
  assert.deepEqual(errors('A flow of the code in src/progress.js.'), ['item i1: the request for diagram must have no path, file name or flag (found "src/progress.js")']);
  assert.deepEqual(errors('A flow of model.py.'), ['item i1: the request for diagram must have no path, file name or flag (found "model.py")']);
  assert.deepEqual(errors('Run it with --max-iters.'), ['item i1: the request for diagram must have no path, file name or flag (found "--m")']);
  assert.deepEqual(validateComposition({ items: [item('i1', 'b1', 'code', { request: 'Show progress_share(done, total) in src/progress.js.', source: 'example' }), ...rest] }, opts).errors || [], [], 'a code request is code');
});

test('validateComposition: D fields, F caps, pairing, item count and coverage', () => {
  const two = extra => validateComposition({ items: [item('i1', 'b1', 'document'), item('i2', 'b2', 'document'), ...extra] }, opts).errors;
  assert.deepEqual(two([item('i3', 'b1', 'code')]), ['item i3: a code item has source repository or example']);
  assert.deepEqual(two([item('i3', 'b1', 'notebook')]), ['item i3: a notebook item has content source, authored or buildup']);
  assert.deepEqual(two([item('i3', 'b2', 'arxiv', { lookFor: 'x' }), item('i4', 'b2', 'browser', { lookFor: 'y' })]), ['found material is at most 1 item in a section for now; this one has 2']);
  assert.deepEqual(two([item('i3', 'b2', 'wikipedia')]), ['item i3: found material carries lookFor: which part and what to notice']);
  assert.deepEqual(two([item('i3', 'b1', 'explanation', { after: 'i1' })]), undefined, 'an explanation made for a document');
  assert.deepEqual(two([item('i3', 'b1', 'notebook', { content: 'authored', after: 'i1' })]), undefined, 'a notebook made for a document (Make §7c, Reviewer 10:50)');
  assert.deepEqual(two([item('i3', 'b1', 'code', { source: 'example', after: 'i1' })]), ['item i3: after names an earlier paper, Wikipedia, document or web page item, and only an explanation or a notebook is made after one']);
  const bgBrief = { ...brief, beats: [brief.beats[0], { ...brief.beats[1], material: null }, { id: 'b3', idea: 'Another background.', shows: 'x', anchors: [], background: true, material: null }] };
  const wiki = (id, beatId) => item(id, beatId, 'wikipedia', { lookFor: 'the definition' });
  assert.equal(validateComposition({ items: [item('i1', 'b1', 'document'), wiki('i2', 'b2'), wiki('i3', 'b3'), item('i4', 'b1', 'youtube', { lookFor: 'z' })] }, { ...opts, brief: bgBrief }).errors, undefined, 'F: two background Wikipedia cards are separate from the one found item');
  assert.deepEqual(validateComposition({ items: Array.from({ length: 9 }, (_, i) => item(`i${i + 1}`, i % 2 ? 'b2' : 'b1', 'document')) }, opts).errors, ['a section has 1 to 8 items; this one has 9']);
});

test('learn_section_compose: one submit over the stored brief; tools are reading material, only the submit is callable; stored with toolsOffered; status composed', async t => {
  const f = await sectionSetup(t);
  f.env.EXPLAIN_V2_ENABLED = 'true';
  assert.deepEqual((await f.post({ action: 'learn_section_compose', sectionId: '1.1' })).body, { error: 'no_brief' });
  await updateSection(f.env, ACTOR, '1.1', () => ({ brief }));
  const items = [item('i1', 'b1', 'explanation'), item('i2', 'b2', 'youtube', { lookFor: 'the stale copy' })];
  f.deps.callModel = scripted(toolUse('submit_section_composition', { items: [item('i1', 'b1', 'motion'), items[1]] }, 's1'), toolUse('submit_section_composition', { items }, 's2'));
  const out = await f.post({ action: 'learn_section_compose', sectionId: '1.1' });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body.composition.items.map(i => i.command), ['explanation', 'youtube']);
  const [first, second] = f.deps.callModel.calls;
  assert.deepEqual(first.body.tools.map(x => x.name), ['submit_section_composition']);
  assert.match(first.body.messages[0].content, /TOOLS \(command: what it is and its limits\)\n[\s\S]*\nnotebook: A notebook card with runnable cells/);
  assert.ok(!first.body.messages[0].content.includes('Calling this only'));
  assert.match(second.body.messages.at(-1).content[0].content, /^Not accepted:\nitem i1: motion is not one of the tools you were given/);
  const stored = await readSection(f.env, ACTOR, '1.1');
  assert.deepEqual(stored.composition.toolsOffered, commands);
  assert.deepEqual((await f.learn()).sections, [{ id: '1.1', status: 'composed' }]);
  const motion = () => toolUse('submit_section_composition', { items: [item('i1', 'b1', 'motion')] });
  f.deps.callModel = scripted(motion(), motion(), motion());
  assert.deepEqual((await f.post({ action: 'learn_section_compose', sectionId: '1.1', redo: true })).body, { error: 'sectionComposeFailed', words: SECTION_COMPOSE_FAILED }, 'refused three times (the answer and two repairs, Reviewer 19:55): the sentence, never silent');
});

// A dropped document as the source (roadmap-unplug-spec.md section B; learn-section-make-spec.md section 4): no code and no notebook are offered, the message names the source and the
// reading-then-explanation pairing, and a reading followed by an explanation made after it is accepted.
import { runCompose, documentSourceLine } from '../src/learn-section-compose.js';
test('learn_section_compose for a document source: code and notebook are not offered, the source is named, a reading paired with an explanation after it is accepted', async t => {
  const f = await sectionSetup(t);
  f.env.EXPLAIN_V2_ENABLED = 'true';
  await updateSection(f.env, ACTOR, '1.1', () => ({ brief }));
  const reading = item('i1', 'b1', 'document'), paired = item('i2', 'b1', 'explanation', { after: 'i1' }), video = item('i3', 'b2', 'youtube', { lookFor: 'the stale copy' });
  const callModel = scripted(toolUse('submit_section_composition', { items: [reading, paired, video] }, 's1'));
  const res = await runCompose(f.env, { actor: ACTOR, email: 'ana@test', document: { kind: 'markdown', name: 'notes.md' } }, { sectionId: '1.1' }, { callModel });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual(body.composition.items.map(i => [i.id, i.command, i.after]), [['i1', 'document', null], ['i2', 'explanation', 'i1'], ['i3', 'youtube', null]]);
  const message = callModel.calls[0].body.messages[0].content;
  assert.ok(!/\nnotebook: /.test(message) && !/\ncode: /.test(message), 'the tools list leaves out code and notebook');
  assert.match(message, /\ndocument: /);
  assert.ok(message.includes(documentSourceLine({ kind: 'markdown', name: 'notes.md' })));
  assert.match(message, /SOURCE: a Markdown file the learner dropped on the canvas, "notes\.md"\. .*There is no code to show or run.*after names the reading/);
  assert.ok(!(await readSection(f.env, ACTOR, '1.1')).composition.toolsOffered.some(c => c === 'code' || c === 'notebook'));
  const refused = scripted(toolUse('submit_section_composition', { items: [item('i1', 'b1', 'notebook', { content: 'authored' }), video] }, 's2'), toolUse('submit_section_composition', { items: [reading, video] }, 's3'));
  const again = await (await runCompose(f.env, { actor: ACTOR, email: 'ana@test', document: { kind: 'pdf', name: 'paper.pdf' } }, { sectionId: '1.1', redo: true }, { callModel: refused })).json();
  assert.match(refused.calls[1].body.messages.at(-1).content[0].content, /item i1: notebook is not one of the tools you were given/);
  assert.deepEqual(again.composition.items.map(i => i.command), ['document', 'youtube']);
  assert.match(refused.calls[0].body.messages[0].content, /SOURCE: a PDF the learner dropped/);
});
