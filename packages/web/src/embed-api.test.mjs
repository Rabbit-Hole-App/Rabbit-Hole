import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasOwnsWheel, clampHeight, leftoverZoom, focusAfter, clampWidth, embedFetch, embedHref, embedRoute, embedSnippet, embedSources, emailSnippet, linkSnippet, fullHref, handoffHost, receiveHandoff, sharedRole, startEmbedSession, thumbnailUrl } from './embed-api.js';
import { loadGuestDraft } from './guest-draft.js';
import { takeDraft, takeTarget } from './shared-ask.js';

// SHARE-04: embedding a public canvas (C:/s/spec/embed/contract.md). The pure parts; the browser behavior is CI's.
const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const ORIGIN = 'https://rabbit.example';
const memory = () => { const map = new Map(); return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };

test('embed routes: /embed/b and /embed/e only, chat only for ?chat=1, theme only light or dark', () => {
  assert.deepEqual(embedRoute(`/embed/b/${TOKEN}`, ''), { kind: 'b', token: TOKEN, chat: false, theme: null });
  assert.deepEqual(embedRoute(`/embed/e/${TOKEN}`, '?chat=1&theme=dark'), { kind: 'e', token: TOKEN, chat: true, theme: 'dark' });
  assert.equal(embedRoute(`/embed/b/${TOKEN}`, '?chat=true&theme=sepia').chat, false);
  assert.equal(embedRoute(`/embed/b/${TOKEN}`, '?chat=true&theme=sepia').theme, null);
  for (const path of [`/b/${TOKEN}`, `/e/${TOKEN}`, `/embed/x/${TOKEN}`, '/embed/b/short', `/embed/b/${TOKEN}/more`, `/embed/${TOKEN}`]) assert.equal(embedRoute(path, ''), null, path);
});

test('url builders: the embed page, the full page and the thumbnail per link type', () => {
  assert.equal(embedHref(ORIGIN, 'b', TOKEN), `${ORIGIN}/embed/b/${TOKEN}`);
  assert.equal(embedHref(ORIGIN, 'e', TOKEN, { chat: true }), `${ORIGIN}/embed/e/${TOKEN}?chat=1`);
  assert.equal(embedHref(ORIGIN, 'b', TOKEN, { chat: true, theme: 'light' }), `${ORIGIN}/embed/b/${TOKEN}?chat=1&theme=light`);
  assert.equal(fullHref(ORIGIN, 'b', TOKEN), `${ORIGIN}/b/${TOKEN}`);
  assert.equal(fullHref(ORIGIN, 'e', TOKEN, { intent: 'fork', handoff: true }), `${ORIGIN}/e/${TOKEN}?from=embed&fork=1`, 'flags only, never the visitor\'s text');
  assert.equal(fullHref(ORIGIN, 'b', TOKEN, { intent: 'fork' }), `${ORIGIN}/b/${TOKEN}?fork=1`, 'Fork original: no hand-off asked');
  assert.equal(thumbnailUrl(ORIGIN, 'b', TOKEN), `${ORIGIN}/api/learn/boards/shared/${TOKEN}/thumbnail`);
  assert.equal(thumbnailUrl(ORIGIN, 'e', TOKEN), `${ORIGIN}/api/learn/boards/published/${TOKEN}/thumbnail`);
});

test('Embed sources: a public view link and an Explore publication, available only when public', () => {
  const find = (sharing, kind) => embedSources(sharing, ORIGIN).find(source => source.kind === kind);
  const both = { shared: true, view: 'v', public_view: true, published: true, publication: 'p' };
  assert.deepEqual([find(both, 'shared').available, find(both, 'explore').available], [true, true]);
  assert.equal(find(both, 'shared').url, `${ORIGIN}/b/v`);
  assert.equal(find(both, 'explore').url, `${ORIGIN}/e/p`);
  assert.deepEqual([find({ ...both, public_view: false }, 'shared').available, find({ ...both, public_view: false }, 'explore').available], [false, true], 'a link that needs sign-in is not embeddable');
  assert.equal(find({ ...both, shared: false }, 'shared').available, false);
  assert.equal(find({ ...both, published: false }, 'explore').available, false);
  assert.deepEqual(embedSources(null, ORIGIN).map(source => source.available), [false, false]);
});

test('the embed snippet: lazy, titled, full width, the chosen height, no allow list, escaped', () => {
  const snippet = embedSnippet({ src: `${ORIGIN}/embed/b/${TOKEN}?chat=1&theme=dark`, title: 'Quotes "A" <b> & more', height: 640 });
  assert.match(snippet, /^<iframe src="[^"]+"/);
  assert.match(snippet, /loading="lazy"/);
  assert.match(snippet, /width="100%"/);
  assert.match(snippet, /height="640"/);
  assert.match(snippet, /title="Quotes &quot;A&quot; &lt;b&gt; &amp; more"/);
  assert.match(snippet, /chat=1&amp;theme=dark/);
  assert.doesNotMatch(snippet, /\sallow=|allowfullscreen|sandbox/);
  assert.match(embedSnippet({ src: 'x', title: '', height: 500 }), /title="Rabbit Hole canvas"/);
  assert.match(embedSnippet({ src: 'x', title: 't', height: 500, width: 640 }), /width="640"/, 'a pixel width when chosen');
  assert.equal(clampWidth(50), 200);
  assert.equal(clampWidth(99999), 2000);
  assert.equal(linkSnippet({ href: `${ORIGIN}/b/${TOKEN}`, title: 'A & B' }), `<a href="${ORIGIN}/b/${TOKEN}">A &amp; B</a>`);
});

test('height is a whole number of pixels between 200 and 2000, else the default', () => {
  assert.equal(clampHeight('640'), 640);
  assert.equal(clampHeight(12), 200);
  assert.equal(clampHeight(99999), 2000);
  assert.equal(clampHeight(''), 200, 'an empty field is zero, raised to the minimum');
  assert.equal(clampHeight('abc'), 520);
});

test('the email block links the preview image to the canvas', () => {
  const html = emailSnippet({ href: `${ORIGIN}/b/${TOKEN}`, image: thumbnailUrl(ORIGIN, 'b', TOKEN), title: 'Intro' });
  assert.match(html, new RegExp(`^<a href="${ORIGIN}/b/${TOKEN}"><img src="${ORIGIN}/api/learn/boards/shared/${TOKEN}/thumbnail" alt="Intro"`));
  assert.doesNotMatch(html, /iframe/);
});

test('permission mapping: an embed viewer is a public guest whatever the account says', () => {
  assert.equal(sharedRole({ embed: true, access: { role: 'owner' }, viewer: 'owner@example.com' }), 'guest');
  assert.equal(sharedRole({ embed: true, access: { role: 'editor' }, viewer: 'x' }), 'guest');
  assert.equal(sharedRole({ embed: true }), 'guest');
  // The ordinary /b and /e pages keep the server's role.
  assert.equal(sharedRole({ embed: false, access: { role: 'owner' }, viewer: 'x' }), 'owner');
  assert.equal(sharedRole({ embed: false, viewer: 'x' }), 'viewer');
  assert.equal(sharedRole({ embed: false }), 'guest');
});

test('wheel: a plain wheel belongs to the article; ctrl/cmd+wheel zooms only a focused canvas', () => {
  assert.equal(canvasOwnsWheel({ ctrlKey: false, metaKey: false }, true), false);
  assert.equal(canvasOwnsWheel({ ctrlKey: true }, false), false, 'unfocused: the canvas never zooms with the page');
  assert.equal(canvasOwnsWheel({ ctrlKey: true }, true), true);
  assert.equal(canvasOwnsWheel({ metaKey: true }, true), true);
});

test('canvas focus survives the focusout a press causes, and ends only when the frame loses focus or a press lands outside', () => {
  let focused = focusAfter(false, 'pointerdown', true);
  assert.equal(focused, true, 'a press on the canvas focuses it');
  focused = focusAfter(focused, 'focusout', false); // the browser moves focus off the previous control right after the press
  assert.equal(focused, true, 'focusout changes nothing (it cleared focus before and the ctrl+wheel went to the host page)');
  assert.equal(focusAfter(focused, 'pointerdown', false), false, 'a press on the header or Chat panel');
  assert.equal(focusAfter(focused, 'blur', false), false, 'the frame lost the window focus');
  assert.equal(focusAfter(false, 'focusin', true), true, 'keyboard focus into the canvas');
  assert.equal(focusAfter(true, 'focusin', false), true);
  assert.equal(canvasOwnsWheel({ ctrlKey: true }, focused), true);
});

test('a focused ctrl/cmd+wheel nobody took never scrolls the host page: cancelled, and replayed on the surface from a floating control', () => {
  const zoom = { ctrlKey: true, defaultPrevented: false };
  assert.deepEqual(leftoverZoom(zoom, true, true), { prevent: true, forward: false }, 'on the surface the canvas should have taken it: just keep the page still');
  assert.deepEqual(leftoverZoom(zoom, true, false), { prevent: true, forward: true }, 'over the left stack or a pill outside the surface');
  assert.deepEqual(leftoverZoom({ ...zoom, defaultPrevented: true }, true, false), { prevent: false, forward: false }, 'already taken');
  assert.deepEqual(leftoverZoom(zoom, false, false), { prevent: false, forward: false }, 'unfocused: the browser alone');
  assert.deepEqual(leftoverZoom({ ctrlKey: false, metaKey: false }, true, false), { prevent: false, forward: false }, 'a plain wheel is the article\'s');
});

test('every same-origin API request of an embed carries X-RH-Embed; nothing else is touched', async () => {
  const seen = [];
  const fetcher = embedFetch((input, init) => { seen.push({ input, init }); return Promise.resolve(); }, ORIGIN);
  await fetcher('/api/learn/boards/shared/t', { headers: { 'Content-Type': 'application/json' } });
  await fetcher(`${ORIGIN}/api/learn/boards/shared/t/ask`, { method: 'POST' });
  await fetcher('/assets/index.js');
  await fetcher('https://other.example/api/x');
  assert.equal(new Headers(seen[0].init.headers).get('X-RH-Embed'), '1');
  assert.equal(new Headers(seen[0].init.headers).get('Content-Type'), 'application/json', 'existing headers kept');
  assert.equal(new Headers(seen[1].init.headers).get('X-RH-Embed'), '1');
  assert.equal(seen[1].init.method, 'POST');
  assert.equal(seen[2].init.headers, undefined);
  assert.equal(seen[3].init.headers, undefined);
});

test('guest session: init, then a probe; Send is enabled only when the probe says the cookie came back', async () => {
  const calls = [];
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const run = (initStatus, probeBody, probeStatus = 200) => startEmbedSession(TOKEN, async (url, init = {}) => {
    calls.push([init.method || 'GET', url]);
    return url.endsWith('/embed-session') ? reply(initStatus, { created: true }) : reply(probeStatus, probeBody);
  });
  assert.deepEqual(await run(200, { guest: { limit: 10, used: 3, remaining: 7 }, embed: { session: true } }), { session: true, guest: { limit: 10, used: 3, remaining: 7 } });
  assert.deepEqual(calls.slice(0, 2), [['POST', '/api/learn/boards/embed-session'], ['GET', `/api/learn/boards/shared/${TOKEN}/ask`]], 'init first, the probe after it');
  assert.deepEqual(await run(200, { guest: null, embed: { session: false } }), { session: false, guest: null }, 'no cookie back: Open Chat in Rabbit Hole');
  assert.deepEqual(await run(500, {}), { session: false, guest: null });
  assert.deepEqual(await run(200, {}, 403), { session: false, guest: null }, 'a link that is not public');
  assert.deepEqual(await startEmbedSession(TOKEN, async () => { throw new Error('offline'); }), { session: false, guest: null });
});

// Windows on one origin: the embed (an iframe) and the tab it opened. postMessage on a window delivers to that window's listeners,
// from the other one; `stranger` is a third window (another frame of the host page) with its own listeners.
function windows() {
  const listeners = new Map();
  const make = () => { const win = { location: { origin: ORIGIN }, opener: null, addEventListener: (type, fn) => listeners.get(win).push(fn), removeEventListener: (type, fn) => listeners.get(win).splice(listeners.get(win).indexOf(fn), 1) }; listeners.set(win, []); return win; };
  const embed = make(), tab = make(), stranger = make();
  const deliver = (from, to) => (data, origin) => { assert.equal(origin, ORIGIN, 'only the own origin'); listeners.get(to).forEach(fn => fn({ data, origin: ORIGIN, source: from })); };
  tab.opener = embed; embed.postMessage = deliver(tab, embed); tab.postMessage = deliver(embed, tab);
  embed.sent = []; // what reaches the tab
  stranger.postMessage = deliver(embed, stranger);
  return { embed, tab, stranger, listeners };
}
const payload = { draft: { base_version: 4, state: { blocks: [{ id: 'mine' }] } }, chatDraft: 'Why is the sky blue', target: { id: 'c1', kind: 'quiz', title: 'Q' } };

test('hand-off: the tab gets the local copy and the unsent draft from its opener and acknowledges; the embed then lets go', async () => {
  const { embed, tab } = windows();
  const host = handoffHost(embed, TOKEN);
  const storage = memory();
  let done = 0, failed = 0;
  host.start(tab, payload, { onDone: () => { done += 1; }, onFail: () => { failed += 1; } });
  assert.deepEqual(await receiveHandoff(tab, TOKEN, storage), { ok: true });
  const kept = loadGuestDraft(() => storage, TOKEN);
  assert.deepEqual([kept.base_version, kept.state], [4, { blocks: [{ id: 'mine' }] }]);
  assert.equal(takeDraft(TOKEN, storage), 'Why is the sky blue', 'restored into the composer by the existing ?ask=1 path, unsent');
  assert.equal(takeTarget(TOKEN, storage).id, 'c1', 'the card the question was about comes along');
  assert.equal(done, 1);
  assert.equal(failed, 0);
  host.stop();
});

test('hand-off is single use: after the acknowledgement the embed answers nobody', async () => {
  const { embed, tab } = windows();
  const host = handoffHost(embed, TOKEN);
  host.start(tab, payload);
  await receiveHandoff(tab, TOKEN, memory());
  const again = memory();
  assert.deepEqual(await receiveHandoff(tab, TOKEN, again, 30), { ok: false, reason: 'unanswered' });
  assert.equal(again.map.size, 0);
  host.stop();
});

test('hand-off is short lived: an offer that expired is not answered', async () => {
  const { embed, tab } = windows();
  const host = handoffHost(embed, TOKEN, { ttl: 10 });
  host.start(tab, payload);
  await new Promise(done => setTimeout(done, 40));
  const storage = memory();
  assert.deepEqual(await receiveHandoff(tab, TOKEN, storage, 30), { ok: false, reason: 'unanswered' });
  assert.equal(storage.map.size, 0);
  host.stop();
});

test('hand-off: no acknowledgement reports the failure and keeps the offer open for a retry; a late one still completes', async () => {
  const { embed, tab } = windows();
  const host = handoffHost(embed, TOKEN, { wait: 10 });
  const events = [];
  host.start(tab, payload, { onFail: () => events.push('fail'), onDone: () => events.push('done') });
  await new Promise(done => setTimeout(done, 40));
  assert.deepEqual(events, ['fail']);
  assert.deepEqual(await receiveHandoff(tab, TOKEN, memory()), { ok: true });
  assert.deepEqual(events, ['fail', 'done']);
  host.stop();
});

test('hand-off: a wrong window, a wrong origin, a wrong link and a stop are ignored', async () => {
  const { embed, tab, stranger, listeners } = windows();
  const host = handoffHost(embed, TOKEN);
  host.start(tab, payload);
  const heard = [];
  stranger.addEventListener('message', event => heard.push(event.data));
  const ask = (source, origin) => listeners.get(embed).forEach(fn => fn({ data: { type: 'rh-embed-handoff-request', token: TOKEN }, origin, source }));
  ask(stranger, ORIGIN); // another frame of the host page
  ask(tab, 'https://evil.example'); // right window, wrong origin
  assert.deepEqual(heard, [], 'another window gets nothing');
  const storage = memory();
  assert.deepEqual(await receiveHandoff(tab, 'other-token-other-token-0000', storage, 20), { ok: false, reason: 'unanswered' }, 'another link');
  assert.equal(storage.map.size, 0);
  host.stop();
  assert.deepEqual(await receiveHandoff(tab, TOKEN, storage, 20), { ok: false, reason: 'unanswered' }, 'stopped');
  assert.equal(storage.map.size, 0);
});

test('hand-off: the full page ignores a reply that is not from its opener and a message from another origin', async () => {
  const { embed, tab, stranger, listeners } = windows();
  const storage = memory();
  const waiting = receiveHandoff(tab, TOKEN, storage, 60);
  const reply = { type: 'rh-embed-handoff', token: TOKEN, ...payload };
  listeners.get(tab).forEach(fn => fn({ data: reply, origin: ORIGIN, source: stranger }));
  listeners.get(tab).forEach(fn => fn({ data: reply, origin: 'https://evil.example', source: embed }));
  assert.deepEqual(await waiting, { ok: false, reason: 'unanswered' });
  assert.equal(storage.map.size, 0);
});

test('hand-off: no opener means nothing to wait for', async () => {
  const { tab } = windows();
  tab.opener = null;
  assert.deepEqual(await receiveHandoff(tab, TOKEN, memory()), { ok: false, reason: 'unanswered' });
});

// Owner finding 2026-10-23: the full page acknowledged a hand-off whose storage writes failed, so the embed let go and the tab went
// on (to an automatic Fork of the original) with nothing of the visitor's. The tab acknowledges only once every key is stored and
// read back; otherwise it rolls back what it wrote and answers with a refusal, and the embed keeps its copy and offers Retry.
const ID = 'handoff-0001-abcdefgh';
const FORK_KEY = `rh.fork-key:${TOKEN}`;
const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
const counted = () => { const s = memory(), set = s.setItem; s.writes = 0; s.setItem = (key, value) => { s.writes += 1; set(key, value); }; return s; };
// Every access refused (third-party storage blocked): SecurityError on each call.
const blockedStore = () => { const deny = () => { throw Object.assign(new Error('Access is denied for this document.'), { name: 'SecurityError' }); }; return { map: new Map(), getItem: deny, setItem: deny, removeItem: deny }; };
// Room for `room` writes, then every write is QuotaExceededError (0: full; above 0: some keys write and later ones throw).
const limited = room => { const s = memory(), set = s.setItem; s.setItem = (key, value) => { if (room <= 0) throw quota(); room -= 1; set(key, value); }; return s; };
// The named keys refuse their write; the others store (partially writable).
const refusing = test => { const s = memory(), set = s.setItem; s.setItem = (key, value) => { if (test(key)) throw quota(); set(key, value); }; return s; };
async function handOff(storage, { tabs = windows(), id = ID, wait = 5000 } = {}) {
  const host = handoffHost(tabs.embed, TOKEN, { wait });
  const events = [];
  host.start(tabs.tab, { ...payload, id }, { onDone: () => events.push('done'), onFail: reason => events.push(`fail:${reason || 'unanswered'}`) });
  const result = await receiveHandoff(tabs.tab, TOKEN, storage, 200);
  return { result, events, host, tabs };
}
const keepsNothing = (storage, label) => assert.deepEqual([...storage.map.keys()], [], `${label}: no half-state survives`);

test('hand-off, healthy storage: edits, Chat draft, card and the fork key all arrive; then, and only then, the embed hears the acknowledgement', async () => {
  const storage = memory();
  const { result, events, host } = await handOff(storage);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, ['done']);
  assert.deepEqual(loadGuestDraft(() => storage, TOKEN).state, payload.draft.state);
  assert.equal(takeDraft(TOKEN, storage), payload.chatDraft);
  assert.equal(takeTarget(TOKEN, storage).id, 'c1');
  assert.equal(storage.getItem(FORK_KEY), ID, 'the fork this tab makes carries the hand-off id as its key');
  host.stop();
});

for (const [mode, make] of [['blocked (SecurityError on every call)', blockedStore], ['full (QuotaExceededError on the first write)', () => limited(0)], ['null (the storage accessor threw)', () => null],
  ['writes that silently drop', () => ({ ...memory(), setItem: () => {} })]]) {
  test(`hand-off, ${mode}: no acknowledgement, a refusal with its reason at once; the tab reports the failure`, async () => {
    const storage = make();
    const { result, events, host } = await handOff(storage);
    assert.deepEqual(result, { ok: false, reason: 'storage' });
    assert.deepEqual(events, ['fail:storage'], 'the embed keeps its copy and offers Retry without waiting for the timeout');
    if (storage?.map && mode !== 'blocked (SecurityError on every call)') keepsNothing(storage, mode);
    host.stop();
  });
}

test('hand-off, partially writable storage: whichever key throws, what was written is rolled back and nothing is acknowledged', async () => {
  for (let room = 1; room <= 4; room++) {
    const storage = limited(room);
    const { result, events, host } = await handOff(storage);
    assert.deepEqual(result, { ok: false, reason: 'storage' }, `room for ${room}`);
    assert.deepEqual(events, ['fail:storage'], `room for ${room}`);
    keepsNothing(storage, `room for ${room}`);
    host.stop();
  }
  // The edits store, the Chat draft and the card do not (the owner's case): a value this tab held before comes back as it was.
  const storage = refusing(key => key.startsWith('small.shared-ask'));
  storage.map.set(`rh.guest-draft:${TOKEN}`, '{"base_version":1,"state":{"blocks":[]}}');
  const { result, host } = await handOff(storage);
  assert.equal(result.ok, false);
  assert.deepEqual([...storage.map.entries()], [[`rh.guest-draft:${TOKEN}`, '{"base_version":1,"state":{"blocks":[]}}']], 'the earlier value is restored, nothing of the hand-off remains');
  host.stop();
});

test('hand-off retry after a refusal: the offer stays open, the second attempt stores everything once and is acknowledged once', async () => {
  const tabs = windows();
  const first = await handOff(limited(1), { tabs });
  assert.deepEqual(first.result, { ok: false, reason: 'storage' });
  const storage = counted();
  assert.deepEqual(await receiveHandoff(tabs.tab, TOKEN, storage, 200), { ok: true }, 'Retry in the tab asks the embed again and gets the same offer');
  assert.deepEqual(first.events, ['fail:storage', 'done']);
  assert.equal(storage.getItem(FORK_KEY), ID);
  first.host.stop();
});

test('hand-off idempotence: the same hand-off delivered twice writes once; a used draft is never written back; retried tabs share one fork key', async () => {
  const tabs = windows();
  const storage = counted();
  const { result, host } = await handOff(storage, { tabs });
  assert.deepEqual(result, { ok: true });
  const writes = storage.writes;
  assert.equal(takeDraft(TOKEN, storage), payload.chatDraft); // the composer took it
  host.start(tabs.tab, { ...payload, id: ID }); // the embed offers the same hand-off to this tab again (its Retry after a late reply)
  const acks = [];
  tabs.embed.postMessage = (deliver => message => { if (message.type === 'rh-embed-handoff-ack') acks.push(message.id); deliver(message, ORIGIN); })(tabs.embed.postMessage);
  assert.deepEqual(await receiveHandoff(tabs.tab, TOKEN, storage, 200), { ok: true });
  assert.equal(storage.writes, writes, 'nothing written the second time');
  assert.equal(takeDraft(TOKEN, storage), '', 'the draft the composer took is not written back');
  assert.deepEqual(acks, [ID]);
  host.stop();
  // Retry from the embed opens another tab with the same hand-off id: both tabs would fork with the same key, so the server
  // (canvas_forks owner_email + fork_key) makes one fork.
  const other = memory();
  const again = await handOff(other, { id: ID });
  assert.deepEqual(again.result, { ok: true });
  assert.equal(other.getItem(FORK_KEY), storage.getItem(FORK_KEY));
  again.host.stop();
});

test('hand-off, sign-in continuation: what the tab stored is what it reads back after the sign-in redirect; unanswered and no opener fail visibly', async () => {
  const storage = memory();
  const { host } = await handOff(storage);
  host.stop();
  // The redirect to sign-in and back is a new page load in the same tab: the stored hand-off is all there.
  assert.deepEqual(loadGuestDraft(() => storage, TOKEN).state, payload.draft.state);
  assert.equal(takeTarget(TOKEN, storage).id, 'c1');
  assert.equal(storage.getItem(FORK_KEY), ID, 'the Fork that runs after sign-in uses the hand-off key');
  const quiet = windows();
  assert.deepEqual(await receiveHandoff(quiet.tab, TOKEN, memory(), 20), { ok: false, reason: 'unanswered' }, 'the embed never answered');
  quiet.tab.opener = null;
  assert.deepEqual(await receiveHandoff(quiet.tab, TOKEN, memory(), 20), { ok: false, reason: 'unanswered' }, 'no opener to ask');
});

test('copy rules: no ellipsis in the embed surfaces; Open in Rabbit Hole and the Embed controls are present', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const panel = read('./EmbedPanel.jsx'), share = read('./SharePanel.jsx'), chat = read('./SharedChat.jsx'), page = read('./SharedBoardPage.jsx'), loading = read('./CanvasLoading.jsx');
  const spread = /\.\.\.(?=[\w({[])/g;
  for (const text of [read('./embed-api.js'), panel, share.slice(share.indexOf('function EmbedRow('), share.indexOf('// onPublish(publish)')), chat.slice(chat.indexOf('embed (SHARE-04')), page.slice(page.indexOf('if (embed) {')), loading]) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, '').replace(spread, ''), /\.\.\.|…/);
  for (const attribute of ['data-embed-section', 'data-embed-source', 'data-embed-height', 'data-embed-show-chat', 'data-embed-copy', 'data-embed-code', 'data-embed-preview', 'data-embed-email-image', 'data-embed-change-access']) assert.ok(panel.includes(attribute), attribute);
  for (const attribute of ['data-embed-root', 'data-embed-title', 'data-embed-fork', 'data-embed-chat-button']) assert.ok(page.includes(attribute), attribute);
  // Open in Rabbit Hole is EmbedOpenLink (CanvasLoading.jsx), the same link in the loaded embed and its loading shell (owner brief 2026-10-23).
  assert.ok(page.includes('const openLink = openHref && <EmbedOpenLink href={openHref} />;') && loading.includes('<a data-embed-open href={href}') && loading.includes('>Open in Rabbit Hole<'), 'data-embed-open');
  assert.ok(chat.includes('data-embed-chat-fallback') && chat.includes('Open Chat in Rabbit Hole'));
  assert.match(panel, /loading="lazy"/, 'the preview iframe is lazy');
  assert.match(panel, /Sending an email newsletter\?/);
  assert.match(panel, /View embed code/);
  assert.equal((share.match(/<EmbedPanel /g) || []).length, 1, 'the Share panel mounts the standalone panel once');
  assert.match(page, /\{embed\.chat && <button type="button" data-embed-chat-button/, 'no Chat entry point unless ?chat=1');
});
