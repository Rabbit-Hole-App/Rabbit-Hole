// /animation on a new, never-saved canvas (owner report 2026-10-30, "The 3D animation could not be started"): the board has no
// id until its first save, and an empty canvas never saves on its own, so startAnimation forces that first save instead of
// refusing. LearnPage is too large to mount here; pin the source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('startAnimation force-saves a never-saved canvas, then starts the job on the saved board id', () => {
  const page = readFileSync(new URL('../LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = page.slice(page.indexOf('const startAnimation = async'), page.indexOf('startExplainRef.current = startExplain;'));
  assert.match(start, /if \(!board && words\) \{ await saveBoard\(\{ force: true \}\)\.catch\(\(\) => null\); board = commentBoardRef\.current; \}/);
  assert.match(start, /if \(!board\) return \{ failed: 'this canvas has not finished loading' \};/);
  assert.match(start, /catch \(error\) \{ return \{ failed: /);
  assert.match(start, /animationClient\(api, board\)/);
  assert.match(page, /const saveBoard = async \(\{ force = false \} = \{\}\) => \{/);
  assert.match(page, /if \(force \|\| text !== boardSynced\.current\) \{/);
  assert.match(page, /if \(saved\.board_id\) \{ setCommentBoard\(saved\.board_id\); commentBoardRef\.current = saved\.board_id; \}/);
});

test('/animation shows the start refusal reason instead of a bare "could not be started"', () => {
  const slash = readFileSync(new URL('../learn-slash.js', import.meta.url), 'utf8');
  assert.match(slash, /The 3D animation could not be started\$\{started\?\.failed \? `: \$\{started\.failed\}` : ''\}\. Try again\./);
  assert.match(slash, /return started && !started\.failed \? \{ notice: \{ tone: 'done'/);
});
