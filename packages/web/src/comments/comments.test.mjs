// Canvas comments in the browser (docs/features/canvas-comments.md): anchors that follow their object, the retry
// contract (one client id per draft, a fresh id once on id_conflict), drafts kept per thread, and the wiring seams.
// The server side is control-plane/test/canvas-comments.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTACT, INTO, anchorAt, anchorText, objectOrigin, pinCount, pinPoint, pinSpot, pinTopCentre } from './anchors.js';
import { displayName, failureText, freshDraft, loadDraft, saveDraft, sendDraft, when } from './comments-api.js';
import { badgeText, openCount } from './useCanvasComments.js';
import { COMMON_ACTIONS } from '../canvas-actions.js';

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

test('a pin (owner, 2026-10-08): its live count, capped to fit; orange and solid by default; a click picks it and opens its thread', () => {
  assert.deepEqual([1, 2, 9, 99, 100, 1500].map(pinCount), ['1', '2', '9', '99', '99+', '99+']);
  const pins = read('./CommentPins.jsx'), canvas = read('../AdaptiveCanvas.jsx'), hook = read('./useCanvasComments.js');
  assert.match(pins, /export const PIN_DEFAULT = '#f59e0b'/, "the palette's orange");
  assert.doesNotMatch(pins, /border-dashed/, 'no dotted or dashed outline');
  assert.match(pins, /style=\{\{ left, top, width: SIZE, height: SIZE, background: color, borderColor: color \}\}/, 'filled and outlined in its colour');
  assert.match(pins, /border border-solid text-white/, 'the + and the count: white in light mode, the dark surface in dark mode');
  assert.match(pins, /aria-label=\{pin\.ghost \? 'New comment' : `\$\{pin\.comments\} \$\{pin\.comments === 1 \? 'comment' : 'comments'\}`\}/);
  assert.match(pins, /\{pin\.ghost \? <Plus [^\n]*: <span data-pin-count [^\n]*>\{pinCount\(pin\.comments\)\}<\/span>\}/, 'the + only on the draft');
  assert.match(pins, /event\.currentTarget\.focus\(\);\n\s+onPick\?\.\(pin\.id\);\n\s+onPin\?\.\(pin\.id\);/, 'a click: the focus, the pick, the thread');
  assert.match(canvas, /\{!showStyle && pickedPin\?\.can\.color && onPinColor && presenting === null && <StylePanel colorOnly /, "the shapes' colour control, colour only");
  assert.match(canvas, /if \(pinPick\) dropPin\(\);/, 'a press on the canvas lets the pin go');
  assert.match(hook, /comments: thread\.comments \?\? 1/);
});

test('no comment pin without a text comment (owner, 2026-10-13): a thread with no live comment has no pin; the ghost only while composing', async () => {
  const { pinsOf } = await import('./useCanvasComments.js');
  const anchor = { kind: 'object', object_id: 'b1', object_kind: 'block', dx: 0, dy: 0, label: '' };
  const live = { id: 't1', anchor, created_at: '2026-10-13T01:00:00Z', comments: 2 };
  const emptied = { id: 't2', anchor, created_at: '2026-10-13T00:00:00Z', comments: 0 };
  assert.deepEqual(pinsOf([emptied, live], null, null, true).map(pin => [pin.id, pin.comments]), [['t1', 2]], 'its last comment deleted: no pin');
  assert.deepEqual(pinsOf([emptied], 't2', null, true), [], 'not even while its thread is open in the panel');
  assert.deepEqual(pinsOf([], null, anchor, true), [{ id: 'draft', anchor, ghost: true }], 'the ghost while its New comment panel shows');
  assert.deepEqual(pinsOf([], null, anchor, false), [], 'the panel hidden or on another tab: no ghost');
  assert.deepEqual(pinsOf([], null, null, true), [], 'no draft (Cancel, Esc, Send): no ghost');
  const hook = read('./useCanvasComments.js'), page = read('../LearnPage.jsx'), shared = read('../SharedBoardPage.jsx'), member = read('./MemberBoardPage.jsx');
  assert.match(hook, /pinsOf\(threads, selected, draft, shown\)/);
  assert.match(page, /shown: panelOpen && panelTab === 'comments' \}\);/, 'open, on the Comments tab');
  for (const source of [shared, member]) assert.match(source, /shown: commentsOpen \}\);/);
});

test('Esc in the New comment panel is Cancel (owner, 2026-10-13): one Cancel path, a menu in it first, the canvas stands down', () => {
  const panel = read('./CommentsPanel.jsx'), canvas = read('../AdaptiveCanvas.jsx');
  assert.match(panel, /if \(event\.key !== 'Escape' \|\| event\.defaultPrevented \|\| event\.nativeEvent\.isComposing\) return;\n\s+event\.preventDefault\(\); event\.stopPropagation\(\);\n\s+onCancel\(\);/);
  assert.match(panel, /<div data-comment-draft onKeyDown=\{escape\} /);
  assert.match(panel, /<Button size="sm" onClick=\{onCancel\}>Cancel<\/Button>/, 'the button and Esc share one handler');
  assert.match(panel, /else if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); setQuery\(null\); \}/, 'the @ menu takes the first Esc');
  // The canvas listens on window in the capture phase, before any panel handler: it must stand down for this Esc itself.
  assert.match(canvas, /window\.addEventListener\('keydown', key, true\);/);
  assert.match(canvas, /held\?\.closest\?\.\('\[role="dialog"\],\[role="menu"\],\[data-comment-draft\]'\)/);
});

test('a group anchor follows its members together; a shape anchor its box; each says what it is on', () => {
  const board = { bounds: { b1: { x: 100, y: 50, w: 300, h: 200 } }, items: [], shapes: [{ id: 's1', x1: 90, y1: 40, x2: 10, y2: 80 }], groups: { g1: ['b1', 's1'] } };
  assert.deepEqual(objectOrigin('g1', board), { x: 10, y: 40 }, "the group's top left is its members' top left");
  const onGroup = anchorAt({ x: 30, y: 60 }, { id: 'g1', kind: 'group', label: '' }, board);
  assert.deepEqual(onGroup, { kind: 'object', object_id: 'g1', object_kind: 'group', dx: 20, dy: 20, label: '' });
  const moved = { ...board, bounds: { b1: { x: 300, y: 250 } }, shapes: [{ id: 's1', x1: 290, y1: 240, x2: 210, y2: 280 }] };
  assert.deepEqual(pinPoint(onGroup, moved), { x: 230, y: 260 }, 'the group moved; the pin went with it');
  assert.equal(pinPoint(onGroup, { ...board, groups: {} }), null, 'ungrouped: detached');
  const onShape = anchorAt({ x: 50, y: 60 }, { id: 's1', kind: 'shape', label: '' }, board);
  assert.deepEqual(pinPoint(onShape, moved), { x: 250, y: 260 }, 'the shape moved; the pin went with it');
  assert.deepEqual([anchorText(onShape, true), anchorText(onShape, false), anchorText(onGroup, true), anchorText({ ...onGroup, label: 'Setup' }, false)],
    ['on a shape', 'Shape deleted', 'on a group', 'Group removed · Setup']);
});

// Overlap of two { left, top, right, bottom } boxes on each axis.
const overlap = (a, b) => [Math.min(a.right, b.right) - Math.max(a.left, b.left), Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)];
test('every pin touches its object (owner, 2026-10-13): on its top edge left of the pill row, else down its left edge, at any size and zoom', () => {
  const SIZE = 30, GAP = 4, ROW = 297;
  const pinOn = (box, index, row = ROW, lead = 0) => { const at = pinSpot(box, row, index, SIZE, GAP, lead); return { ...at, right: at.left + SIZE, bottom: at.top + SIZE }; };
  // A wide card at 100%: on its top edge, its tail INTO into it, just left of the row; the next one further left.
  const card = { left: 100, top: 200, right: 740, bottom: 500 };
  const first = pinOn(card, 0), second = pinOn(card, 1);
  assert.deepEqual([first.left, first.top, first.tail], [740 - ROW - SIZE - GAP, 200 + INTO - SIZE, 'bl']);
  assert.equal(first.right, 740 - ROW - GAP, 'left of the row');
  assert.equal(second.left, first.left - SIZE - GAP);
  // A sticky note narrower than the row: on its left edge from its top, below the row's level, the next one under it.
  const note = { left: 100, top: 200, right: 260, bottom: 360 };
  assert.deepEqual([pinOn(note, 0).left, pinOn(note, 0).top, pinOn(note, 0).tail], [100 + CONTACT - SIZE, 200 + 2 * CONTACT, 'br']);
  assert.equal(pinOn(note, 1).top, 200 + 2 * CONTACT + SIZE + GAP);
  // A group whose name chip takes its outline's top left: its pins stay right of the chip, else go down its left edge.
  const group = { left: 100, top: 200, right: 520, bottom: 400 };
  const chipped = pinOn(group, 0, ROW, 80);
  assert.ok(chipped.left >= 100 + 80 && chipped.top === 200 + INTO - SIZE, `right of the chip: ${JSON.stringify(chipped)}`);
  assert.deepEqual(pinSpot({ ...group, right: 420 }, ROW, 0, SIZE, GAP, 80), { left: 100 + CONTACT - SIZE, top: 200 + 2 * CONTACT, tail: 'br' }, 'no room right of the chip');
  // A text box keeps its whole top edge (its ladder, Text | Code and actions sit above it from the left): its pin hangs on its
  // left edge, below its top and left of its text, so it covers no control and no word, and still touches it.
  const text = { left: 100, top: 200, right: 420, bottom: 232 };
  const onText = pinOn(text, 0, ROW, 320);
  assert.deepEqual([onText.left, onText.top, onText.tail], [100 + CONTACT - SIZE, 200 + 2 * CONTACT, 'br']);
  assert.ok(onText.top > text.top && onText.right <= text.left + CONTACT, `clear of its controls and its words: ${JSON.stringify(onText)}`);
  // Any box, any zoom (a dot of a shape at 25% included), any index, with a chip or not: the pin overlaps it by CONTACT on both axes.
  for (const box of [card, note, group, { left: 50, top: 50, right: 52, bottom: 51 }, { left: 0, top: 0, right: 600, bottom: 0 }, { left: 10, top: 10, right: 330, bottom: 40 }])
    for (let index = 0; index < 6; index++) for (const row of [0, ROW, 591]) for (const lead of [0, 80]) {
      const [x, y] = overlap(pinOn(box, index, row, lead), box);
      assert.ok(x >= Math.min(CONTACT, box.right - box.left) && y >= Math.min(CONTACT, box.bottom - box.top), `touches ${JSON.stringify({ box, index, row, lead, x, y })}`);
    }
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
  // No reason from the server (a platform error page, owner bug 2026-10-09): the status, so the next one is diagnosable.
  assert.equal(failureText(Object.assign(new Error('HTTP 502'), { status: 502, data: {} })), "Couldn't send (HTTP 502).");
  assert.equal(failureText(new Error('?')), "Couldn't send.");
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

test('seams: the canvas menu offers Add comment on an object only (owner, 2026-10-08); the panel and pins are wired on the owner page', () => {
  const canvas = read('../AdaptiveCanvas.jsx'), page = read('../LearnPage.jsx'), panel = read('./CommentsPanel.jsx');
  assert.doesNotMatch(canvas, /Add comment here/, 'no comment on the bare canvas');
  assert.match(canvas, /<CommentPins pins=\{commentPins\} view=\{view\} board=\{commentBoard\} slotOf=\{commentSlot\} /, 'object pins sit in their slot');
  assert.match(canvas, /return \{ x, y, w, h: [^\n]*, row: pillRow\(id\), lead \};/, "the slot is the object's box, its pill row and what its top left keeps clear");
  assert.match(canvas, /\(item && item\.kind !== 'sticky'\) \|\| \(shape && TEXT_BOX\[shape\.kind\]\) \? w : 0/, 'a text box, an equation and a text shape keep their whole top edge for their controls');
  assert.match(read('./CommentPins.jsx'), /pinTopCentre\(box, index, SIZE, GAP\)/, 'every object pin goes through pinTopCentre');
  // UI-25: the menu's rows are the action registry's; Add comment comes right after Start Rabbit Hole, with its C hint.
  const start = COMMON_ACTIONS.findIndex(entry => entry.id === 'start-rabbit-hole'), comment = COMMON_ACTIONS.findIndex(entry => entry.id === 'add-comment');
  assert.equal(comment, start + 1, 'a card: right after Start Rabbit Hole');
  assert.deepEqual([COMMON_ACTIONS[comment].label, COMMON_ACTIONS[comment].icon, COMMON_ACTIONS[comment].hint, COMMON_ACTIONS[comment].group], ['Add comment', 'MessageCircle', 'C', COMMON_ACTIONS[start].group]);
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
  assert.match(shared, /useCanvasComments\(\{ base: commentsInfo && commentsBase, canAdd: !!commentsInfo\?\.can\.post,/, 'posting only for those the server lets post');
  assert.match(shared, /const commentsBase = memberBoard \? memberBase\(memberBoard\) : shared\?\.published \? publicBase\(token\) : null;/, 'a share link (/b) never asks the public family; owners and members get theirs');
  // UI-25: a view-only board's menu opens when it has a row for the target (Add comment for commenters; canvas-actions.js).
  assert.match(canvas, /legacyCan\(\{ readOnly, comment: !!onAddComment, rabbitHole: rabbitHoleHere \}\)/);
  assert.match(canvas, /if \(!rows\.length\) \{ setMenuAt\(null\); return; \}/);
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
  assert.doesNotMatch(canvas, /value="comment"|placeComment|tool === 'comment'/, 'no Comment tool (owner, 2026-10-08)');
  assert.match(canvas, /&& commentKeyRef\.current\(focusedCard \? \[focusedCard\] : selectedRef\.current\)\) \{/, 'C acts only when the selection takes the comment');
  const key = canvas.slice(canvas.indexOf('const busy = held && held !== document.body'), canvas.indexOf("if (readOnlyRef.current) {\n        if (event.key === 'Escape')"));
  assert.match(key, /if \(\(event\.key === 'c' \|\| event\.key === 'C'\)[^\n]*&& !busy\n/, 'C uses the busy test');
  assert.match(key, /if \(pinKeyRef\.current && \['Enter', 'Delete', 'Backspace', 'Escape'\]\.includes\(event\.key\) && !event\.ctrlKey && !event\.metaKey && !event\.altKey && !busy\) \{/, 'a picked pin\'s keys: the same guards');
  assert.match(key, /!event\.ctrlKey && !event\.metaKey && !event\.altKey/, 'Ctrl+C still copies');
  assert.match(key, /presentingRef\.current === null/, 'never while presenting');
  assert.match(key, /isContentEditable \|\| \['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'\]\.includes/, 'never while typing');
  assert.match(key, /held\.closest\?\.\('\[data-block-id\]'\) && !held\.matches\('\[data-block-id\]'\)/, 'never inside a card\'s own editor or widget');
  assert.ok(canvas.indexOf("if ((event.key === 'c' || event.key === 'C')") < canvas.indexOf("if (readOnlyRef.current) {\n        if (event.key === 'Escape')"), 'C works on view-only boards too');
  assert.match(sheet, /\['Comment on the selection \(a card, a shape or a group\)', \['C'\]\]/);
  assert.match(page, /\{comments\.active && <button type="button" data-comments-header/);
  assert.match(header, /\{id === 'comments' && commentsOn && commentsUnread > 0 && <span data-unread-dot/);
});

test('toolbar Comments badge (owner, 2026-10-21): counts the open threads the Comments tab lists, hidden at 0, 99+ past 99; the button toggles the Comments tab', () => {
  assert.equal(openCount([]), 0);
  assert.equal(openCount([{ status: 'open', comments: 2 }, { status: 'resolved', comments: 1 }, { status: 'open', comments: 0 }, { status: 'open' }]), 2, 'resolved and fully deleted threads are not counted');
  assert.equal(openCount([{ status: 'open' }], 31), 31, 'the server count wins over the loaded page');
  assert.equal(openCount([{ status: 'resolved' }], 4), 4, 'a Resolved list keeps the open count');
  assert.equal(badgeText(openCount([], 140)), '99+');
  const panelSource = read('./CommentsPanel.jsx');
  assert.match(panelSource, /onThreads\?\.\(list\.threads, list\.open_count\)/, 'the panel hands up the server count');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
  const page = read('../LearnPage.jsx');
  const button = page.slice(page.indexOf('<button type="button" data-comments-header'), page.indexOf('{/* Progress (Tutor Task 09'));
  assert.match(button, /aria-label=\{\['Comments', comments\.open && `\$\{badgeText\(comments\.open\)\} open`, comments\.unread && `\$\{comments\.unread\} unread`\]\.filter\(Boolean\)\.join\(', '\)\}/, 'Comments, 3 open');
  assert.match(button, /aria-pressed=\{commentsShown\} onClick=\{commentsShown \? \(\) => setPanelOpen\(false\) : openComments\}/, 'the same press again closes, as Progress');
  assert.match(button, /\{comments\.open > 0 && <span data-comments-count aria-hidden/, 'hidden at 0');
  assert.match(page, /const commentsShown = panelOpen && panelTab === 'comments';/);
  assert.doesNotMatch(button, /…/);
});

test('Library: comment news on your canvases\' cards and a Shared with you section; Home is left to its own lane', () => {
  const library = read('../LibraryViews.jsx');
  assert.match(library, /const unread = useCommentUnread\(\);/);
  assert.match(library, /newComments\(ctx\.unread\?\.\[a\.name\]\)/);
  assert.match(library, /\{!type && <SharedWithYou unread=\{unread\.shared\} \/>\}/);
  const unread = read('./unread.js');
  assert.match(unread, /setInterval\(load, 60_000\)/, 'every 60 s');
  assert.match(unread, /if \(document\.visibilityState !== 'visible'\) return;/, 'paused while hidden');
});

test('links, pages and moderation: ?thread= opens a thread, Copy link, Load more, earlier replies, Show comments, Block, Unblock', () => {
  const hook = read('./useCanvasComments.js'), panel = read('./CommentsPanel.jsx'), page = read('../LearnPage.jsx'), shared = read('../SharedBoardPage.jsx'), member = read('./MemberBoardPage.jsx'), settings = read('./CommentSettings.jsx');
  assert.match(hook, /new URLSearchParams\(window\.location\.search\)\.get\('thread'\)/);
  assert.match(hook, /threadLink: link \? id => `\$\{window\.location\.origin\}\$\{link\}\?thread=\$\{id\}` : null/);
  assert.match(page, /link: commentBoard && `\/c\/\$\{commentBoard\}`/, 'members\' links go to /c');
  assert.match(shared, /link: memberBoard \? `\/c\/\$\{memberBoard\}` : `\/e\/\$\{token\}`/, 'public links go to /e, members\' to /c');
  assert.match(member, /window\.location\.replace\(`\/apps\/\$\{read\.body\.canvas\}\$\{window\.location\.search\}`\)/, 'the owner keeps ?thread= on the way home');
  assert.match(page, /label: 'Comments', icon: MessageCircle, toggle: comments\.showPins, onToggle: comments\.setPins/);
  assert.match(panel, /data-more-threads/);
  assert.match(panel, /data-earlier-replies/);
  assert.match(panel, /data-copy-thread-link/);
  assert.match(panel, /\['Block and remove their comments', \(\) => act\(\(\) => client\.block\(message\.id, true\)\)\]/);
  assert.match(settings, /data-unblock onClick=\{\(\) => unblock\(block\.block_id\)\}/);
});

test('an object pin stays at the card top centre at every zoom (owner, 2026-10-21)', () => {
  const card = { x: 120, y: 80, w: 300, h: 180 };
  const SIZE = 30, GAP = 4;
  for (const view of [{ x: 0, y: 0, z: 0.2 }, { x: 37, y: -12, z: 1 }, { x: -250, y: 90, z: 2 }]) {
    const box = { left: card.x * view.z + view.x, top: card.y * view.z + view.y, right: (card.x + card.w) * view.z + view.x, bottom: (card.y + card.h) * view.z + view.y };
    const at = pinTopCentre(box, 0, SIZE, GAP);
    assert.equal(at.left + SIZE / 2, (card.x + card.w / 2) * view.z + view.x, `centre x at z=${view.z}`);
    assert.equal(at.top + SIZE / 2, card.y * view.z + view.y, `centre y at z=${view.z}`);
  }
  assert.equal(pinTopCentre({ left: 0, top: 0, right: 100, bottom: 50 }, 1, SIZE, GAP).left, 50 - SIZE / 2 + SIZE + GAP, 'a second pin lines up to the right');
  // A 160 px note at 25% is 40 px wide: its second pin still touches it (comments-check 26 at 25%, gate 39739753118).
  const note = { left: 0, top: 0, right: 40, bottom: 40 };
  for (const index of [0, 1, 2]) assert.ok(note.right - pinTopCentre(note, index, SIZE, GAP).left >= CONTACT, `pin ${index} overlaps the narrow note`);
  assert.equal(pinTopCentre(note, 0, SIZE, GAP).left, 5, 'the first pin stays centred');
  // The pin covers the card's top port, so that port steps aside while the card has a pin (selected-pill-check, gate 39739753118).
  const canvas = read('../AdaptiveCanvas.jsx');
  assert.ok(canvas.includes(`['top', 'bottom'].filter(side => side !== 'top' || !edit.hasPin?.(id)).map(side => <button key={side} type="button" data-port={side}`), 'a card hides its top port under a pin');
  assert.ok(canvas.includes(`SIDES.filter(side => side !== 'top' || !canvasEdit.hasPin?.(shape.id)).map(`), 'a shape hides its top port under a pin');
  assert.ok(canvas.includes('<CanvasEdit.Provider value={{ locked: lockedIds, altDrag, readOnly, hasPin,'), 'the canvas shares which objects have pins');
});
