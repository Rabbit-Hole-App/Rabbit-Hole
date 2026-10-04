// A viewer's question about a shared canvas: POST /api/learn/boards/shared/:token/ask
// (docs/features/shared-canvas-ask.md). The answer streams back to that viewer only, and nothing is written -
// no thread, no message, no moment row, nothing on the owner's board. The viewer's conversation lives in
// their browser and comes back as `history`. Everything else the model reads is built here from the shared row.
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

// The project a shared board belongs to: a repo-* board itself, or a canvas's project - read as the owner's
// row. { id, repo, commit } or null; the id never leaves the server.
export async function sharedRepository(db, row) {
  const name = row.app.startsWith('repo-') ? row.app
    : CANVAS.test(row.app) ? (await db.prepare('SELECT project FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first())?.project : null;
  if (!name) return null;
  const repo = await db.prepare('SELECT id, repo, commit_sha FROM repository_apps WHERE org = ? AND name = ? AND owner_email = ?').bind(row.org, name, row.owner_email).first();
  return repo?.commit_sha ? { id: repo.id, repo: repo.repo, commit: repo.commit_sha } : null;
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

// The model request: Learn chat's answer style and model settings (askStream's research path, LEARN_TASKS.chat,
// Auto), the board's text and sources, and the repository at the shared commit through the read-only
// repository tools. No video tools: a shown video writes a moment row. Nothing is stored when it finishes.
export async function askShared(env, row, viewer, body) {
  if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > MESSAGE_LIMIT) return json({ error: `Ask a question of 1-${MESSAGE_LIMIT} characters.` }, 400);
  const history = viewerHistory(body.history);
  if (!history) return json({ error: 'history must be a list of { role, content } turns' }, 400);
  if (!env.ANTHROPIC_API_KEY && env.SUBSCRIPTION_ONLY !== 'true') return json({ error: 'Asking is not configured on this server.' }, 503);
  // ponytail: Learn asks have no per-user usage limit yet - only the dev subscription's owner gate below - so any
  // signed-in account with a link asks on the platform key. Meter here when usage/credits lands.
  const refused = subscriptionOwnerRefusal(env, viewer);
  if (refused) return refused;
  const db = env.LEARN_DB, state = JSON.parse(row.state_json);
  const canvas = CANVAS.test(row.app) ? await db.prepare('SELECT title FROM canvases WHERE org = ? AND name = ?').bind(row.org, row.app).first() : null;
  const repository = await sharedRepository(db, row);
  let snapshot = null;
  if (repository) {
    try { snapshot = await repositorySnapshot(env, { id: repository.id }, repository.commit); } catch { /* answered without the source; the context says so */ }
  }
  const context = JSON.stringify({
    canvas: canvas?.title || row.title || (row.board === 'main' ? row.app : row.board),
    content: boardText(state),
    sources: boardSources(state),
    ...(repository ? { repository: { repo: repository.repo, commit: repository.commit, ...(snapshot ? {} : { note: 'The repository source is not available right now: answer without it and say so.' }) } } : {}),
  });
  const research = snapshot ? { papers: [], system: REPOSITORY_SYSTEM, tools: REPOSITORY_TOOLS, runTool: async (name, input) => repositoryTool(snapshot, name, input) } : { papers: [] };
  return askStream(env, context, history, body.message.trim(), null, {}, [], null, null, null, SHARED_CANVAS_SYSTEM, research);
}
