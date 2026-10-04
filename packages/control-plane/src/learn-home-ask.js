// POST /api/learn/home-ask (docs/features/home-ask.md): a question asked on Home, answered in place from the
// signed-in user's own Rabbit Hole data - their projects, canvases and Rabbit Holes in LEARN_DB. It replaces the
// old apps agent (/api/ask), which knows nothing of projects and canvases. It never creates anything: starting a
// Rabbit Hole stays the composer's explicit learning request (agent/router.js) or the answer's offer button.
import { repositoryIdentity } from './repositories.js';
import { anthropic } from './ask.js';
import { LEARN_TASKS, loggedModel } from './learn-models.js';

export const HOME_ASK_MODEL = LEARN_TASKS.home_ask.model;
const MAX_TOKENS = LEARN_TASKS.home_ask.maxTokens;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Everything Home may name for this user, and nothing else: every query is bound to the caller's org and email.
export async function homeLibrary(db, user) {
  const bind = sql => db.prepare(sql).bind(user.org, user.email);
  const [repos, canvases, holes] = await Promise.all([
    bind('SELECT name, repo, status, created_at FROM repository_apps WHERE org=? AND owner_email=? ORDER BY created_at DESC LIMIT 200').all(),
    bind('SELECT name, title, project, created_at FROM canvases WHERE org=? AND owner_email=? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 300').all(),
    bind('SELECT child, parent_app FROM canvas_dives WHERE org=? AND owner_email=? LIMIT 300').all(),
  ]);
  const parentOf = new Map((holes.results || []).map(row => [row.child, row.parent_app]));
  return [
    ...(repos.results || []).map(row => ({ name: row.name, kind: 'project', title: row.repo, status: row.status, created: row.created_at })),
    ...(canvases.results || []).map(row => ({ name: row.name, kind: parentOf.has(row.name) ? 'rabbit_hole' : 'canvas', title: row.title || 'Untitled canvas',
      ...(row.project ? { project: row.project } : {}), ...(parentOf.has(row.name) ? { under: parentOf.get(row.name) } : {}), created: row.created_at })),
  ];
}

const SYSTEM = `You answer questions on the Home page of Rabbit Hole, a learning app. The user's library is given as JSON: their projects (code repositories), canvases and Rabbit Holes (canvases nested under another), each with a "name" (its id) and "title".
Rules:
- For anything about the user's own library (what they have, where they learned something, which canvas covers a topic), answer ONLY from that JSON. Never invent a project, canvas or Rabbit Hole. If nothing matches, say plainly that you did not find one.
- A general question (what is softmax, explain attention) gets a short, direct answer of a few sentences.
- Reply with one JSON object and nothing else: {"answer": string (markdown), "references": [names from the library you mention, at most 5], "offer_rabbit_hole": boolean (true when the question is a learnable topic the user could go deeper into)}.`;

export function homeAskRequest(message, library) {
  return {
    max_tokens: MAX_TOKENS,
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Library: ${JSON.stringify(library)}\n\nQuestion: ${message}` }],
  };
}

// The model's reply, kept to what the library holds: a reference that names nothing there is dropped, never linked.
export function readHomeAnswer(text, library) {
  let parsed = null;
  try { parsed = JSON.parse(String(text).match(/\{[\s\S]*\}/)?.[0] || ''); } catch { parsed = null; }
  const answer = typeof parsed?.answer === 'string' && parsed.answer.trim() ? parsed.answer.trim() : String(text || '').trim();
  const known = new Map(library.map(item => [item.name, item]));
  const references = [...new Set(Array.isArray(parsed?.references) ? parsed.references : [])]
    .filter(name => known.has(name)).slice(0, 5)
    .map(name => { const item = known.get(name); return { name, kind: item.kind, title: item.title }; });
  return { answer, references, offer_rabbit_hole: parsed?.offer_rabbit_hole === true };
}

export async function homeAskFetch(req, env, { identity = repositoryIdentity, callModel = loggedModel('home_ask', anthropic) } = {}) {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 2000) return json({ error: 'message must be 1-2000 characters' }, 400);
  const user = await identity(req, env);
  if (user instanceof Response) return user;
  if (!env.LEARN_DB) return json({ error: 'Home answers are not configured on this server.' }, 503);
  if (!env.ANTHROPIC_API_KEY && env.SUBSCRIPTION_ONLY !== 'true') return json({ error: 'Home answers are not configured on this server.' }, 503);
  const library = await homeLibrary(env.LEARN_DB, user);
  const response = await callModel(env, homeAskRequest(message, library), HOME_ASK_MODEL, null);
  if (!response.ok) return json({ error: 'Could not answer right now. Try again.' }, 502);
  const result = await response.json();
  const text = (result.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
  return json(readHomeAnswer(text, library));
}
