import test from 'node:test';
import assert from 'node:assert/strict';
import { askMode } from './chat-route.js';

// Every Learn turn posts to /api/learn/ask (Tutor cleanup P2: the browser Tutor and tutorTurn are gone). Chat's Tutor mode answers
// as Auto does; only the Table of contents conversation names mode tutor (owner decision 1a, 2026-10-20).
test('Chat routing: Chat never asks /api/learn/ask for the syllabus mode; the TOC conversation keeps tutor', () => {
  assert.deepEqual([askMode('tutor'), askMode('tutor', true)], ['auto', 'tutor'], 'Chat never asks /api/learn/ask for the syllabus mode');
  assert.deepEqual([askMode('auto'), askMode('ask'), askMode('ask', true)], ['auto', 'ask', 'ask']);
});
