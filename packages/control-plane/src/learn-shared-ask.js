// A viewer's question about a shared canvas: POST /api/learn/boards/shared/:token/ask
// (docs/features/shared-canvas-ask.md). The answer streams back to that viewer only, and nothing of the owner's is
// written - no thread, no message, no moment row, nothing on the owner's board. The writes are the question's usage
// event (shared_ask_events, also the rate limit) and, for a link made before pinning, its pin. The viewer's
// conversation lives in their browser and comes back as `history`; everything else the model reads is built here
// from the shared row.
import { askStream } from './ask.js';
import { HISTORY_TURNS, MESSAGE_LIMIT } from './learn-models.js';
import { SHARED_CANVAS_SYSTEM, REPOSITORY_SYSTEM } from './agents/learn-chat.js';
import { REPOSITORY_TOOLS, repositoryTool } from './repository-context.js';
import { repositorySnapshot } from './repositories.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const CANVAS = /^canvas-[a-f0-9]{8}$/;
export const BOARD_CHARS = 24000; // the canvas as text, per question
const ENTRY_CHARS = 1500; // one card, note or earlier chat answer
const SOURCES = 20;
const list = value => (Array.isArray(value) ? value : []);
const text = value => (typeof value === 'string' ? value.trim() : '');
const clip = (value, max) => (value.length > max ? `${value.slice(0, max)} [truncated]` : value);

// The revision a board reads now: its own project (a repo-* board, or a canvas's project) at the owner's current
// commit; otherwise what it inherited as a fork (board_repository_pins, view_token NULL). { id, commit } or null;
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

// A share's pin (share -> canvas -> repository -> commit): taken when its link is made, and for a link from before
// pinning, at its first open or ask. The same link keeps it whatever the owner refreshes; a new link pins again,
// with repository code off. Never the current HEAD in place of a pin.
export async function sharePin(db, row) {
  if (!row.view_token) return null;
  const pin = await db.prepare('SELECT repository_id, commit_sha, view_token, repo_access FROM board_repository_pins WHERE board_id = ?').bind(row.id).first();
  if (pin?.view_token === row.view_token) return pin;
  const revision = await boardRevision(db, row);
  if (!revision) return null;
  await db.prepare('INSERT OR REPLACE INTO board_repository_pins (board_id, repository_id, commit_sha, view_token, repo_access, pinned_at) VALUES (?, ?, ?, ?, 0, ?)')
    .bind(row.id, revision.id, revision.commit, row.view_token, new Date().toISOString()).run();
  return { repository_id: revision.id, commit_sha: revision.commit, view_token: row.view_token, repo_access: 0 };
}

// What a share may show and read of its repository (the private repository boundary). Its name, commit and code
// only for a repository an anonymous read confirmed public, or a private one its owner allowed for this link -
// and only the repository's own owner can allow it, so a fork never opens up someone else's. Unknown visibility is
// private. { id, repo, commit, public, owned, repo_access, allowed } or null; the id never leaves the server.
export async function shareSource(db, row) {
  const pin = await sharePin(db, row);
  const repo = pin && await db.prepare('SELECT r.repo, r.owner_email, v.visibility FROM repository_apps r LEFT JOIN repository_visibility v ON v.app_id = r.id WHERE r.id = ?').bind(pin.repository_id).first();
  if (!repo) return null;
  const open = repo.visibility === 'public', owned = repo.owner_email === row.owner_email;
  return { id: pin.repository_id, repo: repo.repo, commit: pin.commit_sha, public: open, owned, repo_access: !!pin.repo_access, allowed: open || (owned && !!pin.repo_access) };
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
    else if (block?.type === 'explanation') add('Explanation', block.title, block.body, ...list(block.more).map(section => section?.text));
    else if (!['video', 'wiki', 'paper'].includes(block?.type)) add(text(block?.type) || 'Card', block?.title, block?.question, block?.prompt, block?.text, block?.brief, block?.caption, block?.code);
  }
  for (const note of [...list(state?.items), ...list(state?.shapes)]) add('Note', note?.text);
  for (const exchange of list(state?.exchanges)) {
    for (const turn of [exchange, ...list(exchange?.replies)]) {
      if ((turn?.status ?? 'done') === 'done' && text(turn?.answer)) add('Earlier chat', `Q: ${text(turn.question)}`, `A: ${text(turn.answer)}`);
    }
  }
  const all = entries.join('\n\n');
  return all.length > BOARD_CHARS ? `${all.slice(0, BOARD_CHARS)}\n[The rest of the canvas (${all.length - BOARD_CHARS} more characters) is not included.]` : all;
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

// The shared ask's limits, in one place (docs/features/shared-canvas-ask.md): per signed-in viewer and per shared
// board, an hour and a day. A worker var of the same name overrides one (a whole number; anything else is ignored).
export const SHARED_ASK_LIMITS = { SHARED_ASK_VIEWER_HOUR: 20, SHARED_ASK_VIEWER_DAY: 60, SHARED_ASK_SHARE_HOUR: 60, SHARED_ASK_SHARE_DAY: 300 };
export const sharedAskLimits = env => Object.fromEntries(Object.entries(SHARED_ASK_LIMITS).map(([name, fallback]) => {
  const value = String(env?.[name] ?? '').trim();
  return [name, /^\d+$/.test(value) ? Number(value) : fallback];
}));

// Admits a question under every cap and records it, in one atomic insert (the login-link pattern, auth.js): the row
// is the usage event - category, time, viewer, shared board, its owner, whether repository code was in context;
// never the question, the answer or any source - and the rate-limit count. A refusal writes nothing and says which
// limit, as a 429. A share's budget is its board's (learn_boards.id), so a new link does not reset it.
// ponytail: rows are never pruned (the caps read one day); prune or roll up when Usage & Credits takes them over.
async function admitAsk(env, row, viewer, repository) {
  const db = env.LEARN_DB, limits = sharedAskLimits(env), now = Math.floor(Date.now() / 1000);
  const admitted = await db.prepare(`INSERT INTO shared_ask_events (category, asked_at, viewer_email, board_id, owner_email, repository)
    SELECT 'shared_canvas_ask', ?1, ?2, ?3, ?4, ?5
    WHERE (SELECT COUNT(*) FROM shared_ask_events WHERE viewer_email = ?2 AND asked_at > ?1 - 3600) < ?6
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE viewer_email = ?2 AND asked_at > ?1 - 86400) < ?7
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE board_id = ?3 AND asked_at > ?1 - 3600) < ?8
      AND (SELECT COUNT(*) FROM shared_ask_events WHERE board_id = ?3 AND asked_at > ?1 - 86400) < ?9`)
    .bind(now, viewer.email, row.id, row.owner_email, repository ? 1 : 0, limits.SHARED_ASK_VIEWER_HOUR, limits.SHARED_ASK_VIEWER_DAY, limits.SHARED_ASK_SHARE_HOUR, limits.SHARED_ASK_SHARE_DAY).run();
  if (admitted.meta.changes === 1) return null;
  const mine = await db.prepare('SELECT COUNT(*) AS day, COALESCE(SUM(asked_at > ?2 - 3600), 0) AS hour FROM shared_ask_events WHERE viewer_email = ?1 AND asked_at > ?2 - 86400').bind(viewer.email, now).first();
  const error = mine.hour >= limits.SHARED_ASK_VIEWER_HOUR ? `You have asked ${limits.SHARED_ASK_VIEWER_HOUR} questions about shared canvases in the last hour, the limit for now. Try again later.`
    : mine.day >= limits.SHARED_ASK_VIEWER_DAY ? `You have asked ${limits.SHARED_ASK_VIEWER_DAY} questions about shared canvases today, the daily limit. Try again tomorrow.`
    : 'This shared canvas has had as many questions as it can take for now. Try again later, or fork it to keep learning on your own copy.';
  return json({ error, limited: true }, 429);
}

// The model request: Learn chat's answer style and model settings (askStream's research path, LEARN_TASKS.chat,
// Auto), the board's text and sources, and - when the share may read it - the repository at the share's pinned
// commit through the read-only repository tools. No video tools: a shown video writes a moment row. Only `message`
// and `history` come from the request: a model, a command or a file in it is ignored, and a message starting with
// / is a plain question (nothing here dispatches commands).
export async function askShared(env, row, viewer, body) {
  if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > MESSAGE_LIMIT) return json({ error: `Ask a question of 1-${MESSAGE_LIMIT} characters.` }, 400);
  const history = viewerHistory(body.history);
  if (!history) return json({ error: 'history must be a list of { role, content } turns' }, 400);
  if (!env.ANTHROPIC_API_KEY && env.SUBSCRIPTION_ONLY !== 'true') return json({ error: 'Asking is not configured on this server.' }, 503);
  const refused = subscriptionOwnerRefusal(env, viewer);
  if (refused) return refused;
  const db = env.LEARN_DB, state = JSON.parse(row.state_json);
  const canvas = CANVAS.test(row.app) ? await db.prepare('SELECT title FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first() : null;
  const source = await shareSource(db, row);
  const repository = source?.allowed ? source : null;
  const limited = await admitAsk(env, row, viewer, !!repository);
  if (limited) return limited;
  let snapshot = null;
  if (repository) {
    try { snapshot = await repositorySnapshot(env, { id: repository.id }, repository.commit); } catch { /* fail closed: no source, never another commit */ }
  }
  const context = JSON.stringify({
    canvas: sharedTitle(row, canvas?.title, source),
    content: boardText(state),
    sources: boardSources(state),
    ...(repository ? { repository: { repo: repository.repo, commit: repository.commit, ...(snapshot ? {} : { note: "The repository source at this share's pinned commit is not available: answer from the canvas only, say so, and never use another version." }) } } : {}),
  });
  const research = snapshot ? { papers: [], system: REPOSITORY_SYSTEM, tools: REPOSITORY_TOOLS, runTool: async (name, input) => repositoryTool(snapshot, name, input) } : { papers: [] };
  const meta = repository && !snapshot ? { notice: "The repository code at this share's commit could not be read, so this answer uses the canvas only." } : {};
  return askStream(env, context, history, body.message.trim(), null, meta, [], null, null, null, SHARED_CANVAS_SYSTEM, research);
}
