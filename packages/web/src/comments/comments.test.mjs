// Canvas comments in the browser (docs/features/canvas-comments.md): anchors that follow their object, the retry
// contract (one client id per draft, a fresh id once on id_conflict), drafts kept per thread, and the wiring seams.
// The server side is control-plane/test/canvas-comments.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorAt, anchorText, objectOrigin, pinPoint } from './anchors.js';
import { displayName, failureText, freshDraft, loadDraft, saveDraft, sendDraft, when } from './comments-api.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('a card-relative anchor follows its object; a point stays put; a deleted object detaches', () => {
  const board = { bounds: { b1: { x: 100, y: 50, w: 300, h: 200 } }, items: [{ id: 'i1', x: -20, y: 10 }], shapes: [{ id: 's1', x1: 90, y1: 40, x2: 10, y2: 80 }] };
  const anchor = anchorAt({ x: 130, y: 70 }, { id: 'b1', kind: 'block', label: '  Why scale?  ' }, board);
  assert.deepEqual(anchor, { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 30, dy: 20, label: 'Why scale?' });
  assert.deepEqual(pinPoint(anchor, board), { x: 130, y: 70 });
  assert.deepEqual(pinPoint(anchor, { ...board, bounds: { b1: { x: 400, y: 0 } } }), { x: 430, y: 20 }, 'the card moved; the pin went with it');
  assert.equal(pinPoint(anchor, { ...board, bounds: {} }), null, 'card deleted: no pin');
  assert.deepEqual(objectOrigin('s1', board), { x: 10, y: 40 }, 'a shape by its box');
  assert.deepEqual(objectOrigin('i1', board), { x: -20, y: 10 });
  assert.deepEqual(anchorAt({ x: 5.4, y: 9.6 }, null, board), { kind: 'point', x: 5, y: 10 }, 'the empty canvas');
  assert.deepEqual([anchorText(anchor, true), anchorText(anchor, false), anchorText({ kind: 'point' }, true)], ['on Why scale?', 'Card deleted · Why scale?', 'on the canvas']);
});

test('a retry reuses the draft id; an id_conflict resends once with a fresh id; any other failure surfaces', async () => {
  const seen = [];
  const draft = { id: 'draft-id', body: 'hi' };
  const ok = await sendDraft(async id => { seen.push(id); return { id }; }, draft);
  assert.deepEqual([ok.id, seen], ['draft-id', ['draft-id']]);
  const conflict = Object.assign(Error('used'), { data: { code: 'id_conflict' } });
  const fresh = await sendDraft(async id => { seen.push(id); if (id === 'draft-id') throw conflict; return { id }; }, draft, () => 'fresh-id');
  assert.equal(fresh.id, 'fresh-id');
  const limited = Object.assign(Error('slow down'), { data: { code: 'limited', error: "You've posted a lot in a short time. Try again in a few minutes." } });
  await assert.rejects(sendDraft(async () => { throw limited; }, draft), /slow down/);
  assert.equal(failureText(limited), "You've posted a lot in a short time. Try again in a few minutes.");
  assert.match(failureText(new TypeError('Failed to fetch')), /You're offline/);
  assert.match(failureText(limited, false), /You're offline/);
});

test('drafts live per thread in session storage; storage that throws keeps them in memory only', () => {
  const store = new Map();
  const storage = () => ({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) });
  saveDraft(storage, 't1', { id: 'a', body: 'half written', failed: "Couldn't send." });
  assert.deepEqual(loadDraft(storage, 't1'), { id: 'a', body: 'half written', failed: "Couldn't send." });
  assert.equal(loadDraft(storage, 't2'), null);
  saveDraft(storage, 't1', { id: 'a', body: '', failed: null });
  assert.equal(loadDraft(storage, 't1'), null, 'an empty draft is not kept');
  const blocked = () => { throw Error('SecurityError'); };
  assert.equal(loadDraft(blocked, 't1'), null);
  assert.doesNotThrow(() => saveDraft(blocked, 't1', freshDraft()));
  assert.match(freshDraft().id, /^[0-9a-f-]{36}$/);
});

test('names: display name, else @handle, else the neutral label; times are short', () => {
  assert.deepEqual([displayName({ name: 'Ana', handle: 'ana' }), displayName({ handle: 'ana' }), displayName({ name: null })], ['Ana', '@ana', 'Rabbit Hole user']);
  const now = Date.parse('2026-10-07T12:00:00Z');
  assert.deepEqual(['2026-10-07T11:59:40Z', '2026-10-07T11:55:00Z', '2026-10-07T09:00:00Z'].map(iso => when(iso, now)), ['now', '5m', '3h']);
});

test('seams: the canvas menu offers Add comment (card) and Add comment here (canvas); the panel and pins are wired on the owner page', () => {
  const canvas = read('../AdaptiveCanvas.jsx'), page = read('../LearnPage.jsx'), panel = read('./CommentsPanel.jsx');
  assert.match(canvas, /\{addComment && !menuAt\.id && <button [^\n]*data-menu-add-comment[^\n]*>Add comment here<\/button>\}\n\s+\{startHole && /, 'empty canvas: first');
  assert.match(canvas, /Start Rabbit Hole<\/button>\}\n\s+\{addComment && menuAt\.id && <button [^\n]*>Add comment<\/button>\}/, 'a card: right after Start Rabbit Hole');
  assert.match(canvas, /\{commentPins && presenting === null && <CommentPins /, 'no pins while presenting');
  assert.match(page, /<AdaptiveCanvas key=\{canvasEpoch\} \{\.\.\.comments\.canvasProps\} /);
  assert.match(page, /\{comments\.active && <CommentsPanel hidden=\{panelTab !== 'comments'\} \{\.\.\.comments\.panelProps\} \/>\}/);
  assert.match(page, /enabled: isCanvas && !hole && boardName === 'main'/, 'top-level canvases\' main board only (Q5)');
  assert.doesNotMatch(panel + read('./comments-api.js'), /\.email\b|user_id|author_id/, 'the browser never handles an email or an account id');
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/, 'text renders as React text');
});

test('increment 2 seams: Share carries the comment settings; the published page reads the public family; view-only menus open for commenters', () => {
  const share = read('../SharePanel.jsx'), page = read('../LearnPage.jsx'), shared = read('../SharedBoardPage.jsx'), canvas = read('../AdaptiveCanvas.jsx'), settings = read('./CommentSettings.jsx');
  assert.match(share, /\{onPublish && <ExploreRow [^\n]*\/>\}\n\s+\{comments\}/, 'one slot, under Publish to Explore');
  assert.match(page, /comments=\{comments\.active \? <><PeopleWithAccess base=\{memberBase\(commentBoard\)\} \/><CommentSettings base=\{memberBase\(commentBoard\)\} published=\{!!sharing\?\.published\} \/><\/> : null\}/);
  assert.match(settings, /<Switch on=\{enabled\} label="Allow comments"/, 'labelled exactly Allow comments');
  assert.match(settings, /disabled=\{busy \|\| !enabled\}/, 'the public setting is disabled while comments are off');
  assert.match(shared, /useCanvasComments\(\{ base: commentsInfo && publicBase\(token\), canAdd: !!commentsInfo\?\.can\.post,/, 'posting only for those the server lets post');
  assert.match(shared, /if \(!published\) return undefined;/, 'a share link (/b) never asks the public family');
  assert.match(canvas, /if \(readOnlyRef\.current && !onAddComment && \(!onStartRabbitHole/);
});

test('/i keeps the token out of the address: fragment to session storage, then the address is plain /i', async () => {
  const { takeInviteToken, waitText } = await import('./InvitePage.jsx').catch(() => ({}));
  if (!takeInviteToken) return; // JSX: the page itself is checked by e2e/comments-check.mjs; the source rules below still run
  const store = new Map(), replaced = [];
  const storage = { setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) ?? null };
  const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  assert.equal(takeInviteToken({ hash: `#${token}` }, { replaceState: (...args) => replaced.push(args[2]) }, storage), token);
  assert.deepEqual([...store.entries()], [['rh_invite', token]]);
  assert.deepEqual(replaced, ['/i']);
  assert.deepEqual([waitText(42), waitText(61), waitText(3 * 3600)], ['42 seconds', '2 minutes', '3 hours']);
});

test('increment 3 seams: /i and /c routes, served no-referrer and no-store; the invitation page never puts the token anywhere else', () => {
  const main = read('../main.jsx'), worker = read('../../dev-worker.js'), invite = read('./InvitePage.jsx');
  assert.match(main, /: memberBoard \? <Suspense fallback=\{null\}><MemberBoardPage boardId=\{memberBoard\[1\]\} \/>/);
  assert.match(main, /: invitation \? <Suspense fallback=\{null\}><InvitePage \/><\/Suspense>/);
  assert.match(worker, /if \(path === '\/i' \|\| [^\n]+\{\n\s+return new Response\(SHELL, \{ headers: \{ 'Content-Type': 'text\/html;charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' \} \}\);/);
  assert.match(invite, /history\.replaceState\(null, '', '\/i'\)/);
  assert.match(invite, /window\.location\.href = '\/sign-in\?next=\/i'/, 'sign-in comes back to /i, the token never in next');
  assert.doesNotMatch(invite, /localStorage|document\.cookie|\?token=|console\./, 'the token stays in this tab');
  assert.match(invite, /sessionStorage\.removeItem\(KEY\)/);
});

test('mentions travel as the server maps them: UTF-16 pos and len of @handle, only at a word start', async () => {
  const { mentionsIn } = await import('./comments-api.js');
  assert.deepEqual(mentionsIn('Thanks @chen, can you check option B?'), [{ pos: 7, len: 5, handle: 'chen' }]);
  assert.deepEqual(mentionsIn('@ana and mail@lab.org and @b_2'), [{ pos: 0, len: 4, handle: 'ana' }, { pos: 26, len: 4, handle: 'b_2' }], 'an email is not a mention');
  assert.deepEqual(mentionsIn('é @x'), [{ pos: 2, len: 2, handle: 'x' }]);
  const panel = read('./CommentsPanel.jsx');
  assert.match(panel, /mentions: mentionsIn\(draft\.body\)/);
  assert.match(panel, /segment\.mention \? <span key=\{index\} data-mention/);
});

test('entry points: the Comment tool in the rail, C with its guards, the shortcut row, the header button and the tab dot', () => {
  const canvas = read('../AdaptiveCanvas.jsx'), sheet = read('../ShortcutsSheet.jsx'), page = read('../LearnPage.jsx'), header = read('../PanelHeader.jsx');
  assert.match(canvas, /\{onAddComment && <ToolButton value="comment" Icon=\{MessageCircle\} label="Comment {2}C"/, 'tooltip "Comment  C"');
  assert.match(canvas, /onPointerDownCapture=\{tool === 'askArea' \? startArea : tool === 'comment' \? placeComment : undefined\}/);
  const key = canvas.slice(canvas.indexOf("if ((event.key === 'c' || event.key === 'C')"), canvas.indexOf("if (readOnlyRef.current) { if (event.key === 'Escape')"));
  assert.match(key, /!event\.ctrlKey && !event\.metaKey && !event\.altKey/, 'Ctrl+C still copies');
  assert.match(key, /presentingRef\.current === null/, 'never while presenting');
  assert.match(key, /isContentEditable \|\| \['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'\]\.includes/, 'never while typing');
  assert.match(key, /held\.closest\?\.\('\[data-block-id\]'\) && !held\.matches\('\[data-block-id\]'\)/, 'never inside a card\'s own editor or widget');
  assert.ok(canvas.indexOf("if ((event.key === 'c' || event.key === 'C')") < canvas.indexOf("if (readOnlyRef.current) { if (event.key === 'Escape')"), 'C works on view-only boards too');
  assert.match(sheet, /\['Comment on the selected card, or place a comment', \['C'\]\]/);
  assert.match(page, /\{comments\.active && <button type="button" data-comments-header/);
  assert.match(header, /\{id === 'comments' && commentsOn && commentsUnread > 0 && <span data-unread-dot/);
});
