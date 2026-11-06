import test from 'node:test';
import assert from 'node:assert/strict';
import { askMode, tutorTurn } from './chat-route.js';

const tutor = { ask: () => {} }, chat = {};

// Owner decision 1a (2026-10-20): Chat's Tutor is the teaching Tutor (the Tutor workflow, as Auto); syllabus building moved to
// the Table of contents conversation, whose held Tutor still posts to /api/learn/ask with mode tutor.
test('Chat routing: Ask posts to /api/learn/ask; Auto and Tutor keep an active Tutor; the TOC keeps the syllabus', () => {
  assert.equal(tutorTurn({ tutor, chat, mode: 'ask' }), false, 'Ask on a journey canvas: /api/learn/ask');
  assert.equal(tutorTurn({ tutor, chat, mode: 'tutor' }), true, 'Tutor mode: the teaching Tutor workflow (1a)');
  assert.equal(tutorTurn({ tutor, chat, mode: 'tutor', toc: true }), false, 'the TOC conversation: /api/learn/ask with mode tutor');
  assert.equal(tutorTurn({ tutor, chat, mode: 'auto' }), true, 'Auto with an active Tutor: the existing Tutor workflow');
  assert.equal(tutorTurn({ tutor: null, chat, mode: 'auto' }), false, 'Auto with no Tutor: /api/learn/ask');
  assert.deepEqual([askMode('tutor'), askMode('tutor', true)], ['auto', 'tutor'], 'Chat never asks /api/learn/ask for the syllabus mode');
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
