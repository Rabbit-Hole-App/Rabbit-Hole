import { redactRepositoryCards } from './repository-cards.js';
import { boardImageContext, imageCard } from './learn-image-context.js';
// A viewer's question about a shared canvas: POST /api/learn/boards/shared/:token/ask
// (docs/features/shared-canvas-ask.md). The answer streams back to that viewer only, and nothing of the owner's is
// written - no thread, no message, no moment row, nothing on the owner's board. The writes are the question's usage
// event (shared_ask_events, also the rate limit) and, for a link made before pinning, its pin. The viewer's
// conversation lives in their browser and comes back as `history`; everything else the model reads is built here
// from the shared row.
import { askStream } from './ask.js';
import { HISTORY_TURNS, MESSAGE_LIMIT, MODEL_NOT_CONFIGURED } from './learn-models.js';
import { SHARED_CANVAS_SYSTEM, REPOSITORY_SYSTEM } from './agents/learn-chat.js';
import { REPOSITORY_TOOLS, repositoryTool } from './repository-context.js';
import { repositorySnapshot } from './repositories.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { appendCanvasTarget } from './learn-ask-context.js';
import { sha256Hex } from './learn-grade-jev.js';
import { fileContext } from './file-context.js';
import { chatContext } from './chat-modes.js';
import { fileChatRef } from '../../web/src/file-chat-ref.js';
import { sharedState } from './shared-privacy.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const CANVAS = /^canvas-[a-f0-9]{8}$/;
export const BOARD_CHARS = 24000; // the canvas as text, per question
const ENTRY_CHARS = 1500; // one card, note or earlier chat answer
const SOURCES = 20;
const list = value => (Array.isArray(value) ? value : []);
const text = value => (typeof value === 'string' ? value.trim() : '');
const clip = (value, max) => (value.length > max ? `${value.slice(0, max)} [truncated]` : value);

// The revision a board reads now: its own project (a repo-* board, or a canvas's project) at the owner's current
// commit; otherwise what it inherited as a fork (board_repository_pins, share_key NULL). { id, commit } or null;
// the id never leaves the server. `row` needs org, app, owner_email and, for a fork, its learn_boards id.
export async function boardRevision(db, row) {
  const name = row.app.startsWith('repo-') ? row.app
    : CANVAS.test(row.app) ? (await db.prepare('SELECT project FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first())?.project : null;
  if (name) {
    const repo = await db.prepare('SELECT id, commit_sha FROM repository_apps WHERE org = ? AND name = ? AND owner_email = ?').bind(row.org, name, row.owner_email).first();
    return repo?.commit_sha ? { id: repo.id, commit: repo.commit_sha } : null;
  }
  const inherited = row.id ? await db.prepare('SELECT repository_id, commit_sha FROM board_repository_pins WHERE board_id = ?').bind(row.id).first() : null;
  return inherited ? { id: inherited.repository_id, commit: inherited.commit_sha } : null;
}

// A share link's identity on the server (owner, 2026-10-04): the SHA-256 of its token with a fixed prefix. Tokens are
// 24 random bytes, so the key is one-way and unguessable; it is what pins and the per-link rate limit are keyed by.
// The raw token stays on learn_boards (the share record) and is never stored, logged or returned anywhere else. A link
// switched off and on is a new token, so a new key.
export const shareKey = token => sha256Hex(`shared-canvas-link:${token}`);
// An Explore publication's per-link key: the same one-way shape under its own prefix (docs/features/explore-publish.md).
export const publicationKey = token => sha256Hex(`explore-publication:${token}`);

// A share's pin (share -> canvas -> repository -> commit): taken when its link is made, and for a link from before
// pinning, at its first open or ask. The same link keeps it whatever the owner refreshes; a new link pins again,
// with repository code off. Never the current HEAD in place of a pin.
export async function sharePin(db, row) {
  if (!row.view_token) return null;
  const key = await shareKey(row.view_token);
  const pin = await db.prepare('SELECT repository_id, commit_sha, share_key, repo_access FROM board_repository_pins WHERE board_id = ?').bind(row.id).first();
  if (pin?.share_key === key) return pin;
  const revision = await boardRevision(db, row);
  if (!revision) return null;
  await db.prepare('INSERT OR REPLACE INTO board_repository_pins (board_id, repository_id, commit_sha, share_key, repo_access, pinned_at) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(row.id, revision.id, revision.commit, key, new Date().toISOString()).run();
  return { repository_id: revision.id, commit_sha: revision.commit, share_key: key, repo_access: 0 };
}

// The original importer of a repository (owner R3 decision, 2026-10-16, A3 item 2): its repository_apps row's own workspace
// and owner, from server records - never a share token, a fork, membership or sign-in alone. A snapshot-ownership policy for
// the stored import only; it is not GitHub authorization and authorizes no refresh or new fetch.
export const importerOf = (repo, viewer) => !!viewer?.email && viewer.org === repo.org && viewer.email === repo.owner_email;

// What a link may show and read of its repository (the private repository boundary) for `viewer` ({ org, email } or null),
// who can already open the link: its name, commit and code only for a repository an anonymous read confirmed public, or
// for the repository's original importer (importerOf). A share link grants canvas access, never a private repository's
// (owner decision A2, 2026-10-16): the per-link repository permission (board_repository_pins.repo_access) is no longer
// read. Unknown visibility is private. { id, repo, commit, public, owned, allowed } or null; the id never leaves the server.
export async function shareSource(db, row, viewer = null) {
  const pin = await sharePin(db, row);
  const repo = pin && await db.prepare('SELECT r.repo, r.org, r.owner_email, v.visibility FROM repository_apps r LEFT JOIN repository_visibility v ON v.app_id = r.id WHERE r.id = ?').bind(pin.repository_id).first();
  if (!repo) return null;
  const open = repo.visibility === 'public', owned = repo.owner_email === row.owner_email;
  return { id: pin.repository_id, repo: repo.repo, commit: pin.commit_sha, public: open, owned, allowed: open || importerOf(repo, viewer) };
}

// The videos, Wikipedia articles and papers placed on the board: kind, title and public id.
export function boardSources(state) {
  const seen = new Set(), out = [];
  for (const block of list(state?.blocks)) {
    const source = block?.type === 'video' && text(block.videoId) ? { kind: 'video', id: text(block.videoId).slice(0, 64), title: text(block.title) || 'YouTube video' }
      : block?.type === 'wiki' && text(block.title) ? { kind: 'wiki', title: text(block.title) }
      : block?.type === 'paper' && text(block.paper?.id) ? { kind: 'paper', id: text(block.paper.id).slice(0, 64), title: text(block.title) || `arXiv ${text(block.paper.id)}` }
      : null;
    const key = source && `${source.kind}:${source.id || source.title}`;
    if (!source || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...source, title: source.title.slice(0, 200) });
    if (out.length === SOURCES) break;
  }
  return out;
}

// A PDF excerpt card (web/src/pdf-excerpt.js): its verbatim quotation marked as the PDF's and its note marked as the canvas
// author's, never mixed. Each part is capped on its own (the quote at `quote` characters), so a long quote never pushes the
// note out. A region excerpt is a picture: only its note is text (the picture rides when it is selected, learn-image-context.js).
// Selected, the full quote rides as the canvas target: 8,000 characters plus its title, source line and note.
export const EXCERPT_CHARS = 8000, SELECTED_EXCERPT_CHARS = 12000;
function excerptParts(block, quote) {
  const excerpt = block?.excerpt;
  if (!excerpt || typeof excerpt !== 'object') return [];
  const page = text(String(excerpt.page?.label ?? excerpt.page?.index ?? '')), where = `"${text(excerpt.source?.name) || 'PDF'}"${page ? `, page ${page}` : ''}`;
  const exact = excerpt.kind === 'text' ? text(excerpt.quote?.exact) : '';
  return [exact && `Verbatim quotation from the PDF ${where} (only this selection, not the whole PDF):\n"""\n${clip(exact, quote)}\n"""`,
    text(block.note) && `Note (the canvas author's own words, not from the PDF): ${clip(text(block.note), ENTRY_CHARS)}`];
}

// The board as text: headings, cards, notes and its finished chat answers, in board order, each entry and the
// whole capped. Drawings, images and notebook files are not text; the sources are listed separately.
export function boardText(state) {
  const entries = [];
  const add = (label, ...parts) => {
    const body = parts.map(text).filter(Boolean).join('\n');
    if (body) entries.push(clip(label ? `[${label}] ${body}` : body, ENTRY_CHARS));
  };
  for (const block of list(state?.blocks)) {
    if (block?.type === 'heading') add(null, text(block.text) && `# ${text(block.text)}`);
    else if (block?.excerpt) { const parts = [text(block.title || block.label), ...excerptParts(block, ENTRY_CHARS)].filter(Boolean); if (parts.length) entries.push(`[PDF excerpt] ${parts.join('\n')}`); }
    else if (block?.type === 'explanation') add('Explanation', block.title, block.body, ...list(block.more).map(section => section?.text));
    else if (!['video', 'wiki', 'paper'].includes(block?.type)) add(text(block?.type) || 'Card', block?.title, block?.question, block?.prompt, block?.text, block?.brief, block?.caption, block?.code);
  }
  // An equation is its LaTeX (canvas-equations.md).
  for (const note of [...list(state?.items), ...list(state?.shapes)]) add(note?.kind === 'equation' ? 'Equation' : 'Note', note?.kind === 'equation' ? note.latex : note?.text);
  for (const exchange of list(state?.exchanges)) {
    for (const turn of [exchange, ...list(exchange?.replies)]) {
      if ((turn?.status ?? 'done') === 'done' && text(turn?.answer)) add('Earlier chat', `Q: ${text(turn.question)}`, `A: ${text(turn.answer)}`);
    }
  }
  const all = entries.join('\n\n');
  return all.length > BOARD_CHARS ? `${all.slice(0, BOARD_CHARS)}\n[The rest of the canvas (${all.length - BOARD_CHARS} more characters) is not included.]` : all;
}

// The card the viewer selected (SharedBoardPage.jsx, owner 2026-10-08: "a pill above the chat composer"), found on the
// shared board by its id and worded from the board, as boardText words it: only the id comes from the request, never
// the card's text. A lesson, reader or file card, a note or shape, or a chat card; an id not on the board is null.
export function selectedCard(state, id) {
  const block = list(state?.blocks).find(entry => entry?.id === id);
  const note = !block && [...list(state?.items), ...list(state?.shapes)].find(entry => entry?.id === id);
  const exchange = !block && !note && list(state?.exchanges).find(entry => entry?.id === id);
  // The note first: a quote cut at the target's limit (marked as cut) never takes the note with it.
  if (block?.excerpt) return { id, kind: 'PDF excerpt', text: [text(block.title || block.label), ...excerptParts(block, EXCERPT_CHARS).reverse()].filter(Boolean).join('\n') || 'PDF excerpt' };
  const parts = block ? [block.title, block.label, block.question, block.prompt, block.text, block.body, block.brief, block.caption, block.code, ...list(block.more).map(section => section?.text)]
    : note ? [note.kind === 'equation' ? note.latex : note.text]
    : exchange ? [exchange, ...list(exchange.replies)].flatMap(turn => [text(turn?.question) && `Q: ${text(turn.question)}`, text(turn?.answer) && `A: ${text(turn.answer)}`])
    : null;
  if (!parts) return null;
  const kind = block ? text(block.type) || 'Card' : note ? (note.kind === 'equation' ? 'Equation' : 'Note') : 'Chat';
  return { id, kind, text: clip(parts.map(text).filter(Boolean).join('\n') || kind, ENTRY_CHARS) };
}

// The viewer's own earlier turns from their browser: the last HISTORY_TURNS, each cut to the question limit.
// Anything but a list of { role: user|assistant, content } is refused (null).
export function viewerHistory(history) {
  if (history === undefined || history === null) return [];
  if (!Array.isArray(history) || history.some(turn => !['user', 'assistant'].includes(turn?.role) || typeof turn.content !== 'string')) return null;
  const turns = history.filter(turn => turn.content.trim()).slice(-HISTORY_TURNS).map(turn => ({ role: turn.role, content: clip(turn.content, MESSAGE_LIMIT) }));
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

// A shared board's name for viewers, a fork and the model: the canvas's own title, a fork's, or a project board's app
// name - which names the repository, so a project board whose repository the share may not show is 'Shared canvas'.
export const sharedTitle = (row, canvasTitle, source) => canvasTitle || row.title
  || (row.app.startsWith('repo-') && !source?.allowed ? 'Shared canvas' : row.board === 'main' ? row.app : row.board);

// The shared ask's limits, in one place (docs/features/shared-canvas-ask.md): per signed-in viewer and per share
// link, an hour and a day - V1 launch protection, not product policy. A worker var of the same name overrides one (a whole number; anything else is ignored).
export const SHARED_ASK_LIMITS = { SHARED_ASK_VIEWER_HOUR: 20, SHARED_ASK_VIEWER_DAY: 60, SHARED_ASK_SHARE_HOUR: 60, SHARED_ASK_SHARE_DAY: 300 };
// Any such caps object (the hook caps too, learn-next-steps-routes.js), each overridden by its worker var.
export const limitsFrom = (caps, env) => Object.fromEntries(Object.entries(caps).map(([name, fallback]) => {
  const value = String(env?.[name] ?? '').trim();
  return [name, /^\d+$/.test(value) ? Number(value) : fallback];
}));
export const sharedAskLimits = env => limitsFrom(SHARED_ASK_LIMITS, env);

// Admits a question under every cap and records it, in one atomic insert (the login-link pattern, auth.js): the row
// is the usage event - category, time, viewer, share link (shareKey), shared board, its owner, whether repository
// code was in context; never the question, the answer, any source or the token - and the rate-limit count. Two
// buckets: the signed-in viewer (viewer_email, across every link) and the share link (share_key, owner 2026-10-04:
// a board's links differ in audience, permission, lifecycle and traffic, so each has its own budget, never the
// board's). A refusal writes nothing and says which limit, as a 429.
// Billing (owner, 2026-10-04): Usage & Credits will meter shared_canvas_ask to viewer_email, the signed-in account that
// asked - never to owner_email, which only says whose share it was: someone opening a share never costs its owner.
// ponytail: rows are never pruned (the caps read one day); prune or roll up when Usage & Credits takes them over.
// Every count reads only its own category (shared_canvas_ask, tutor_next_steps, shared_canvas_hooks, tutor_handoff), so one feature's
// usage never spends another's budget. Every cap is required: a skipped bucket passes NO_CAP explicitly (an owned call
// has no share bucket, shareKey ''; an anonymous shared one no viewer bucket, viewer ''), and a cap left out throws, so
// a forgotten cap never means no limit. null when admitted, else the viewer's own { hour, day } counts.
export const NO_CAP = 1e9;
// The four buckets in cap order (viewerHour, viewerDay, shareHour, shareDay): who is counted, the window, the cap's parameter.
const BUCKETS = [['viewer_email = ?2', 3600, 7], ['viewer_email = ?2', 86400, 8], ['share_key = ?3', 3600, 9], ['share_key = ?3', 86400, 10]];
export async function admitUsage(db, { category, viewer, shareKey, boardId, owner, repository = 0, viewerHour, viewerDay, shareHour, shareDay }) {
  const caps = [viewerHour, viewerDay, shareHour, shareDay];
  if (!caps.every(Number.isFinite)) throw new TypeError('admitUsage needs all four caps; pass NO_CAP to skip a bucket');
  const now = Math.floor(Date.now() / 1000);
  // Task 14 A-M2: a count clause only for a capped bucket, so a NO_CAP bucket (which can never refuse) never scans the
  // platform-wide rows under share_key '' or viewer_email ''. A capped bucket counts exactly as before.
  const counts = BUCKETS.filter((_, i) => caps[i] < NO_CAP).map(([who, span, cap]) => `(SELECT COUNT(*) FROM shared_ask_events WHERE category = ?11 AND ${who} AND asked_at > ?1 - ${span}) < ?${cap}`);
  const admitted = await db.prepare(`INSERT INTO shared_ask_events (category, asked_at, viewer_email, share_key, board_id, owner_email, repository)
    SELECT ?11, ?1, ?2, ?3, ?4, ?5, ?6${counts.length ? `
    WHERE ${counts.join('\n      AND ')}` : ''}`)
    .bind(now, viewer, shareKey, boardId, owner, repository, viewerHour, viewerDay, shareHour, shareDay, category).run();
  if (admitted.meta.changes === 1) return null;
  return db.prepare('SELECT COUNT(*) AS day, COALESCE(SUM(asked_at > ?2 - 3600), 0) AS hour FROM shared_ask_events WHERE category = ?3 AND viewer_email = ?1 AND asked_at > ?2 - 86400').bind(viewer, now, category).first();
}

// Guest Chat (SHARE-03, owner brief 2026-10-22 section 5; C:/s/spec/share/contract-guest-chat.md): a signed-out visitor
// gets one 10-message trial across every shared canvas and tab, never reset. The trial is keyed by an opaque random cookie
// this server issues: it marks this browser's trial, not a person. Only its hash is stored, as one shared_ask_events row per
// admitted message (category shared_canvas_ask, so the per-link caps count guests too), viewer_email
// 'guest:<browser hash>:<turn hash>'. The turn hash is the Send's request identity (X-RH-Action-Key) with its message, so a
// transport retry finds its own row and is answered again without a second count; a replay is its own 'replay:' row,
// capped per turn. Platform-sponsored (learn-usage.js PUBLIC_FEATURES: payer platform, never the canvas owner).
export const GUEST_MESSAGES = 10;
const GUEST_REPLAYS = 2;
const GUEST_COOKIE = 'rh_guest';
const GUEST_ID = /^[A-Za-z0-9_-]{32}$/;
const ACTION_KEY = /^[A-Za-z0-9_-]{8,128}$/;
// This browser's trial id from the request's cookie, or a new one to set (`fresh`). Never a person's identity.
export function guestOf(req) {
  const key = req.headers.get('x-rh-action-key') || '';
  const found = (req.headers.get('cookie') || '').split(/;\s*/).map(pair => pair.split('=')).find(([name]) => name === GUEST_COOKIE)?.[1];
  if (GUEST_ID.test(found || '')) return { id: found, fresh: false, key };
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return { id: btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_'), fresh: true, key };
}
// The response, with the trial's cookie when this request made it.
export function withGuestCookie(response, guest) {
  if (!guest?.fresh) return response;
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', `${GUEST_COOKIE}=${guest.id}; Path=/api/learn; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return new Response(response.body, { status: response.status, headers });
}
const browserKey = guest => sha256Hex(`guest-chat:${guest.id}`);
// The admitted messages of this browser's trial: one index range on viewer_email (';' sorts right after ':').
async function guestUsed(db, browser) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND viewer_email >= ?1 AND viewer_email < ?2")
    .bind(`guest:${browser}:`, `guest:${browser};`).first();
  return Number(row?.n || 0);
}
const guestAllowance = used => ({ limit: GUEST_MESSAGES, used: Math.min(used, GUEST_MESSAGES), remaining: Math.max(0, GUEST_MESSAGES - used) });
export async function guestChatAllowance(db, guest) {
  return guestAllowance(await guestUsed(db, await browserKey(guest)));
}

// Admits a guest's message before any model call, in one atomic insert each: a new turn under the trial and the link's caps,
// else a replay of the same turn under its replay cap and the link's caps. { allowance } when admitted, else the refusal.
async function admitGuest(env, row, guest, message, repository, linkKey) {
  const db = env.LEARN_DB, limits = sharedAskLimits(env), now = Math.floor(Date.now() / 1000);
  const browser = await browserKey(guest), turn = `guest:${browser}:${await sha256Hex(`${guest.key}\n${message}`)}`;
  const insert = where => db.prepare(`INSERT INTO shared_ask_events (category, asked_at, viewer_email, share_key, board_id, owner_email, repository)
    SELECT 'shared_canvas_ask', ?2, ?1, ?3, ?4, ?5, ?6 WHERE ${where}
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND share_key = ?3 AND asked_at > ?2 - 3600) < ?7
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND share_key = ?3 AND asked_at > ?2 - 86400) < ?8`);
  const common = [now, linkKey, row.id, row.owner_email, repository ? 1 : 0, limits.SHARED_ASK_SHARE_HOUR, limits.SHARED_ASK_SHARE_DAY];
  const fresh = await insert(`NOT EXISTS (SELECT 1 FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND viewer_email = ?1)
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND viewer_email >= ?9 AND viewer_email < ?10) < ?11`)
    .bind(turn, ...common, `guest:${browser}:`, `guest:${browser};`, GUEST_MESSAGES).run();
  if (fresh.meta.changes === 1) return { allowance: guestAllowance(await guestUsed(db, browser)) };
  if (await db.prepare("SELECT 1 FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND viewer_email = ?").bind(turn).first()) {
    const again = await insert("(SELECT COUNT(*) FROM shared_ask_events WHERE category = 'shared_canvas_ask' AND viewer_email = ?1) < ?9")
      .bind(`replay:${turn.slice('guest:'.length)}`, ...common, GUEST_REPLAYS).run();
    if (again.meta.changes === 1) return { allowance: guestAllowance(await guestUsed(db, browser)) };
    return json({ error: 'This message was already answered. Ask something new.', limited: true }, 429);
  }
  const allowance = guestAllowance(await guestUsed(db, browser));
  if (allowance.remaining === 0) return json({ error: `You have used your ${GUEST_MESSAGES} free messages. Sign in to continue.`, code: 'guest_limit', signIn: true, guest: allowance }, 429);
  return json({ error: 'This share link has had as many questions as it can take for now. Try again later, or sign in.', limited: true }, 429);
}

// key: a publication's own rate-limit key (explore-publish.md); a share link counts against its share key.
async function admitAsk(env, row, viewer, repository, key = null) {
  const limits = sharedAskLimits(env);
  const mine = await admitUsage(env.LEARN_DB, { category: 'shared_canvas_ask', viewer: viewer.email, shareKey: key ?? await shareKey(row.view_token), boardId: row.id, owner: row.owner_email, repository: repository ? 1 : 0,
    viewerHour: limits.SHARED_ASK_VIEWER_HOUR, viewerDay: limits.SHARED_ASK_VIEWER_DAY, shareHour: limits.SHARED_ASK_SHARE_HOUR, shareDay: limits.SHARED_ASK_SHARE_DAY });
  if (!mine) return null;
  const error = mine.hour >= limits.SHARED_ASK_VIEWER_HOUR ? `You have asked ${limits.SHARED_ASK_VIEWER_HOUR} questions about shared canvases in the last hour, the limit for now. Try again later.`
    : mine.day >= limits.SHARED_ASK_VIEWER_DAY ? `You have asked ${limits.SHARED_ASK_VIEWER_DAY} questions about shared canvases today, the daily limit. Try again tomorrow.`
    : 'This share link has had as many questions as it can take for now. Try again later, or fork the canvas to keep learning on your own copy.';
  return json({ error, limited: true }, 429);
}

// The model request: Learn chat's answer style and model settings (askStream's research path, LEARN_TASKS.chat,
// Auto), the board's text and sources, and - when the share may read it - the repository at the share's pinned
// commit through the read-only repository tools. No video tools: a shown video writes a moment row. Only `message`,
// `history` and `selected` (a card id, worded from the board here) come from the request: a model, a command or a file in it is ignored, and a message starting with
// / is a plain question (nothing here dispatches commands).
// link: an Explore publication's { source, key } - its own repository boundary and limit; a share reads its own.
// An imported file card the viewer selected (canvas-file-imports.md section 6): its extracted text for the card's scope, read
// through this shared board's own file reference (file-context.js, { row }: the board the link or membership already admitted),
// with the coverage said to the model. Nothing when no file card is selected; never the original, never another board's file.
async function selectedFileText(env, row, state, selected) {
  const block = selected ? list(state?.blocks).find(entry => entry?.id === selected) : null;
  const ref = block?.fileRef ? fileChatRef(block) : null;
  if (!ref) return '';
  const files = await fileContext(null, env, [ref], { row }).catch(() => null);
  return chatContext('', [ref], null, 6000, null, files);
}

// guest: a signed-out visitor's trial (guestOf) when viewer is null; the answer's done event carries the allowance after it.
export async function askShared(env, row, viewer, body, link = null, guest = null) {
  if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > MESSAGE_LIMIT) return json({ error: `Ask a question of 1-${MESSAGE_LIMIT} characters.` }, 400);
  const history = viewerHistory(body.history);
  if (!history) return json({ error: 'history must be a list of { role, content } turns' }, 400);
  if (body.selected != null && (typeof body.selected !== 'string' || !body.selected || body.selected.length > 200)) return json({ error: 'selected must be a card id' }, 400);
  if (!viewer && !guest) throw new TypeError('askShared needs a viewer or a guest trial');
  // A guest's Send needs its request id first - pure validation, so it answers the same whether or not a model is configured.
  if (!viewer && !ACTION_KEY.test(guest.key)) return json({ error: 'Send needs a request id (X-RH-Action-Key).', code: 'request_id_required' }, 400);
  if (!env.ANTHROPIC_API_KEY && env.SUBSCRIPTION_ONLY !== 'true') return json({ error: MODEL_NOT_CONFIGURED }, 503);
  const refused = subscriptionOwnerRefusal(env, viewer);
  if (refused) return refused;
  // Only what was placed on the canvas (shared-privacy.js sharedState, SHARE-01 section 7): never the creator's answers, attempts or highlights.
  const db = env.LEARN_DB, state = sharedState(await redactRepositoryCards(db, JSON.parse(row.state_json), viewer));
  const canvas = CANVAS.test(row.app) ? await db.prepare('SELECT title FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first() : null;
  const source = link ? link.source : await shareSource(db, row, viewer);
  const repository = source?.allowed ? source : null;
  const admitted = viewer ? await admitAsk(env, row, viewer, !!repository, link?.key)
    : await admitGuest(env, row, guest, body.message.trim(), !!repository, link?.key ?? await shareKey(row.view_token));
  if (admitted instanceof Response) return admitted;
  let snapshot = null;
  if (repository) {
    try { snapshot = await repositorySnapshot(env, { id: repository.id }, repository.commit); } catch { /* fail closed: no source, never another commit */ }
  }
  // The selected card rides beside the board as Learn's canvas target does (learn-ask-context.js); one not on the board is ignored.
  const target = body.selected ? selectedCard(state, body.selected) : null;
  const context = appendCanvasTarget(JSON.stringify({
    canvas: sharedTitle(row, canvas?.title, source),
    content: boardText(state),
    sources: boardSources(state),
    ...(repository ? { repository: { repo: repository.repo, commit: repository.commit, ...(snapshot ? {} : { note: "The repository source at this share's pinned commit is not available: answer from the canvas only, say so, and never use another version." }) } } : {}),
  }), target, target?.kind === 'PDF excerpt' ? SELECTED_EXCERPT_CHARS : undefined) + await selectedFileText(env, row, state, body.selected);
  const research = snapshot ? { papers: [], system: REPOSITORY_SYSTEM, tools: REPOSITORY_TOOLS, runTool: async (name, input) => repositoryTool(snapshot, name, input) } : { papers: [] };
  const meta = repository && !snapshot ? { notice: "The repository code at this share's commit could not be read, so this answer uses the canvas only." } : {};
  if (admitted?.allowance) meta.guest = admitted.allowance;
  const selectedImage = imageCard(state, body.selected);
  const image = selectedImage ? await boardImageContext(env, row, selectedImage) : { blocks: [] };
  if (image.notice) meta.notice = [meta.notice, image.notice].filter(Boolean).join(' ');
  return askStream(env, context, history, body.message.trim(), null, meta, image.blocks, null, null, null, SHARED_CANVAS_SYSTEM, research);
}
