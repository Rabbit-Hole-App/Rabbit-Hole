import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorTurn } from './chat-route.js';

const tutor = { ask: () => {} }, chat = {};

test('Chat routing: Ask and Tutor post to /api/learn/ask; Auto keeps an active Tutor; no Tutor means /api/learn/ask', () => {
  assert.equal(tutorTurn({ tutor, chat, mode: 'ask' }), false, 'Ask on a journey canvas: /api/learn/ask');
  assert.equal(tutorTurn({ tutor, chat, mode: 'tutor' }), false, 'Tutor mode: /api/learn/ask with mode tutor');
  assert.equal(tutorTurn({ tutor, chat, mode: 'auto' }), true, 'Auto with an active Tutor: the existing Tutor workflow');
  assert.equal(tutorTurn({ tutor: null, chat, mode: 'auto' }), false, 'Auto with no Tutor: /api/learn/ask');
});

test('outside the Chat pane the Tutor answers as before, except a question about repository lines or a file', () => {
  assert.equal(tutorTurn({ tutor }), true);
  assert.equal(tutorTurn({ tutor, codeTurn: true }), false);
  assert.equal(tutorTurn({ tutor, chat, mode: 'auto', codeTurn: true }), false);
  assert.equal(tutorTurn({ tutor: null }), false);
});

test('a question about a selected PDF page posts to /api/learn/ask, the route that sends the page (pdf-to-canvas.md)', () => {
  assert.equal(tutorTurn({ tutor, chat, mode: 'auto', pageTurn: true }), false);
  assert.equal(tutorTurn({ tutor, pageTurn: true }), false);
});
