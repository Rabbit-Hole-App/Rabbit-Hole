// The Table of contents' conversation (owner brief 2026-10-16 item 7; lead ruling 2026-10-16, for the owner to confirm): its
// AskPanel renders only its messages, the Tutor label, its composer and its own progress and errors. The canvas selection and
// Chat's extras stay Chat's. card-select-check (two [data-selected-card]) and dive-check (two [data-dive-suggestion]) found a
// hidden second copy in the mounted TOC tab. ask.jsx cannot run under node, so the pure helper runs for real and the wiring
// is pinned by source text, as learn-ask-target.test.mjs does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_REFS, TOC_VIEW, tocAskProps } from './learn-ask-target.js';

const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const panel = ask.slice(ask.indexOf('export function AskPanel'));

test('a TOC-view ask carries no selection and none of Chat extras; the Tutor still answers', () => {
  const tutorAsk = () => {};
  const props = {
    canvasTarget: { id: 'k-exp', kind: 'Explanation', title: 'Why salt melts ice', card: true, ref: { sourceId: 'card:k-exp' }, image: 'm1' },
    onClearCanvasTarget: () => {}, slash: { run: () => {} }, tray: { tray: {} }, voice: { state: 'off' }, nextStepRef: { current: null },
    tutor: { ask: tutorAsk, extras: 'dive suggestion', opening: { key: 'o1', question: 'Start?' } }, placeholder: 'Describe your goal',
  };
  const toc = tocAskProps(props);
  for (const key of ['canvasTarget', 'onClearCanvasTarget', 'slash', 'tray', 'voice', 'nextStepRef']) assert.equal(toc[key], null, key);
  assert.equal(toc.tutor.ask, tutorAsk, 'the Tutor still answers the TOC conversation');
  assert.equal(toc.tutor.extras, null, 'no suggestion chips or suggested Rabbit Hole');
  assert.equal(toc.tutor.opening, null, 'no opening question sent into the TOC thread');
  assert.equal(toc.placeholder, 'Describe your goal', 'everything else passes through');
  assert.equal(props.canvasTarget.id, 'k-exp', 'the Chat props are not changed');
  assert.equal(tocAskProps({ tutor: null }).tutor, null);
  // The request: canvas_target and the image come only from the target, which is null in the TOC view; code refs are NO_REFS.
  assert.match(panel, /const target = canvasTarget; \/\/ selected lesson block riding as context/);
  assert.match(panel, /\.\.\.\(target \? \{ canvas_target: canvasTargetField\(/);
  assert.match(panel, /const cardRefs = tocView \? NO_REFS : graphCardRefs;/);
  assert.match(panel, /const temporaryCode = chat && !tocView \? \[[^\n]*\] : NO_REFS;/);
  assert.ok(Object.isFrozen(NO_REFS) && NO_REFS.length === 0);
});

test('tocAskProps runs before any read of the props it clears', () => {
  const at = panel.indexOf('if (tocView) ({ canvasTarget, onClearCanvasTarget, slash, tray, voice, nextStepRef, tutor } = tocAskProps(');
  assert.ok(at > 0);
  const head = panel.slice(panel.indexOf('\n'), at).replace(/^\s*\/\/.*$/gm, '');
  for (const name of ['canvasTarget', 'onClearCanvasTarget', 'slash', 'tray', 'voice', 'nextStepRef', 'tutor']) assert.ok(!new RegExp(`\\b${name}\\b`).test(head), `${name} is read before tocAskProps`);
});

test('every data- attribute AskPanel renders is listed as shown or hidden in the TOC view, and each hidden one is gated', () => {
  const rendered = [...new Set(panel.match(/data-[a-z][a-z-]*/g))].sort();
  const listed = [...Object.keys(TOC_VIEW.shown), ...Object.keys(TOC_VIEW.hidden)].filter(k => k.startsWith('data-')).sort();
  assert.deepEqual(rendered, listed, 'a new data- attribute in AskPanel needs its row in TOC_VIEW');
  assert.equal(Object.keys(TOC_VIEW.shown).filter(k => k.startsWith('data-')).length, 0, 'the TOC view shows no AskPanel-owned marker');
  // The gates: the selection chip (canvasTarget null), the pills, the + menu, the attachments, the repository box, the @ list.
  assert.match(panel, /\{canvasTarget && !chipTarget && <div data-canvas-target/);
  assert.match(panel, /chips=\{chat && !tocView \? <ContextChips/);
  assert.match(panel, /leading=\{<>\n\s+\{!tocView && <div className="relative shrink-0">\n\s+<button\n\s+type="button"\n\s+aria-label="Add"/);
  assert.match(panel, /\{!tocView && boardContext\?\.paper && <div/);
  assert.match(panel, /\{!tocView && boardContext\?\.preview && <div className="relative mb-2 w-28" data-canvas-attachment>/);
  assert.match(panel, /\{!tocView && repository && !codebase && repositoryContext\?\.label && /);
  assert.match(panel, /\{!tocView && atHits\.length > 0 && \(/);
  assert.match(panel, /\{tutor\?\.extras && !voiceOn && <div data-tutor-extras/);
  assert.match(panel, /\{tray\?\.tray && <TutorPromptTray/);
  assert.match(panel, /if \(nextStepRef\) nextStepRef\.current = sendStep;/);
  assert.match(panel, /stacked=\{!!chat\} tocView=\{tocView\}/);
});
