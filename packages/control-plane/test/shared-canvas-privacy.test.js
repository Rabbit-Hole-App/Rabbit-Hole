// SHARE-01 privacy (owner brief 2026-10-22 section 7): what a shared or published canvas's routes answer, for a signed-out
// visitor, a signed-in nonmember and a member viewer. Content placed on the canvas stays visible; the creator's chat history,
// goals, progress, assessments, notes, highlights, private files, other canvases and account data never appear.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, BOARD } from './shared-canvas-fixture.js';
import { sharedState } from '../src/shared-privacy.js';
import { canvasCommentsRoute } from '../src/canvas-comments.js';

const SECRET = 'CREATOR-PRIVATE';
// The board as ana's browser saved it: the canvas's content plus her own learning state on the cards and beside them.
const SAVED = {
  ...BOARD,
  blocks: [
    ...BOARD.blocks,
    { id: 'h2', type: 'heading', level: 2, text: 'Masking', done: true },
    { id: 'c1', type: 'challenge', prompt: 'Explain masking', answer: `${SECRET}-answer`, attemptId: 'a1', verdict: `${SECRET}-verdict`, sketchSubmitted: true, sketch: { strokes: [{ id: `${SECRET}-sketch` }] } },
    { id: 'z1', type: 'quiz', question: 'Which normalizes?', options: [{ key: 'a', text: 'softmax', correct: true }], choice: `${SECRET}-choice` },
    { id: 'k1', type: 'code', title: 'Mask it', starter: 'pass', draft: `${SECRET}-draft` },
    { id: 'f1', type: 'flashcards', cards: [{ front: 'Q', back: 'A' }], marks: { 0: `${SECRET}-mark` } },
    { id: 'p9', type: 'paper', title: 'Layer norm', paper: { id: '1607.06450', page: 1 }, highlights: [{ text: `${SECRET}-highlight` }] },
    { id: 's1', type: 'scene', title: 'Softmax scene', activity: { prompt: 'Pick the max' }, activityAnswer: `${SECRET}-activity`, activityOpen: true, attemptLog: [{ result: `${SECRET}-attempt` }] },
  ],
  sources: [{ id: 'yt', kind: 'video', title: `${SECRET}-materials` }],
  goals: [{ label: `${SECRET}-goal` }], progress: { done: `${SECRET}-progress` }, notes: `${SECRET}-notes`, chat: [{ role: 'user', content: `${SECRET}-chat` }],
  tutor: { memory: `${SECRET}-tutor` }, view: { x: 1 }, selection: ['b1'],
};
// Placed content that must stay: an explanation card, a chat card and its follow-up, a heading, a shape and the quiz itself.
const PLACED = ['Keeps the logits small.', 'Positive weights that sum to one.', 'Subtract the max first.', 'Attention', 'Softmax box', 'Which normalizes?', 'Explain masking'];

// ana's private rows in every table that holds a person's own learning state, chat, files or account data: one row each,
// every text column carrying the secret. A table this schema cannot take a generic row into is reported, not skipped silently.
function seedPrivateRows(sqlite) {
  const tables = ['threads', 'messages', 'chat_thread_state', 'chat_message_meta', 'learn_goals', 'learn_goal_criteria', 'learn_coaching_state', 'learn_assessments', 'learn_attempts', 'learn_activities',
    'learn_observations', 'learn_grades', 'learning_journeys', 'learning_path_versions', 'learn_courses', 'pdf_highlights', 'file_sources', 'file_documents', 'usage_actions', 'usage_operations', 'usage_attempts', 'usage_adjustments'];
  const seeded = [];
  sqlite.exec('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.length) continue;
    // A column with a CHECK (x IN (...)) takes its first allowed value; every other text column carries the secret.
    const sql = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).sql;
    const allowed = name => sql.match(new RegExp(`CHECK [(]${name} IN [(]'?([^',)]*)`))?.[1];
    const values = columns.map(column => allowed(column.name) ?? (/INT|REAL|NUM/i.test(column.type) ? 1 : column.name === 'org' ? 'ana-ws' : /email/.test(column.name) ? 'ana@test' : `${SECRET}-${table}-${column.name}`));
    try { sqlite.prepare(`INSERT INTO ${table} (${columns.map(c => `"${c.name}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...values); seeded.push(table); } catch { /* a CHECK this generic row fails */ }
  }
  return seeded;
}

const VISITORS = [['signed out', null], ['nonmember', 'cara'], ['member viewer', 'ben']];

test('a share link and a publication answer only placed content, for every visitor; access names their role', async t => {
  const f = setup(t);
  f.sqlite.exec("INSERT INTO user_profiles (email, name) VALUES ('ana@test', 'Ana Lima'); INSERT INTO user_handles (email, handle) VALUES ('ana@test', 'ana');");
  const { canvas, token } = await f.shareProject({ publicView: true, state: SAVED });
  const secretCanvas = await f.privateCanvas();
  const seeded = seedPrivateRows(f.sqlite);
  assert.ok(seeded.length >= 12, `private rows seeded in ${seeded.join(', ')}`);
  f.sqlite.prepare("INSERT INTO canvas_members (id, org, canvas, invited_email, member_user_id, member_email, status, email_status, invited_by, invited_at, expires_at) VALUES ('m1', 'ana-ws', ?, 'ben@test', 'u-ben-9a2b', 'ben@test', 'active', 'sent', 'u-ana-5d1e', 0, 0)").run(canvas.name);
  const published = (await f.call('POST', `/api/apps/${canvas.name}/publish`, { as: 'ana' })).body.publication_token;
  assert.ok(published, 'published');
  for (const link of [token, published]) {
    for (const [who, as] of VISITORS) {
      const routes = [`/api/learn/boards/shared/${link}`, `/api/learn/boards/shared/${link}/holes`, `/api/learn/boards/shared/${link}/cards/b1/source`];
      for (const path of routes) {
        const { text } = await f.call('GET', path, { as });
        assert.doesNotMatch(text, new RegExp(SECRET), `${who} on ${path}`);
        assert.doesNotMatch(text, /SECRET-TITLE|SECRET-CONTENT/, `${who} on ${path}: a private canvas`);
        assert.doesNotMatch(text, /ana@test/, `${who} on ${path}: the creator's email`);
      }
      const { body } = await f.call('GET', `/api/learn/boards/shared/${link}`, { as });
      for (const placed of PLACED) assert.ok(JSON.stringify(body.state).includes(placed), `${who}: placed content "${placed}" stays`);
      assert.deepEqual(Object.keys(body.state).sort(), ['areas', 'blocks', 'exchanges', 'groups', 'items', 'links', 'shapes', 'strokes'], `${who}: only the canvas's content keys`);
      assert.deepEqual(body.access, { role: !as ? 'guest' : as === 'ben' && link === token ? 'commenter' : 'viewer', shareable: { context: false, files: false } }, `${who} on ${link === token ? 'the share' : 'the publication'}`);
    }
  }
  // A member's own page (/c/<board id>) reads the same placed content only; the owner reading it there keeps everything.
  const boardId = f.sqlite.prepare("SELECT id FROM learn_boards WHERE app = ? AND board = 'main'").get(canvas.name).id;
  const memberRead = async who => (await canvasCommentsRoute(`/api/learn/c/${boardId}/board`, new Request(`https://app.test/api/learn/c/${boardId}/board`, { headers: { cookie: `small_session=${who}` } }), f.env)).text();
  const asMember = await memberRead('ben');
  assert.doesNotMatch(asMember, new RegExp(SECRET), 'a member');
  for (const placed of PLACED) assert.ok(asMember.includes(placed), `member: placed content "${placed}" stays`);
  assert.match(await memberRead('ana'), new RegExp(`${SECRET}-attempt`), 'the owner on the member route');
  // The owner's own page still has all of it: nothing was removed from storage, only from what a link answers.
  assert.match((await f.call('GET', `/api/learn/boards/${canvas.name}/main`, { as: 'ana' })).text, new RegExp(`${SECRET}-attempt`));
  assert.equal((await f.call('GET', `/api/learn/boards/${secretCanvas.name}/main`, { as: 'cara' })).status === 200, false, 'a private canvas stays closed');
});

test('a fork through a link copies the placed content, never the creator\'s answers, attempts or highlights', async t => {
  const f = setup(t);
  const { token } = await f.shareProject({ publicView: true, state: SAVED });
  const fork = await f.call('POST', '/api/learn/boards/fork', { as: 'cara', body: { source: { token }, key: 'privacy-fork-1' } });
  assert.equal(fork.status, 201);
  const copy = (await f.call('GET', `/api/learn/boards/${fork.body.name}/main`, { as: 'cara' })).text;
  for (const field of ['answer', 'verdict', 'sketch', 'choice', 'draft', 'mark', 'highlight', 'activity', 'attempt', 'goal', 'progress', 'notes', 'chat', 'tutor']) assert.doesNotMatch(copy, new RegExp(`${SECRET}-${field}`), field);
  assert.match(copy, /Keeps the logits small\./);
});

test('sharedState: the cards keep their content; only learner fields go; a board without them comes back as it was', () => {
  const state = sharedState(SAVED);
  assert.deepEqual(state.blocks.find(block => block.id === 'h2'), { id: 'h2', type: 'heading', level: 2, text: 'Masking' }, "the creator's section tick stays theirs");
  const scene = state.blocks.find(block => block.id === 's1');
  assert.deepEqual(scene, { id: 's1', type: 'scene', title: 'Softmax scene', activity: { prompt: 'Pick the max' } });
  assert.equal(state.blocks.find(block => block.id === 'b1'), BOARD.blocks.find(block => block.id === 'b1'), 'an untouched card is the same object');
  assert.deepEqual(sharedState(BOARD), BOARD);
  assert.deepEqual(sharedState(null), {});
});
