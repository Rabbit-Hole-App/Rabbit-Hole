// learn_section_brief (spec A): the validator's planted failures (A §6.3 and A §8 Validator) and one route turn with a scripted model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_BRIEF_FAILED, SUBMIT_BRIEF_TOOL, codeNameError, jaccard, repositoryAnchors, validateBrief } from '../src/learn-section-brief.js';
import { readSection } from '../src/learn-section-store.js';
import { TUTOR_PROMPT_FILES } from '../src/tutor-prompts.generated.js';
import { ACTOR, captureLogs, scripted, sectionSetup, textReply, toolUse } from './learn-section-fixture.js';

const files = { 'src/progress.js': 'a\nb\nc\nd\ne\nf\n' };
const exists = repositoryAnchors({ files });
const beat = (id, over = {}) => ({ id, idea: `The ${id} idea is a plain sentence about counting finished work.`.replace('counting', ['counting', 'dividing', 'rounding', 'showing'][Number(id.slice(1)) % 4]), shows: 'You can compute the share for three tasks.', anchors: ['src/progress.js:2-4'], background: false, material: null, ...over });
const good = (over = {}) => ({ from: 'The last part left you with a list of tasks.', beats: [beat('b1'), beat('b2', { idea: 'Dividing finished by all gives a share between zero and one.' }), beat('b3', { idea: 'Rounding happens before the share is scaled to a percentage.' })], to: 'Next you see where the list comes from.', ...over });
const opts = (over = {}) => ({ sectionId: '1.2', first: false, last: false, anchorsExist: exists, earlierBeats: [], ...over });

test('validateBrief accepts a good brief and fills sectionId, background and material', () => {
  const out = validateBrief(good(), opts());
  assert.deepEqual(out.errors, undefined);
  assert.equal(out.value.sectionId, '1.2');
  assert.deepEqual(out.value.beats.map(b => [b.id, b.background, b.material]), [['b1', false, null], ['b2', false, null], ['b3', false, null]]);
});

test('validateBrief: a planted duplicate of an earlier section\'s beat is refused with "already taught in <n.m>" (A §6.3)', () => {
  const earlierBeats = [{ sectionId: '1.1', idea: 'Dividing finished by all gives a share between zero and one.' }];
  assert.ok(jaccard('Dividing finished by all gives a share between zero and one.', 'Dividing finished by all gives the share between zero and one.') > 0.6);
  const out = validateBrief(good(), opts({ earlierBeats }));
  assert.deepEqual(out.errors, ['beat b2: already taught in 1.1']);
});

test('validateBrief: a missing anchor, more than two background beats, a path in an idea, the beat count and the flow sentences', () => {
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', { anchors: ['src/gone.js'] }), ...good().beats.slice(1)] }), opts()).errors, ['beat b1: anchor src/gone.js is not in the source']);
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', { anchors: ['src/progress.js:5-9'] }), ...good().beats.slice(1)] }), opts()).errors, ['beat b1: anchor src/progress.js:5-9 is not in the source'], 'a range past the end of the file');
  const bg = { anchors: [], background: true };
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', bg), beat('b2', { ...bg, idea: 'A second idea from what you already know.' }), beat('b3', { ...bg, idea: 'A third idea from general knowledge here.' })] }), opts()).errors, ['at most 2 background beats; this section has 3']);
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', { idea: 'The share is computed in src/progress.js before it is shown.' }), ...good().beats.slice(1)] }), opts()).errors, ['beat b1: idea must have no path, file name or flag (found "src/progress.js")']);
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', { anchors: [], background: false }), ...good().beats.slice(1)] }), opts()).errors, ['beat b1: a beat with no anchors is background: true']);
  assert.deepEqual(validateBrief(good({ beats: good().beats.slice(0, 2) }), opts()).errors, ['a section has 3 to 6 beats; this one has 2']);
  assert.deepEqual(validateBrief(good(), opts({ first: true })).errors, ['from must be empty: this is the first section']);
  assert.deepEqual(validateBrief(good({ to: '' }), opts()).errors, ['to is one sentence handing over to the next section']);
  // Reviewer 11:00: one idea in one or two short sentences, at most 260 characters (11:15).
  const withIdea = idea => validateBrief(good({ beats: [beat('b1', { idea }), ...good().beats.slice(1)] }), opts()).errors;
  assert.equal(withIdea('The share counts finished work. It is shown as a whole number.'), undefined);
  assert.deepEqual(withIdea('The share counts finished work. It is rounded. It is shown.'), ['beat b1: idea is one idea in one or two short sentences, at most 260 characters']);
  assert.deepEqual(withIdea(`The share ${'counts finished work '.repeat(13)}today.`), ['beat b1: idea is one idea in one or two short sentences, at most 260 characters']);
  const m = { kind: 'video', query: 'how a share is computed', lookFor: 'the division' };
  assert.deepEqual(validateBrief(good({ beats: [beat('b1', { material: m }), beat('b2', { idea: 'Dividing finished by all gives a share.', material: { ...m, kind: 'paper', reason: 'recency' } }), good().beats[2]] }), opts()).errors, ['at most 1 beat with material; this section has 2']);
  assert.equal(validateBrief(good({ beats: [beat('b1', { material: { ...m, kind: 'article', reason: 'recency' } }), ...good().beats.slice(1)] }), opts()).value.beats[0].material.reason, 'recency', 'DECISIONS E');
  // The one rule (Reviewer 2026-11-17 20:35): only a path, a file name or a flag is refused; names and code in any form pass (codeNameError below).
});


test('learn_section_brief: one research call then the submit; the brief is stored, 1.1 becomes current, the call is metered learn_section; a second call returns the stored brief', async t => {
  const f = await sectionSetup(t);
  const submit = { from: '', beats: [beat('b1', { anchors: ['src/progress.js:2-6'] }), beat('b2', { idea: 'Dividing finished by all gives a share between zero and one.', anchors: ['src/progress.js:4'] }), beat('b3', { idea: 'Why a derived value is never stored.', anchors: [], background: true })], to: 'Next you see where the list comes from.' };
  f.deps.callModel = scripted(toolUse('read_source', { path: 'src/progress.js', start: 1, end: 6 }, 'r1'), toolUse(SUBMIT_BRIEF_TOOL.name, submit, 's1'));
  const { out, logs } = await captureLogs(() => f.post({ action: 'learn_section_brief', sectionId: '1.1' }));
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(Object.keys(out.body.brief), ['sectionId', 'from', 'beats', 'to', 'searches']);
  assert.equal(out.body.brief.beats.length, 3);
  const calls = f.deps.callModel.calls;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, 'claude-sonnet-5-5');
  assert.deepEqual(calls[0].body.tool_choice, { type: 'auto' });
  assert.deepEqual(calls[0].body.tools.map(t => t.name), ['read_source', 'search_code', 'get_relationships', 'search_material', 'submit_section_brief']);
  assert.ok(calls[0].body.system[0].text.includes(TUTOR_PROMPT_FILES['tasks/learn-section-brief.md'].text.trim()));
  const user = calls[0].body.messages[0].content;
  assert.match(user, /^BOOK: A book about a number\nCHAPTER: 1\. Where the number comes from   SECTION: 1\.1 Counting what is finished — The share of finished tasks\.\nPOSITION: section 1 of 3; previous: none; next: 1\.2 Asking the server\nPREVIOUS BRIEF: none\nFOCUS: none\nANCHORS: \n/);
  assert.match(user, /### src\/progress\.js {2}lines 2-6/);
  assert.equal(calls[1].body.messages[2].content[0].tool_use_id, 'r1', 'the read is answered');
  const stored = await readSection(f.env, ACTOR, '1.1');
  assert.ok(stored.brief.usd > 0 && stored.brief.layers.task === TUTOR_PROMPT_FILES['tasks/learn-section-brief.md'].sha256);
  assert.deepEqual([(await f.learn()).currentSectionId, (await f.learn()).sections], ['1.1', [{ id: '1.1', status: 'briefed' }]]);
  assert.equal(logs.filter(l => l.event === 'tutor_call').length, 2);
  assert.deepEqual(logs.find(l => l.event === 'learn_section_brief').outcome, 'ok');
  assert.equal(calls[0].env[Object.getOwnPropertySymbols(calls[0].env)[0]].feature, 'learn_section');
  f.deps.callModel = scripted();
  const again = await f.post({ action: 'learn_section_brief', sectionId: '1.1' });
  assert.deepEqual([again.status, again.body.brief.beats.length, f.deps.callModel.calls.length], [200, 3, 0], 'stored, no call');
});

test('learn_section_brief: a refused brief is re-asked twice with the errors (Reviewer 19:40), then the A §5 sentence; repairs is logged; nothing is stored', async t => {
  const f = await sectionSetup(t);
  const bad = { from: 'not empty', beats: [beat('b1')], to: 'x' };
  f.deps.callModel = scripted(textReply('I will think about it.'), toolUse(SUBMIT_BRIEF_TOOL.name, bad, 's2'), toolUse(SUBMIT_BRIEF_TOOL.name, bad, 's3'));
  const { out, logs } = await captureLogs(() => f.post({ action: 'learn_section_brief', sectionId: '1.1' }));
  assert.deepEqual(out.body, { error: 'sectionBriefFailed', words: SECTION_BRIEF_FAILED });
  assert.equal(f.deps.callModel.calls.length, 3, 'the first answer and two repairs');
  assert.match(f.deps.callModel.calls[1].body.messages.at(-1).content, /^Not accepted:\ncall submit_section_brief exactly once \(got 0\)/);
  assert.equal(logs.find(l => l.event === 'learn_section_brief')?.repairs, 2);
  assert.equal(await readSection(f.env, ACTOR, '1.1'), null);
  assert.deepEqual([(await f.post({ action: 'learn_section_brief', sectionId: '9.9' })).status], [404]);
});

test('the one code-name rule (Reviewer 20:35): a path, a file name or a flag is refused; `n_embd`, bare n_embd, `GPT.forward` and `logits[:, -1, :]` pass', () => {
  assert.equal(codeNameError('Open src/model/gpt.py first.'), 'must have no path, file name or flag (found "src/model/gpt.py")');
  assert.equal(codeNameError('The class sits in model.py.'), 'must have no path, file name or flag (found "model.py")');
  assert.equal(codeNameError('Run it with --max-iters set.'), 'must have no path, file name or flag (found "--m")');
  for (const ok of ['Shapes stay (b, t, `n_embd`).', 'Shapes stay (b, t, n_embd).', '`GPT.forward` takes `idx` in.', '`logits[:, -1, :]` keeps the last position.']) assert.equal(codeNameError(ok), null, ok);
  const beats = validateBrief(good({ beats: [beat('b1', { shows: 'Shapes stay (b, t, n_embd); `GPT.forward` runs them.' }), ...good().beats.slice(1)] }), opts());
  assert.equal(beats.errors, undefined, 'a beat naming code passes');
});
