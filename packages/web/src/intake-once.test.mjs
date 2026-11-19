// Source arrived (owner 2026-11-18 22:09 / 22:15, intake-once-spec.md): the wiring and the pieces the flow tests (learn-intake, choice-list) do not reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fallbackOpening, openingEntry, openingMessage, repositoryArrival, restoreOpenings, savedOpenings } from './rehearsal-flow.js';
import { openBody } from './source-arrived.js';
import { SENTENCES } from './tutor-rehearsal-text.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const doc = { repo: 'acme/widgets', summary: 'A small widget library.', routes: [{ routeId: 'a', practical: true, title: 'Build a demo', effort: 'Quick', stepsSketch: [] }],
  learn: { options: [{ id: 'render', label: 'How a widget is drawn', what: 'the render loop', anchors: ['src/render.py'], kind: 'structure' }], cannot: [{ kind: 'testing', thing: 'tests', why: 'there are none' }] } };

test('the repository arrives once per open (the catalogue landed) and again on codebase-options; a re-render fires nothing', () => {
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /const ask = askIntake\(st\.current\);\n\s+if \(ask\) \{ patch\(ask\); sourceArrived\(canvas, repositoryArrival\(st\.current\.doc\)\); \}/);
  assert.match(ui, /const ask = askIntake\(reset, \{ again: true \}\);[^]*?if \(ask\) sourceArrived\(canvas, repositoryArrival\(reset\.doc\)\);/, 'codebase-options: a fresh learn_open');
  assert.match(ui, /window\.addEventListener\(SOURCE_ARRIVED_EVENT, onArrived\)/, 'any source arriving is answered the same way');
});

test('the arrival carries only the source\'s own words; learn_open is sent exactly them', () => {
  const arrival = repositoryArrival(doc);
  assert.deepEqual(arrival, { kind: 'repository', summary: '**widgets**: A small widget library.', options: doc.learn.options, cannot: doc.learn.cannot, canRun: true });
  assert.deepEqual(openBody(arrival), { action: 'learn_open', kind: 'repository', summary: '**widgets**: A small widget library.', options: [{ id: 'render', label: 'How a widget is drawn', what: 'the render loop' }], cannot: [{ thing: 'tests', why: 'there are none' }] });
});

test('the opening: the Tutor\'s words and the options as rows; learn_open failing says the fixed sentence with the same rows; Run it only with the flag on and a source that can run', () => {
  const opening = openingMessage({ text: 'A widget library. What would you like to do?', options: doc.learn.options, canRun: true, run: false });
  assert.deepEqual([opening.key, opening.text, opening.choices.map(c => c.id)], ['intake', 'A widget library. What would you like to do?', ['learn:render']]);
  assert.equal(fallbackOpening('**widgets**: A small widget library.', doc.learn.options), `**widgets**: A small widget library.\n\n${SENTENCES.intake}`);
  assert.equal(fallbackOpening('**widgets**', []), `**widgets**\n\n${SENTENCES.learnNone}`);
  assert.deepEqual(openingMessage({ text: 't', options: doc.learn.options, canRun: true, run: true }).choices.map(c => c.id), ['mode:run', 'learn:render']);
  assert.deepEqual(openingMessage({ text: 't', options: doc.learn.options, canRun: false, run: true }).choices.map(c => c.id), ['learn:render']);
  assert.match(read('TutorRehearsal.jsx'), /text: text \|\| fallbackOpening\(detail\.summary, detail\.options\)/, 'a 502 is the fixed sentence, never silence');
});

test('Run it is a flag, off by default and never set for production', () => {
  assert.match(read('flags.js'), /export const runIt = import\.meta\.env\?\.VITE_RUN_IT === '1'/);
  assert.doesNotMatch(read('../../../scripts/prod-release.mjs'), /VITE_RUN_IT/);
});

// Reviewer 2026-11-19 08:20: the opening is saved into the chat thread like any Tutor line; a reload shows the same opening with no second model call.
test('the opening is saved as a Tutor entry and a reload puts it back, rows live, with no learn_open; codebase-options still writes a new one', () => {
  const entry = openingEntry({ kind: 'repository', options: doc.learn.options, canRun: true });
  assert.deepEqual(entry, { v: 1, kind: 'opening', seq: 1, source: 'repository', canRun: true, options: [{ id: 'render', label: 'How a widget is drawn', what: 'the render loop' }] });
  assert.ok(JSON.stringify(entry).length < 4000, 'within the 4 KB the server takes for meta.tutor');
  const thread = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'A widget library. What now?', meta: { tutor: entry } }, { role: 'assistant', content: 'other', meta: { tutor: { v: 1, kind: 'route', seq: 1 } } }];
  const saved = savedOpenings(thread);
  assert.equal(saved.length, 1);
  const back = restoreOpenings({ log: [] }, saved, { run: false });
  assert.deepEqual([back.asked, back.openings, back.opening, back.mode], [1, 1, null, 'learn']);
  assert.deepEqual([back.log[0].key, back.log[0].text, back.log[0].choices.map(c => c.id)], ['intake', 'A widget library. What now?', ['learn:render']]);
  assert.equal(restoreOpenings({ log: [] }, []), null, 'none saved: the opening is written');
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /const back = restoreOpenings\(st\.current, savedOpenings\(chat\.thread\?\.restore\?\.messages\)\);\n\s+if \(back\) \{ patch\(back\); return; \}/, 'the thread is read before any learn_open');
  assert.match(ui, /saveTutorEntry\(\{ app: canvas, threadId, clientId: `opening-\$\{message\.key\}`, content: message\.text, tutor: openingEntry\(detail\)/);
  assert.match(read('ChatMessages.jsx'), /\(hideTutor && m\.meta\?\.tutor\?\.kind === hideTutor\) \? null/, 'the transcript leaves it to the flow: never shown twice');
  assert.match(read('ask.jsx'), /hideTutor=\{REHEARSAL && chat && !tocView \? OPENING_KIND : null\}/);
});
