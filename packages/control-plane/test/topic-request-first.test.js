// Topic restriction (agent-coordination/tasks/2026-10-14-topic-restriction-OWNER.md): one canvas holds many subjects. Every
// Learn prompt that answers or creates carries the same request-first rule, none narrows answers to the canvas's topic, a chosen
// goal is background, and an earlier refusal carries forward only for the same request. No subject or phrase is built in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_SYSTEM, PLANNER_SYSTEM, REQUEST_FIRST, plannerRequest, plannerSystem } from '../src/agents/learn-tutor.js';
import { LEARN_SNAPSHOT_SYSTEM, LEARN_SYSTEM, SHARED_CANVAS_SYSTEM } from '../src/agents/learn-chat.js';
import { INLINE_EDIT_SYSTEM, INLINE_NOTE_SYSTEM } from '../src/agents/learn-inline.js';

const ROUTES = {
  'tutor plan (canvas)': CANVAS_SYSTEM,
  'ask, auto and tutor chat (canvas seam, app, repository)': LEARN_SYSTEM,
  'chat with a lesson snapshot': LEARN_SNAPSHOT_SYSTEM,
  'shared canvas viewer chat': SHARED_CANVAS_SYSTEM,
};

test('every Learn chat prompt and the canvas Tutor carry the request-first rule whole', () => {
  for (const [route, system] of Object.entries(ROUTES)) {
    for (const line of REQUEST_FIRST.split('\n')) assert.ok(system.includes(line), `${route}: ${line.slice(0, 40)}`);
  }
  assert.match(REQUEST_FIRST, /A subject it names outranks the canvas title, the inferred topic, the selection, a learning goal and earlier topics/);
  assert.match(REQUEST_FIRST, /resolve references \(this, that card\)/, 'context still resolves this and that');
  assert.match(REQUEST_FIRST, /Answer a subject the canvas lacks from general knowledge, never as if the canvas held it/);
  assert.match(REQUEST_FIRST, /A topic mismatch is never a reason to refuse, redirect, or require a new canvas or a learning path/);
  assert.match(REQUEST_FIRST, /A goal or syllabus the learner chose is background, never a restriction/);
});

test('refusals: a clearly safe new request is judged on its own; the same request rephrased still meets the earlier refusal; safety stays', () => {
  assert.match(REQUEST_FIRST, /Judge each request on its own merits: an earlier refusal carries forward only when this request continues or rephrases what was refused; answer a clearly safe new request normally/);
  assert.match(REQUEST_FIRST, /Content-safety limits, permissions, capability limits and paid confirmations stay exactly as they are/);
});

test('no prompt narrows answers to the canvas topic; the goal is background and may be null', () => {
  const all = [...Object.values(ROUTES), INLINE_NOTE_SYSTEM, INLINE_EDIT_SYSTEM, PLANNER_SYSTEM, plannerSystem(false, 'journey')];
  for (const system of all) assert.doesNotMatch(system, /within what the canvas is about|stay on (the )?(canvas|topic)|outside (the|this) canvas'?s? (topic|scope)/i);
  assert.match(CANVAS_SYSTEM, /goal \(a goal the learner chose: a Rabbit Hole's learning goal or the chosen hook's; null when none was chosen; background, never a restriction\)/);
  assert.match(CANVAS_SYSTEM, /answer what they typed or said, on whatever subject they name/);
  assert.doesNotMatch(CANVAS_SYSTEM, /what it is about is in context\.canvas_context/);
  // A plain canvas with a null goal still picks the canvas prompt: the context key chooses, never the goal.
  const request = plannerRequest({ canvas_context: { goal: null, origin: null }, learner_intent: { kind: 'question' } }, 2000);
  assert.ok(request.system.startsWith(CANVAS_SYSTEM));
});

test('inline Explain and Edit: the selection is what this refers to; a named subject outranks it; a topic mismatch is never a refusal', () => {
  assert.match(INLINE_NOTE_SYSTEM, /unless the request names another subject/);
  assert.match(INLINE_NOTE_SYSTEM, /A subject the request names outranks the selection, the canvas title, a learning goal and earlier topics: explain it from general knowledge without claiming the canvas holds it/);
  assert.match(INLINE_NOTE_SYSTEM, /the topic comes from the request, then the selected material/);
  assert.match(INLINE_EDIT_SYSTEM, /a mismatch with the canvas's title or topic is never a reason to refuse/);
  // Edit's permission is unchanged: only the selected objects may change.
  assert.match(INLINE_EDIT_SYSTEM, /its objects are the only ones you may change/);
});

test('no subject, title or phrase is built into the rule', () => {
  for (const text of [REQUEST_FIRST, INLINE_NOTE_SYSTEM, INLINE_EDIT_SYSTEM]) assert.doesNotMatch(text, /\btrees?\b|logistic|regression|NSFW/i);
});
