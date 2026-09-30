// Bug reports and feature ideas from the feedback button - the Learn canvas's,
// or the sidebar's on Home, Library and Explore, where there is no app
// (docs/features/learn-feedback.md). One JSON object per report in Learn
// media storage (learn-storage.js: the dev bucket on dev and review), with who
// sent it and where from. No schema change.
import { authorizedBoardApp } from './learn-board.js';
import { learnMedia } from './learn-storage.js';
import { repositoryIdentity } from './repositories.js';

const KINDS = ['bug', 'idea'];

export function validateFeedback(body) {
  if (!body || !KINDS.includes(body.kind)) throw Error('Choose Bug or Idea');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) throw Error('Describe it in 1 to 2000 characters');
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const short = value => (typeof value === 'string' ? value.slice(0, 300) : null);
  return { kind: body.kind, text, context: { board: short(context.board), path: short(context.path), viewport: short(context.viewport), userAgent: short(context.userAgent) } };
}

export async function feedbackFetch(req, env) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body, report;
  try { body = await req.json(); report = validateFeedback(body); } catch (error) { return json({ error: error.message || 'Invalid feedback' }, 400); }
  // With an app, the same access check as every Learn route; without one
  // (Home, Library, Explore), a signed-in workspace member.
  const access = body.app == null ? await repositoryIdentity(req, env) : await authorizedBoardApp(req, env, body.app);
  if (access instanceof Response) return access;
  const media = learnMedia(env);
  if (!media) return json({ error: 'Feedback storage is not configured here.' }, 503);
  const at = new Date().toISOString(), id = crypto.randomUUID();
  // ponytail: no rate limit; add one if the button is ever abused.
  await media.put(`learn-feedback/${at.slice(0, 10)}/${at}-${id}.json`, JSON.stringify({ id, at, app: body.app ?? null, org: access.org, email: access.email, ...report }), { httpMetadata: { contentType: 'application/json' } });
  return json({ id }, 201);
}
