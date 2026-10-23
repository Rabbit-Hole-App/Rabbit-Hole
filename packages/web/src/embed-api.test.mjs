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
  assert.equal(await receiveHandoff(tab, TOKEN, storage), true);
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
  assert.equal(await receiveHandoff(tab, TOKEN, again, 30), false);
  assert.equal(again.map.size, 0);
  host.stop();
});

test('hand-off is short lived: an offer that expired is not answered', async () => {
  const { embed, tab } = windows();
  const host = handoffHost(embed, TOKEN, { ttl: 10 });
  host.start(tab, payload);
  await new Promise(done => setTimeout(done, 40));
  const storage = memory();
  assert.equal(await receiveHandoff(tab, TOKEN, storage, 30), false);
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
  assert.equal(await receiveHandoff(tab, TOKEN, memory()), true);
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
  assert.equal(await receiveHandoff(tab, 'other-token-other-token-0000', storage, 20), false, 'another link');
  assert.equal(storage.map.size, 0);
  host.stop();
  assert.equal(await receiveHandoff(tab, TOKEN, storage, 20), false, 'stopped');
  assert.equal(storage.map.size, 0);
});

test('hand-off: the full page ignores a reply that is not from its opener and a message from another origin', async () => {
  const { embed, tab, stranger, listeners } = windows();
  const storage = memory();
  const waiting = receiveHandoff(tab, TOKEN, storage, 60);
  const reply = { type: 'rh-embed-handoff', token: TOKEN, ...payload };
  listeners.get(tab).forEach(fn => fn({ data: reply, origin: ORIGIN, source: stranger }));
  listeners.get(tab).forEach(fn => fn({ data: reply, origin: 'https://evil.example', source: embed }));
  assert.equal(await waiting, false);
  assert.equal(storage.map.size, 0);
});

test('hand-off: no opener means nothing to wait for', async () => {
  const { tab } = windows();
  tab.opener = null;
  assert.equal(await receiveHandoff(tab, TOKEN, memory()), false);
});

test('copy rules: no ellipsis in the embed surfaces; Open in Rabbit Hole and the Embed controls are present', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const panel = read('./EmbedPanel.jsx'), share = read('./SharePanel.jsx'), chat = read('./SharedChat.jsx'), page = read('./SharedBoardPage.jsx');
  const spread = /\.\.\.(?=[\w({[])/g;
  for (const text of [read('./embed-api.js'), panel, share.slice(share.indexOf('function EmbedRow('), share.indexOf('// onPublish(publish)')), chat.slice(chat.indexOf('embed (SHARE-04')), page.slice(page.indexOf('if (embed) {'))]) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, '').replace(spread, ''), /\.\.\.|…/);
  for (const attribute of ['data-embed-section', 'data-embed-source', 'data-embed-height', 'data-embed-show-chat', 'data-embed-copy', 'data-embed-code', 'data-embed-preview', 'data-embed-email-image', 'data-embed-change-access']) assert.ok(panel.includes(attribute), attribute);
  for (const attribute of ['data-embed-root', 'data-embed-title', 'data-embed-open', 'data-embed-fork', 'data-embed-chat-button']) assert.ok(page.includes(attribute), attribute);
  assert.ok(chat.includes('data-embed-chat-fallback') && chat.includes('Open Chat in Rabbit Hole'));
  assert.match(panel, /loading="lazy"/, 'the preview iframe is lazy');
  assert.match(panel, /Sending an email newsletter\?/);
  assert.match(panel, /View embed code/);
  assert.equal((share.match(/<EmbedPanel /g) || []).length, 1, 'the Share panel mounts the standalone panel once');
  assert.match(page, /\{embed\.chat && <button type="button" data-embed-chat-button/, 'no Chat entry point unless ?chat=1');
});
