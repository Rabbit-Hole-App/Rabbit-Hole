// A member or link viewer asking on a shared board about a selected imported file card (learn-shared-ask.js selectedFileText,
// file-context.js { row }; canvas-file-imports.md section 6, lead follow-up 2026-10-16): the excerpt comes through that board's
// own file reference, with its coverage, and stops once the card is gone from the board. The model is scripted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, scriptModel, setup } from './shared-canvas-fixture.js';

const SRC = `fs_${'7'.repeat(24)}`, REV = 'c'.repeat(64);
const CARD = { id: 'f1', type: 'file', kind: 'clip', label: 'lecture', dx: 0, dy: 0, fileRef: { v: 1, source: { id: SRC, rev: REV }, family: 'video', meta: { name: 'lecture.mp4' } } };

function seed(f) {
  f.sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, 'ana-ws', 'ana@test', 'x', 'video', 'lecture.mp4', 'video/mp4', 10, ?, 'file-sources/x/original', 'stored', 1)`).run(SRC, REV);
  f.sqlite.prepare(`INSERT INTO file_derivatives (id, source_id, source_sha256, kind, name, converter, converter_version, options_hash, status, media_type, bytes, sha256, r2_key, created_at, updated_at)
    VALUES ('fd_000000000000000000000001', ?, ?, 'transcript', 'transcript.json', 'whisper', '1', 'o', 'ready', 'application/json', 1, 'x', 'd/transcript', 1, 1)`).run(SRC, REV);
  f.env.LEARN_MEDIA.get = async key => (key === 'd/transcript'
    ? { text: async () => JSON.stringify({ v: 1, complete: true, units: [{ loc: { startSec: 0, endSec: 30 }, text: 'Attention weighs every token against every other.' }] }) } : null);
}

test('a shared-board viewer asking about a selected file card gets its excerpt through the board reference, and nothing once the card is gone', async t => {
  const f = setup(t), sent = scriptModel(t);
  seed(f);
  const { canvas, token } = await f.shareProject({ state: { ...BOARD, blocks: [...BOARD.blocks, CARD] } });
  const asked = await f.ask(token, 'ben', { message: 'What does the lecture say?', selected: 'f1' });
  assert.equal(asked.status, 200);
  const prompt = JSON.stringify(sent.at(-1));
  assert.match(prompt, /\[0:00-0:30\] Attention weighs every token against every other\./, 'the excerpt, with its location');
  assert.match(prompt, /transcribed: its transcript for this range is included below/, 'its coverage');
  // A question with no file card selected sends no file text.
  await f.ask(token, 'ben', { message: 'Why scale?', selected: 'b1' });
  assert.doesNotMatch(JSON.stringify(sent.at(-1)), /Attention weighs every token/);
  // The owner takes the card off the board: the viewer's same question reads nothing of the file.
  await f.call('PUT', `/api/learn/boards/${canvas.name}/main`, { as: 'ana', body: { state: BOARD } });
  await f.ask(token, 'ben', { message: 'What does the lecture say?', selected: 'f1' });
  assert.doesNotMatch(JSON.stringify(sent.at(-1)), /Attention weighs every token/, 'no card on the board, no reference, no excerpt');
});

test('a file card whose source the board does not reference is unavailable, never read', async t => {
  const f = setup(t), sent = scriptModel(t);
  seed(f);
  const { token } = await f.shareProject({ state: { ...BOARD, blocks: [...BOARD.blocks, CARD] } });
  // The reference index loses the row (as for a crafted card the save refused to record): the file is not read through it.
  f.sqlite.prepare('DELETE FROM file_source_refs WHERE source_id = ?').run(SRC);
  await f.ask(token, 'ben', { message: 'What does the lecture say?', selected: 'f1' });
  const prompt = JSON.stringify(sent.at(-1));
  assert.doesNotMatch(prompt, /Attention weighs every token/);
  assert.match(prompt, /unavailable: its content could not be read for this turn/);
});
