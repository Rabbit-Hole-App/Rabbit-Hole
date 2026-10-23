import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasOwnsWheel, clampHeight, embedFetch, embedHref, embedRoute, embedSnippet, embedTarget, emailSnippet, fullHref, receiveHandoff, serveHandoff, sharedRole, startEmbedSession, thumbnailUrl } from './embed-api.js';
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
  assert.equal(fullHref(ORIGIN, 'e', TOKEN, 'fork'), `${ORIGIN}/e/${TOKEN}?from=embed&fork=1`, 'a flag only, never the visitor\'s text');
  assert.equal(thumbnailUrl(ORIGIN, 'b', TOKEN), `${ORIGIN}/api/learn/boards/shared/${TOKEN}/thumbnail`);
  assert.equal(thumbnailUrl(ORIGIN, 'e', TOKEN), `${ORIGIN}/api/learn/boards/published/${TOKEN}/thumbnail`);
});

test('Embed is offered only for a public canvas: a public view link first, else the publication', () => {
  assert.deepEqual(embedTarget({ shared: true, view: 'v', public_view: true, published: true, publication: 'p' }), { kind: 'b', token: 'v' });
  assert.deepEqual(embedTarget({ shared: true, view: 'v', public_view: false, published: true, publication: 'p' }), { kind: 'e', token: 'p' });
  assert.deepEqual(embedTarget({ shared: false, view: 'v', public_view: true, published: true, publication: 'p' }), { kind: 'e', token: 'p' });
  assert.equal(embedTarget({ shared: true, view: 'v', public_view: false }), null, 'a link that needs sign-in is not embeddable');
  assert.equal(embedTarget({ shared: false }), null);
  assert.equal(embedTarget(null), null);
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

// Two windows that share one origin: the embed (iframe) and the full site's new tab.
function windows() {
  const listeners = { embed: [], full: [] };
  const make = name => ({ location: { origin: ORIGIN }, addEventListener: (type, fn) => listeners[name].push(fn), removeEventListener: (type, fn) => listeners[name].splice(listeners[name].indexOf(fn), 1) });
  const embed = make('embed'), full = make('full');
  const to = name => ({ postMessage: (data, origin) => { assert.equal(origin, ORIGIN, 'only the own origin'); listeners[name].forEach(fn => fn({ data, origin: ORIGIN, source: name === 'embed' ? full : embed })); } });
  embed.opener = null; full.opener = to('embed');
  Object.assign(embed, { postMessage: to('embed').postMessage }); Object.assign(full, { postMessage: to('full').postMessage });
  return { embed, full, listeners };
}

test('hand-off: the new tab gets the local copy and the unsent draft from its opener, never through the URL', async () => {
  const { embed, full } = windows();
  const stop = serveHandoff(embed, TOKEN, () => ({ draft: { base_version: 4, state: { blocks: [{ id: 'mine' }] } }, chatDraft: 'Why is the sky blue', target: { id: 'c1', kind: 'quiz', title: 'Q' } }));
  const storage = memory();
  assert.equal(await receiveHandoff(full, TOKEN, storage), true);
  assert.deepEqual(loadGuestDraft(() => storage, TOKEN), { base_version: 4, state: { blocks: [{ id: 'mine' }] }, edited_at: loadGuestDraft(() => storage, TOKEN).edited_at });
  assert.equal(takeDraft(TOKEN, storage), 'Why is the sky blue', 'restored into the composer by the existing ?ask=1 path, unsent');
  assert.equal(takeTarget(TOKEN, storage).id, 'c1');
  stop();
});

test('hand-off: another link\'s request, no opener, and silence all end without storing anything', async () => {
  const { embed, full } = windows();
  const stop = serveHandoff(embed, TOKEN, () => ({ draft: { base_version: 1, state: {} }, chatDraft: 'x' }));
  const storage = memory();
  assert.equal(await receiveHandoff(full, 'other-token-other-token-0000', storage, 20), false);
  assert.equal(storage.map.size, 0);
  assert.equal(await receiveHandoff({ ...embed, opener: null }, TOKEN, storage), false);
  stop();
  assert.equal(await receiveHandoff(full, TOKEN, storage, 20), false, 'the embed is gone: the page opens without it');
  assert.equal(storage.map.size, 0);
});

test('copy rules: no ellipsis in the embed surfaces; Open in Rabbit Hole and the Embed controls are present', () => {
  const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const panel = read('./SharePanel.jsx'), chat = read('./SharedChat.jsx'), page = read('./SharedBoardPage.jsx');
  const embedPanel = panel.slice(panel.indexOf('function CopyField('), panel.indexOf('// onPublish(publish)'));
  const spread = /\.\.\.(?=[\w({[])/g;
  for (const text of [read('./embed-api.js'), embedPanel, chat.slice(chat.indexOf('embed (SHARE-04')), page.slice(page.indexOf('if (embed) {'))]) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, '').replace(spread, ''), /\.\.\.|…/);
  for (const attribute of ['data-embed-section', 'data-embed-height', 'data-embed-show-chat', 'data-embed-copy', 'data-embed-code', 'data-embed-preview', 'data-embed-email-image']) assert.ok(panel.includes(attribute), attribute);
  for (const attribute of ['data-embed-root', 'data-embed-title', 'data-embed-open', 'data-embed-fork', 'data-embed-chat-button']) assert.ok(page.includes(attribute), attribute);
  assert.ok(chat.includes('data-embed-chat-fallback') && chat.includes('Open Chat in Rabbit Hole'));
  assert.match(panel, /loading="lazy"/, 'the preview iframe is lazy');
  assert.match(page, /\{embed\.chat && <button type="button" data-embed-chat-button/, 'no Chat entry point unless ?chat=1');
});
