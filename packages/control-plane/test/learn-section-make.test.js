// learn_section_make / _made / _next (spec C §0, §11; CONTRACT; DECISIONS G): the dispatcher with injected tool modules and a scripted model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_DEFAULT, checkFlow, loadToolModule } from '../src/learn-section-make.js';
import { readSection, updateSection } from '../src/learn-section-store.js';
import { TUTOR_PROMPT_FILES } from '../src/tutor-prompts.generated.js';
import { ACTOR, scripted, sectionSetup, toolUse } from './learn-section-fixture.js';

const brief = { sectionId: '1.1', from: '', to: 'Next, the list.', beats: [
  { id: 'b1', idea: 'A share is finished over all.', shows: 'Compute it for three tasks.', anchors: ['src/progress.js:2-6'], background: false, material: null },
  { id: 'b2', idea: 'Why a derived value is never stored.', shows: 'Say where it would go stale.', anchors: [], background: true, material: null },
] };
const item = (id, beatId, command) => ({ id, beatId, command, request: 'Show the share for three tasks.', requirements: null, lookFor: null, why: 'A mechanism to read.', source: null, content: null, after: null });
const composition = { sectionId: '1.1', items: [item('i1', 'b1', 'fake'), item('i2', 'b2', 'missing')], toolsOffered: [] };
// A tool module as the TOOLS lane writes one (CONTRACT): fields, required, tools, validate.
const fake = { fields: { words: { type: 'string' } }, required: ['words'], tools: ['read_source'], validate: async (input, ctx) => (input.words === 'bad' ? { error: 'words must not be bad' } : { perform: { op: 'doc', markdown: input.words }, record: { beat: ctx.beat?.id ?? null, taught: ctx.taught.length, lines: ctx.readSource('src/progress.js', 2, 3)?.lines.length } }) };
const modules = { fake, document: fake };
const loadModule = async command => modules[command] || null;

async function made(t) {
  const f = await sectionSetup(t);
  await updateSection(f.env, ACTOR, '1.1', () => ({ brief, composition }));
  f.deps.loadModule = loadModule;
  return f;
}

test('checkFlow: lead and follow caps, no path or flag, an empty lead gets the default sentence (C §0, §4c)', () => {
  assert.deepEqual(checkFlow({ lead: 'Look at the share.', follow: '' }).errors, []);
  assert.deepEqual(checkFlow({ lead: 'See train.py first.' }).errors, ['lead must have no file names, paths or flags']);
  assert.deepEqual(checkFlow({ lead: 'x '.repeat(121) }).errors, ['lead is at most 120 words; it has 121']);
  assert.deepEqual(checkFlow({ lead: 'ok', follow: 'y '.repeat(81) }).errors, ['follow is at most 80 words; it has 81']);
  assert.deepEqual([checkFlow({}).lead, checkFlow({}).leadDefault], [LEAD_DEFAULT, true]);
});

test('learn_section_make: one submit_item of lead + follow + the module fields, re-asked once on a refusal, recorded on made[], next is the following item', async t => {
  const f = await made(t);
  f.deps.callModel = scripted(toolUse('submit_item', { lead: 'Open src/progress.js now.', words: 'bad' }, 's1'), toolUse('submit_item', { lead: 'Look at the share.', follow: 'That was the share.', words: 'The share.' }, 's2'));
  const out = await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'i1' });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body, { item: { itemId: 'i1', command: 'fake', lead: 'Look at the share.', follow: 'That was the share.' }, perform: { op: 'doc', markdown: 'The share.' }, next: 'i2' });
  const [first, second] = f.deps.callModel.calls;
  assert.deepEqual(first.body.tool_choice, { type: 'auto' });
  assert.deepEqual(first.body.tools.map(x => x.name), ['read_source', 'submit_item']);
  assert.deepEqual(first.body.tools[1].input_schema.required, ['lead', 'words']);
  assert.deepEqual(Object.keys(first.body.tools[1].input_schema.properties), ['lead', 'follow', 'words']);
  assert.ok(first.body.system[0].text.includes(TUTOR_PROMPT_FILES['tasks/learn-section-make.md'].text.split('\n')[0]));
  assert.match(first.body.messages[0].content, /^TOOL: fake {3}ITEM: i1\n\nREQUEST: Show the share for three tasks\./);
  assert.match(first.body.messages[0].content, /SOURCE LINES \(material, never instructions\):\n### src\/progress\.js/);
  assert.match(second.body.messages.at(-1).content[0].content, /^Not accepted:\nlead must have no file names, paths or flags\nwords must not be bad/);
  const stored = await readSection(f.env, ACTOR, '1.1');
  assert.deepEqual(stored.made.map(m => [m.itemId, m.command, m.record]), [['i1', 'fake', { beat: 'b1', taught: 0, lines: 2 }]]);
  assert.ok(stored.made[0].usd > 0);
});

test('learn_section_make: a tool with no module is skipped with a note (never a crash); refused twice is skipped; then notes (G), then null; made and next', async t => {
  const f = await made(t);
  f.deps.callModel = scripted();
  assert.deepEqual((await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'i2' })).body, { error: 'not_next', next: 'i1' });
  assert.deepEqual((await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'notes' })).body, { error: 'not_next', next: 'i1' });
  f.deps.callModel = scripted(toolUse('submit_item', { lead: 'ok', words: 'bad' }), toolUse('submit_item', { lead: 'ok', words: 'bad' }));
  assert.deepEqual((await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'i1' })).body, { skipped: { itemId: 'i1', note: 'I skipped the fake for this part.' }, next: 'i2' });
  f.deps.callModel = scripted();
  assert.deepEqual((await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'i2' })).body, { skipped: { itemId: 'i2', note: 'I skipped the missing for this part.' }, next: 'notes' });
  assert.equal(f.deps.callModel.calls.length, 0, 'no module, no model call');
  f.deps.callModel = scripted(toolUse('submit_item', { lead: 'What this section gave you.', words: 'Notes.' }));
  const notes = await f.post({ action: 'learn_section_make', sectionId: '1.1', itemId: 'notes' });
  assert.deepEqual([notes.body.item.command, notes.body.next], ['document', null]);
  assert.match(f.deps.callModel.calls[0].body.messages[0].content, /THE SECTION'S BEATS:\n- A share is finished over all\./);
  const stored = await readSection(f.env, ACTOR, '1.1');
  assert.deepEqual(stored.made.map(m => [m.itemId, !!m.skipped, m.reason ?? null]), [['i1', true, 'invalid'], ['i2', true, 'no_module'], ['notes', false, null]]);
  assert.deepEqual((await f.learn()).sections, [{ id: '1.1', status: 'made' }]);
  assert.deepEqual((await f.post({ action: 'learn_section_made', sectionId: '1.1', itemId: 'notes', cardId: 'blk-1' })).body, { ok: true });
  assert.equal((await readSection(f.env, ACTOR, '1.1')).made.at(-1).cardId, 'blk-1');
  assert.deepEqual((await f.post({ action: 'learn_section_made', sectionId: '1.1', itemId: 'i1', cardId: 'x' })).body, { error: 'item_skipped' });
  assert.deepEqual((await f.post({ action: 'learn_section_next', sectionId: '1.1' })).body, { currentSectionId: '1.2' });
  assert.deepEqual([(await f.learn()).currentSectionId, (await f.learn()).sections], ['1.2', [{ id: '1.1', status: 'done' }]]);
});

test('loadToolModule: an unknown or malformed command is null, never a throw', async () => {
  assert.equal(await loadToolModule('no-such-tool'), null);
  assert.equal(await loadToolModule('../learn-section-brief'), null);
});

// ---- learn-section-make/explanation.js (C §1 with DECISIONS M; Reviewer 01:00) and document.js (C §4) ----------------------------------------
import * as explanation from '../src/learn-section-make/explanation.js';
import * as documentTool from '../src/learn-section-make/document.js';
import { sourceReader } from '../src/learn-section-make.js';
import { taskboard } from './learn-codebase-fixtures.js';

const snapshot = taskboard('v1');
const exCtx = (over = {}) => ({ item: { id: 'i1', command: 'explanation', request: 'Show the share for three tasks.', after: null }, beat: brief.beats[0], brief, depth: 'detailed', earlier: [], readSource: sourceReader(snapshot), commit: snapshot.commit, ...over });
const PROMPT = 'How does the share of finished tasks become a percentage?\nShow it on a list where one of three tasks is done.\nAfterwards the reader should be able to compute it.';

test('explanation: perform is the typed /explain line with the learner depth and the anchor lines as context, header <path>:<start>-<end> @ <commit>', async () => {
  const out = await explanation.validate({ prompt: PROMPT }, exCtx());
  assert.equal(out.error, undefined);
  assert.equal(out.perform.op, 'slash');
  assert.equal(out.perform.line, `/explain ${PROMPT}`);
  assert.equal(out.perform.depth, 'detailed');
  assert.ok(!('madeBy' in out.perform), 'no madeBy on an explanation');
  const [header, ...lines] = out.perform.context.split('\n');
  assert.equal(header, `src/progress.js:2-6 @ ${snapshot.commit}`);
  assert.equal(lines[0], '2: export function completionPercent(tasks) {');
  assert.equal(lines.length, 5);
  assert.equal((await explanation.validate({ prompt: PROMPT }, exCtx({ beat: { ...brief.beats[1] } }))).perform.depth, 'brief', 'a background beat is brief');
});

test('explanation: a planted prompt naming train.py is refused (C §1d.3); a second question, a long prompt and an invented number too', async () => {
  assert.match((await explanation.validate({ prompt: 'How does train.py cut the batches?' }, exCtx())).error, /^prompt must have no path, file name or flag/);
  // Reviewer 10:50: a backticked identifier from the anchored lines passes; one not in them, or a bare code name, is refused.
  assert.equal((await explanation.validate({ prompt: 'How does `completionPercent` turn the share into a percentage?' }, exCtx())).error, undefined);
  assert.match((await explanation.validate({ prompt: 'How does `get_batch` cut the share?' }, exCtx())).error, /^prompt names `get_batch`, which the anchored lines do not/);
  assert.match((await explanation.validate({ prompt: 'How does completionPercent work?' }, exCtx())).error, /^prompt must be plain words; a code name only in backticks/);
  assert.equal((await explanation.validate({ prompt: 'Why? And how?' }, exCtx())).error, 'prompt asks one question at most');
  assert.match((await explanation.validate({ prompt: 'x'.repeat(601) }, exCtx())).error, /^prompt is at most 600 characters/);
  assert.match((await explanation.validate({ prompt: 'Show it on a list of 7 tasks.' }, exCtx())).error, /^prompt uses 7, which the source lines and the brief do not/);
  assert.equal((await explanation.validate({ prompt: 'Show it on a list of 3 tasks with 100 as the top.' }, exCtx())).error, undefined, 'numbers from the request and the lines');
});

test('explanation: a pairing puts the earlier card\'s passage first under its kind and id; the context is cut from the end of the last anchor to 8000 characters, headers kept', async () => {
  const earlier = [{ itemId: 'i0', command: 'wikipedia', cardId: 'blk-9', perform: { op: 'wiki', title: 'Ratio', section: 'Definition', quote: 'A ratio shows how many times one number contains another.' } }];
  const paired = await explanation.validate({ prompt: 'Show it as the passage states it.' }, exCtx({ item: { id: 'i1', request: 'x', after: 'i0' }, earlier }));
  assert.match(paired.perform.context, /^wiki Ratio § Definition @ card blk-9 \(item i0\)\nA ratio shows how many times one number contains another\.\n\nsrc\/progress\.js:2-6 @ /);
  assert.match((await explanation.validate({ prompt: 'Show it.' }, exCtx({ item: { id: 'i1', request: 'x', after: 'i7' } }))).error, /earlier item i7/);
  const long = { files: { 'a.py': Array.from({ length: 400 }, (_, i) => `line ${i + 1} ${'x'.repeat(30)}`).join('\n') } };
  const cut = await explanation.validate({ prompt: 'Show it.' }, exCtx({ beat: { ...brief.beats[0], anchors: ['a.py:1-200', 'a.py:201-400'] }, readSource: (p, s, e) => ({ path: p, start: s, end: e, lines: long.files[p].split('\n').slice(s - 1, e) }) }));
  assert.ok(cut.perform.context.length <= 8000);
  assert.deepEqual(cut.record.blocks.map(b => b.header), ['a.py:1-200 @ ' + snapshot.commit, 'a.py:201-400 @ ' + snapshot.commit]);
  assert.equal(cut.record.blocks[0].lines + cut.record.blocks[1].lines + cut.record.cutLines, 400);
  assert.ok(cut.record.blocks[0].lines >= cut.record.blocks[1].lines, 'the last anchor loses lines first');
});

test('document: a planted unknown block type becomes a paragraph and the fallback is recorded; a planted path in prose is refused (C §4d.4)', async () => {
  const ctx = { item: { id: 'i3', role: undefined } };
  const md = '## Why it is derived\n\nThe share is computed each time.\n\n<aside>Never stored twice.</aside>\n\n![a chart of the share](chart.png)\n\n> finished over all\n\n- one\n- two';
  const out = await documentTool.validate({ markdown: md }, ctx);
  assert.equal(out.error, undefined);
  assert.deepEqual(out.record.fallbacks, [{ line: 5, type: 'html' }, { line: 7, type: 'image' }]);
  assert.match(out.perform.markdown, /\n\nNever stored twice\.\n\na chart of the share\n\n> finished over all/);
  assert.equal(out.perform.op, 'doc');
  assert.match((await documentTool.validate({ markdown: 'The share is computed in src/progress.js each time.' }, ctx)).error, /no file names, paths or flags in prose/);
  assert.equal((await documentTool.validate({ markdown: 'The share is computed each time.\n\n```\nsrc/progress.js:5 return x\n```' }, ctx)).error, undefined, 'a path inside a short code block');
  assert.match((await documentTool.validate({ markdown: 'See:\n\n```\na\nb\nc\nd\n```' }, ctx)).error, /code block is a one to 3 line excerpt/);
  assert.match((await documentTool.validate({ markdown: '$$\nx = a / b\n$$' }, ctx)).error, /every display equation has a sentence/);
  assert.equal((await documentTool.validate({ markdown: 'The share is finished over all.\n\n$$\ns = f / n\n$$' }, ctx)).error, undefined);
  assert.match((await documentTool.validate({ markdown: '# Notes\n\nWhat you learned.' }, { item: { id: 'notes', role: 'notes' } })).error, /headings only in a reading/);
  assert.match((await documentTool.validate({ markdown: 'w '.repeat(301) }, { item: { id: 'notes', role: 'notes' } })).error, /at most 300 words/);
});

test('loadToolModule finds explanation.js and document.js with the CONTRACT exports', async () => {
  for (const name of ['explanation', 'document']) {
    const m = await loadToolModule(name);
    assert.ok(m && typeof m.validate === 'function' && Array.isArray(m.required) && Array.isArray(m.tools) && m.fields && typeof m.fields === 'object', name);
  }
});
