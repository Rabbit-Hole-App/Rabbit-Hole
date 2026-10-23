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

// The full site's page for a link: /b/<token> or /e/<token>. `intent` rides as a plain flag, never the visitor's text.
export const fullHref = (origin, kind, token, intent = null) => `${origin}/${kind}/${token}${intent ? `?from=embed&${intent}=1` : ''}`;
export const embedHref = (origin, kind, token, { chat = false, theme = null } = {}) => {
  const query = new URLSearchParams();
  if (chat) query.set('chat', '1');
  if (theme) query.set('theme', theme);
  return `${origin}/embed/${kind}/${token}${query.size ? `?${query}` : ''}`;
};
// The preview image for email: the view link's thumbnail, or the publication's own (control-plane learn-boards.js).
export const thumbnailUrl = (origin, kind, token) => `${origin}/api/learn/boards/${kind === 'e' ? 'published' : 'shared'}/${token}/thumbnail`;

// Which link a canvas embeds through: its public view link, else its Explore publication; null when it is not public.
export function embedTarget(sharing) {
  if (sharing?.shared && sharing.view && sharing.public_view) return { kind: 'b', token: sharing.view };
  if (sharing?.published && sharing.publication) return { kind: 'e', token: sharing.publication };
  return null;
}

export const DEFAULT_HEIGHT = 520;
export const clampHeight = value => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(2000, Math.max(200, n)) : DEFAULT_HEIGHT;
};
const attr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// The iframe the publisher pastes: lazy, titled, full width, and no allow list.
export const embedSnippet = ({ src, title, height }) =>
  `<iframe src="${attr(src)}" title="${attr(title || 'Rabbit Hole canvas')}" width="100%" height="${clampHeight(height)}" loading="lazy" style="border:0;max-width:100%"></iframe>`;
// The email block: the preview image linked to the canvas (an email cannot run an iframe).
export const emailSnippet = ({ href, image, title }) =>
  `<a href="${attr(href)}"><img src="${attr(image)}" alt="${attr(title || 'Rabbit Hole canvas')}" width="600" style="max-width:100%;height:auto;border:0"></a>`;

// Every embed viewer is a public guest, whatever account cookies the browser holds (decision 3): the role never comes
// from the server's access record or a viewer here, and the server ignores the session on X-RH-Embed requests too.
export const sharedRole = ({ embed = false, access = null, viewer = null } = {}) => (embed ? 'guest' : access?.role || (viewer ? 'viewer' : 'guest'));

// Plain wheel belongs to the article; ctrl/cmd+wheel (a pinch too) belongs to the canvas only once it has focus.
export const canvasOwnsWheel = (event, focused) => focused && !!(event.ctrlKey || event.metaKey);

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

// Hand-off to the full site in a new tab (never the URL): the new tab asks its opener, the embed answers with the visitor's
// local copy and unsent Chat draft, and the full page stores them where its own sign-in and Fork flows already look.
const REQUEST = 'rh-embed-handoff-request', REPLY = 'rh-embed-handoff';
export function serveHandoff(win, token, payload) {
  const answer = event => {
    if (event.origin !== win.location.origin || event.data?.type !== REQUEST || event.data.token !== token) return;
    event.source?.postMessage({ type: REPLY, token, ...payload() }, win.location.origin);
  };
  win.addEventListener('message', answer);
  return () => win.removeEventListener('message', answer);
}
// Resolves once the embed answered (or after `wait` ms, or at once without an opener): nothing is ever sent by this.
export function receiveHandoff(win, token, storage, wait = 1500) {
  if (!win.opener) return Promise.resolve(false);
  return new Promise(done => {
    const finish = got => { win.removeEventListener('message', take); clearTimeout(timer); done(got); };
    const take = event => {
      if (event.origin !== win.location.origin || event.data?.type !== REPLY || event.data.token !== token) return;
      const { draft, chatDraft, target } = event.data;
      if (draft?.state) saveGuestDraft(() => storage, token, draft.base_version, draft.state);
      if (chatDraft) signInForAsk(token, chatDraft, storage, undefined, target);
      finish(true);
    };
    const timer = setTimeout(() => finish(false), wait);
    win.addEventListener('message', take);
    try { win.opener.postMessage({ type: REQUEST, token }, win.location.origin); } catch { finish(false); }
  });
}
