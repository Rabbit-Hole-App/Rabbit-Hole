// SHARE-04: embedding a public canvas in a website (C:/s/spec/embed/contract.md; server note guest-session-note.md).
// Everything the web side needs to know about the embed surface lives here, so a server rename is a change to this one file:
// the route, the publisher's snippet, the public-viewer rule, the partitioned guest session and the hand-off to the full site.
import { askPath, signInForAsk } from './shared-ask.js';
import { saveGuestDraft } from './guest-draft.js';

// /embed/b/<view token> (a public view link) and /embed/e/<token> (an Explore publication): the only pages a site may frame.
const EMBED_PATH = /^\/embed\/([be])\/([A-Za-z0-9_-]{20,64})$/;
export const EMBED_HEADER = 'X-RH-Embed';
export const SESSION_PATH = '/api/learn/boards/embed-session';

// The embed mode of a location, or null. chat: ?chat=1 only. theme: ?theme=light|dark, else the visitor's system setting.
export function embedRoute(pathname, search = '') {
  const found = String(pathname).match(EMBED_PATH);
  if (!found) return null;
  const query = new URLSearchParams(search);
  const theme = query.get('theme');
  return { kind: found[1], token: found[2], chat: query.get('chat') === '1', theme: theme === 'light' || theme === 'dark' ? theme : null };
}

// The full site's page for a link: /b/<token> or /e/<token>. intent ('fork' | 'ask') and handoff (the tab will ask its opener for
// the visitor's local copy) ride as plain flags, never the visitor's text.
export const fullHref = (origin, kind, token, { intent = null, handoff = false } = {}) => {
  const query = new URLSearchParams();
  if (handoff) query.set('from', 'embed');
  if (intent) query.set(intent, '1');
  return `${origin}/${kind}/${token}${query.size ? `?${query}` : ''}`;
};
export const embedHref = (origin, kind, token, { chat = false, theme = null } = {}) => {
  const query = new URLSearchParams();
  if (chat) query.set('chat', '1');
  if (theme) query.set('theme', theme);
  return `${origin}/embed/${kind}/${token}${query.size ? `?${query}` : ''}`;
};
// The preview image for email: the view link's thumbnail, or the publication's own (control-plane learn-boards.js).
export const thumbnailUrl = (origin, kind, token) => `${origin}/api/learn/boards/${kind === 'e' ? 'published' : 'shared'}/${token}/thumbnail`;

// The sources EmbedPanel offers for a canvas's sharing state: its public view link and its Explore publication.
export const embedSources = (sharing, origin) => [
  { kind: 'shared', token: sharing?.view || '', url: sharing?.view ? fullHref(origin, 'b', sharing.view) : '', available: !!(sharing?.shared && sharing.view && sharing.public_view),
    reason: 'Turn on the public view link to embed this canvas.' },
  { kind: 'explore', token: sharing?.publication || '', url: sharing?.publication ? fullHref(origin, 'e', sharing.publication) : '', available: !!(sharing?.published && sharing.publication) },
];

export const DEFAULT_HEIGHT = 520;
export const clampHeight = value => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(2000, Math.max(200, n)) : DEFAULT_HEIGHT;
};
export const clampWidth = value => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(2000, Math.max(200, n)) : 640;
};
const attr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The iframe the publisher pastes: lazy, titled, 100% wide unless a pixel width is given, and no allow list.
export const embedSnippet = ({ src, title, height, width = '100%' }) =>
  `<iframe src="${attr(src)}" title="${attr(title || 'Rabbit Hole canvas')}" width="${attr(width)}" height="${clampHeight(height)}" loading="lazy" style="border:0;max-width:100%"></iframe>`;
// The newsletter fallback when the link has no preview image: a plain text link.
export const linkSnippet = ({ href, title }) => `<a href="${attr(href)}">${attr(title || 'Open this canvas in Rabbit Hole')}</a>`;
// The email block: the preview image linked to the canvas (an email cannot run an iframe).
export const emailSnippet = ({ href, image, title }) =>
  `<a href="${attr(href)}"><img src="${attr(image)}" alt="${attr(title || 'Rabbit Hole canvas')}" width="600" style="max-width:100%;height:auto;border:0"></a>`;

// Every embed viewer is a public guest, whatever account cookies the browser holds (decision 3): the role never comes
// from the server's access record or a viewer here, and the server ignores the session on X-RH-Embed requests too.
export const sharedRole = ({ embed = false, access = null, viewer = null } = {}) => (embed ? 'guest' : access?.role || (viewer ? 'viewer' : 'guest'));

// Plain wheel belongs to the article; ctrl/cmd+wheel (a pinch too) belongs to the canvas only once it has focus.
export const canvasOwnsWheel = (event, focused) => focused && !!(event.ctrlKey || event.metaKey);

// A zoom the canvas did not take (nothing called preventDefault on it): over a control that floats beside the canvas surface (the
// left stack, the zoom pill) the surface never sees the wheel, so the browser would scroll the host page. The embed takes it:
// the default is cancelled, and a zoom over a control outside the surface is replayed on the surface.
export const leftoverZoom = (event, focused, insideSurface) => {
  const mine = canvasOwnsWheel(event, focused) && !event.defaultPrevented;
  return { prevent: mine, forward: mine && !insideSurface };
};

// Whether the canvas has focus after an event: a press or focus inside it sets it; a press elsewhere in the frame or the frame
// losing the window's focus clears it. focusout and other types change nothing.
export const focusAfter = (focused, type, inside) => (type === 'pointerdown' ? inside : type === 'focusin' ? inside || focused : type === 'blur' ? false : focused);

// Marks every same-origin API request of this page as an embed request (the server then ignores the account session).
export function embedFetch(original, origin) {
  return (input, init = {}) => {
    const url = new URL(input?.url ?? String(input), origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return original(input, init);
    const headers = new Headers(init.headers || input?.headers);
    headers.set(EMBED_HEADER, '1');
    return original(input, { ...init, headers });
  };
}
export function installEmbedFetch(win = window) {
  win.fetch = embedFetch(win.fetch.bind(win), win.location.origin);
}

// Chat's session check, run only when the visitor opens Chat: init (sets the partitioned cookie), then the probe that proves it
// came back. { session: true, guest } enables Send; { session: false } means this browser kept no cookie in the frame.
export async function startEmbedSession(token, fetcher = globalThis.fetch) {
  const none = { session: false, guest: null };
  try {
    const init = await fetcher(SESSION_PATH, { method: 'POST', headers: { [EMBED_HEADER]: '1' }, cache: 'no-store' });
    if (!init.ok) return none;
    const probe = await fetcher(askPath(token), { headers: { 'Content-Type': 'application/json', [EMBED_HEADER]: '1' }, cache: 'no-store' });
    if (!probe.ok) return none;
    const body = await probe.json();
    return body.embed?.session === true ? { session: true, guest: body.guest ?? null } : none;
  } catch { return none; }
}

// Hand-off to the full site in a new tab (never the URL, never the host page). The embed opens the tab itself and answers only
// that window, only on its own origin: the new tab asks its opener, the embed replies with the visitor's local copy and unsent
// Chat draft, the tab stores them where its own sign-in and Fork flows already look. The tab acknowledges only once everything is
// stored and read back; if storage refuses (blocked, full, partly writable) it undoes what it wrote and answers with a refusal
// and its reason. Until the acknowledgement nothing is discarded (the embed keeps everything and offers Retry), the offer lives
// `ttl` ms, and an acknowledged hand-off is spent. payload.id names one Fork or Open Chat action: a retry reuses it, so the tab
// stores nothing twice and every tab forks under the same fork key (the server makes one fork).
const REQUEST = 'rh-embed-handoff-request', REPLY = 'rh-embed-handoff', ACK = 'rh-embed-handoff-ack', NACK = 'rh-embed-handoff-nack';
export function handoffHost(win, token, { ttl = 60000, wait = 15000 } = {}) {
  let pending = null;
  const clear = () => { if (pending) { clearTimeout(pending.fail); clearTimeout(pending.expire); pending = null; } };
  const listen = event => {
    const now = pending;
    if (!now || event.origin !== win.location.origin || event.source !== now.target || event.data?.token !== token) return;
    const { type, id } = event.data;
    if (type === REQUEST) event.source.postMessage({ type: REPLY, token, ...now.payload }, win.location.origin);
    else if (now.payload.id && id !== now.payload.id) return; // an answer about another hand-off
    else if (type === ACK) { clear(); now.onDone?.(); }
    else if (type === NACK) { clearTimeout(now.fail); now.onFail?.(typeof event.data.reason === 'string' ? event.data.reason.slice(0, 20) : 'storage'); } // the offer stays open for the tab's Retry
  };
  win.addEventListener('message', listen);
  return {
    // target: the window just opened. onFail(reason): the tab refused ('storage') or did not answer within `wait` ('unanswered', it
    // may still answer later and call onDone).
    start(target, payload, { onFail, onDone } = {}) {
      clear();
      pending = { target, payload, onDone, onFail };
      pending.fail = setTimeout(() => onFail?.('unanswered'), wait);
      pending.expire = setTimeout(clear, ttl);
    },
    stop() { clear(); win.removeEventListener('message', listen); },
  };
}

// Stores the whole hand-off in this tab's storage, or none of it. true: every key written and read back equal. false: storage is
// null, blocked, full, silently dropping or partly writable; whatever was written is put back as it was (best effort).
// A storage with memory: true is the in-page stand-in storage-fallback.js installs where the browser blocks the real one: it dies
// with the page, so a hand-off kept there would be lost at the sign-in redirect and must not be acknowledged.
const handoffId = id => (typeof id === 'string' && /^[\w-]{8,80}$/.test(id) ? id : null);
function storeHandoff(storage, token, { draft, chatDraft, target, id }) {
  if (!storage || storage.memory) return false;
  const marker = `rh.handoff-done:${token}`;
  try { if (id && storage.getItem(marker) === id) return true; } catch { return false; } // already stored: the composer may have taken the draft since
  const undo = [], wrote = new Map();
  let failed = false;
  const tx = {
    setItem(key, value) {
      if (failed) return;
      try { undo.push([key, storage.getItem(key)]); storage.setItem(key, value); wrote.set(key, String(value)); } catch { failed = true; }
    },
  };
  if (draft?.state) saveGuestDraft(() => tx, token, draft.base_version, draft.state);
  if (chatDraft) signInForAsk(token, chatDraft, tx, undefined, target);
  if (id) { tx.setItem(`rh.fork-key:${token}`, id); tx.setItem(marker, id); } // the fork key ForkButton replays
  const whole = !failed && [...wrote].every(([key, value]) => { try { return storage.getItem(key) === value; } catch { return false; } });
  if (!whole) for (const [key, before] of undo.reverse()) { try { if (before === null) storage.removeItem(key); else storage.setItem(key, before); } catch { /* best effort */ } }
  return whole;
}
// The full page's side: resolves once the embed answered (or after `wait` ms, or at once without an opener) with { ok: true } or
// { ok: false, reason: 'storage' | 'unanswered' }. Nothing is sent but the acknowledgement or the refusal.
export function receiveHandoff(win, token, storage, wait = 1500) {
  const unanswered = { ok: false, reason: 'unanswered' };
  if (!win.opener) return Promise.resolve(unanswered);
  return new Promise(done => {
    const finish = got => { win.removeEventListener('message', take); clearTimeout(timer); done(got); };
    const take = event => {
      if (event.origin !== win.location.origin || event.source !== win.opener || event.data?.type !== REPLY || event.data.token !== token) return;
      const { draft, chatDraft, target } = event.data, id = handoffId(event.data.id);
      const stored = storeHandoff(storage, token, { draft, chatDraft, target, id });
      try { win.opener.postMessage(stored ? { type: ACK, token, id } : { type: NACK, token, id, reason: 'storage' }, win.location.origin); } catch { /* the embed shows its own retry */ }
      finish(stored ? { ok: true } : { ok: false, reason: 'storage' });
    };
    const timer = setTimeout(() => finish(unanswered), wait);
    win.addEventListener('message', take);
    try { win.opener.postMessage({ type: REQUEST, token }, win.location.origin); } catch { finish(unanswered); }
  });
}
