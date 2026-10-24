// Bug reports and feature ideas from the feedback button - the Learn canvas's,
// or the sidebar's on Home, Library and Explore, where there is no app
// (docs/features/learn-feedback.md). One JSON object per report in Learn
// media storage (learn-storage.js: the dev bucket on dev and review), with who
// sent it and where from. No schema change.
import { authorizedBoardApp } from './learn-board.js';
import { learnMedia } from './learn-storage.js';
import { repositoryIdentity } from './repositories.js';
import { devIdentity } from './dev-forwarding.js';
import { makeEvent, routeTemplate } from './telemetry-contract.js';
import { emitTelemetry } from './telemetry-delivery.js';

const KINDS = ['bug', 'idea'];

// The reference a person can quote to support: RH-XXXX-XXXX in Crockford base 32 (no I, L, O or U), 40 bits from the platform's
// random source. It names the report in the owner dashboard (telemetry.md "Browser errors"); it grants nothing.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function supportRef(random = crypto) {
  const bytes = random.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, byte => ALPHABET[byte & 31]);
  return `RH-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
// The page's latest client-error fingerprints and failed-request trace ids (client-telemetry.js diagnostics()): hex ids only,
// at most five of each, anything else dropped. Never text.
const diagnosticsOf = value => {
  const pick = (list, pattern) => (Array.isArray(list) ? list.filter(item => typeof item === 'string' && pattern.test(item)).slice(0, 5) : []);
  const fingerprints = pick(value?.fingerprints, /^[0-9a-f]{16}$/), traces = pick(value?.traces, /^[0-9a-f]{16}$/);
  return fingerprints.length || traces.length ? { fingerprints, traces } : null;
};

export function validateFeedback(body) {
  if (!body || !KINDS.includes(body.kind)) throw Error('Choose Bug or Idea');
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2000) throw Error('Describe it in 1 to 2000 characters');
  const context = body.context && typeof body.context === 'object' ? body.context : {};
  const short = value => (typeof value === 'string' ? value.slice(0, 300) : null);
  const diagnostics = diagnosticsOf(body.diagnostics);
  return { kind: body.kind, text, context: { board: short(context.board), path: short(context.path), viewport: short(context.viewport), userAgent: short(context.userAgent) }, ...(diagnostics ? { diagnostics } : {}) };
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
  const at = new Date().toISOString(), id = crypto.randomUUID(), ref = supportRef();
  // ponytail: no rate limit; add one if the button is ever abused.
  await media.put(`learn-feedback/${at.slice(0, 10)}/${at}-${id}.json`, JSON.stringify({ id, ref, at, app: body.app ?? null, org: access.org, email: access.email, ...report }), { httpMetadata: { contentType: 'application/json' } });
  // The reference joins the report to what the page saw before it (a support.report event). Best effort: the report is already kept.
  const userId = access.userId ?? access.user_id ?? await Promise.resolve(devIdentity(req, env)).then(who => (who instanceof Response ? null : who?.userId ?? null), () => null);
  await emitTelemetry(env, makeEvent('support.report', { feature: 'feedback', ...(userId ? { user_ref: userId } : {}),
    payload: { ref, kind: report.kind, ...(report.context.path ? { route: routeTemplate(report.context.path) } : {}), ...(report.diagnostics || {}) } }, { service: 'app_worker' }));
  return json({ id, ref }, 201);
}
