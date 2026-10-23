// Publication health (docs/features/creator-analytics-contract.md "Publication health", owner extension 2026-10-23):
// GET /api/analytics/health[?canvas=<name>]. On demand and read-only: what a SIGNED-OUT public viewer meets on the owner's
// public canvases, checked through the public path itself - sharedAccess with no session and the publication token, the
// board as sharedState and redactRepositoryCards give it to nobody in particular, authorizeFileSource through the token.
// The owner opening something proves nothing. Nothing is written or stored; never a permission change, notebook run,
// generation, or paid or model call. External links get one bounded GET to their public page.
import { authorizeFileSource } from './file-access.js';
import { PUBLISHED, sharedAccess } from './learn-boards.js';
import { isUploadedPaperId } from './learn-paper.js';
import { redactRepositoryCards } from './repository-cards.js';
import { repositoryIdentity } from './repositories.js';
import { sharedState } from './shared-privacy.js';
import { HEALTH, finding, healthReport } from '../../web/src/creator-analytics-shape.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const CANVAS = /^canvas-[a-f0-9]{8}$/;
export const MAX_CHECKS = 40, TIMEOUT_MS = 5000, MIN_INTERVAL_MS = 30000;
const UA = 'RabbitHole-PublicationHealth/1 (+https://digrabbithole.com)';
export const publicationHealthRoute = path => path === '/api/analytics/health';
// shortcut: the rate limit is per worker instance (no storage is approved); a shared limit needs a Durable Object or a table.
const lastRun = new Map();

// The external page a public viewer would open for a card, or null when this card has none we check.
function externalOf(block) {
  if (block?.type === 'paper' && typeof block.paper?.id === 'string' && !isUploadedPaperId(block.paper.id)) return { kind: 'paper', id: `paper:${block.paper.id}`, url: `https://arxiv.org/abs/${encodeURIComponent(block.paper.id)}` };
  if (block?.type === 'wiki' && typeof block.title === 'string' && block.title) return { kind: 'wiki', id: `wiki:${block.title}`, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(block.title.replace(/ /g, '_'))}` };
  if (block?.type === 'video' && typeof block.videoId === 'string' && block.videoId) return { kind: 'video', id: `video:${block.videoId}`, url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${block.videoId}`)}` };
  return null;
}
const URL_KEYS = ['url', 'href', 'src', 'link'];
const hasOtherLink = block => URL_KEYS.some(k => typeof block?.[k] === 'string' && /^https?:\/\//i.test(block[k]));
const fileIds = block => [block?.fileRef?.source?.id, ...(Array.isArray(block?.fileRef?.bundle) ? block.fileRef.bundle.map(p => p?.source?.id) : [])].filter(id => typeof id === 'string');

// One external page: 404/410 (a video's oEmbed also 401/403: private or removed) is broken; 5xx, 429 or a timeout is
// temporary; a network error says nothing either way.
async function checkExternal(fetcher, ext, timeoutMs) {
  try {
    const res = await fetcher(ext.url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    res.body?.cancel?.();
    if (res.ok) return null;
    if (res.status === 404 || res.status === 410 || (ext.kind === 'video' && (res.status === 401 || res.status === 403))) {
      return { status: HEALTH.CONFIRMED, problem: ext.kind === 'video' ? `The video is private, removed or not embeddable (YouTube answered ${res.status}).` : `The linked page is gone (${new URL(ext.url).hostname} answered ${res.status}).` };
    }
    if (res.status >= 500 || res.status === 429) return { status: HEALTH.TEMPORARY, problem: `${new URL(ext.url).hostname} answered ${res.status}; try again later.` };
    return { status: HEALTH.INCONCLUSIVE, problem: `${new URL(ext.url).hostname} answered ${res.status}, which does not say whether visitors can open it.` };
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return { status: HEALTH.TEMPORARY, problem: `${new URL(ext.url).hostname} did not answer within ${timeoutMs / 1000} s.` };
    return { status: HEALTH.INCONCLUSIVE, problem: `${new URL(ext.url).hostname} could not be reached from the checker.` };
  }
}

// One canvas as a signed-out visitor: its group of the report.
async function checkCanvas(env, c, { fetcher, timeoutMs, budget, at }) {
  const href = c.project ? `/apps/${c.project}?tab=learn&canvas=${c.canvas}` : `/apps/${c.canvas}`;
  const target = id => ({ canvas: c.canvas, card_id: id, href: id ? `${href}${href.includes('?') ? '&' : '?'}card=${encodeURIComponent(id)}` : href });
  const group = { canvas: c.canvas, title: c.title, checked: 0, unchecked: 0, findings: [] };
  const add = (block, kind, item_id, title, r) => group.findings.push(finding({ canvas: c.canvas, kind, item_id, title, problem: r.problem, status: r.status, checked_at: at, target: target(block?.id ?? null) }));
  const visitor = new Request('https://public-viewer.invalid/', { headers: {} }); // no cookie: signed-out semantics
  let found;
  try { found = await sharedAccess(visitor, env, c.token); } catch { group.checked++; add(null, 'canvas', c.canvas, c.title, { status: HEALTH.TEMPORARY, problem: 'The public link could not be checked; try again.' }); return group; }
  group.checked++;
  if (found instanceof Response) { add(null, 'canvas', c.canvas, c.title, { status: HEALTH.CONFIRMED, problem: `A signed-out visitor cannot open this canvas (the public link answers ${found.status}).` }); return group; }
  const state = sharedState(await redactRepositoryCards(env.LEARN_DB, JSON.parse(found.row.state_json || '{}'), null));
  const jobs = [];
  for (const block of Array.isArray(state?.blocks) ? state.blocks : []) {
    const title = typeof block?.title === 'string' ? block.title.slice(0, 200) : null;
    const ext = externalOf(block), ids = fileIds(block);
    // Facts the public board state already settles, without a request.
    const settled = [
      block?.redacted && ['card', block.id, 'This card shows a repository that is not public, so visitors see an empty card.'],
      block?.type === 'paper' && isUploadedPaperId(block.paper?.id) && ['resource', block.paper.id, 'This uploaded PDF opens only for you; visitors are told it is not available to them.'],
      block?.fileRef && !ids.length && block.fileRef.local && ['resource', block.id, 'This file is only in your browser and was never uploaded, so visitors see no file.'],
    ].filter(Boolean);
    const items = settled.length + ids.length + (ext ? 1 : 0);
    if (!items) { if (hasOtherLink(block)) group.unchecked++; continue; }
    if (budget.left < items) { group.unchecked += items; continue; }
    budget.left -= items; group.checked += items;
    for (const [kind, id, problem] of settled) add(block, kind, id, title ?? block.fileRef?.meta?.name ?? null, { status: HEALTH.CONFIRMED, problem });
    for (const id of ids) jobs.push((async () => {
      let r;
      try { r = await authorizeFileSource(visitor, env, id, { token: c.token }); } catch { add(block, 'resource', id, title, { status: HEALTH.TEMPORARY, problem: 'The file could not be checked; try again.' }); return; }
      if (!(r instanceof Response)) return;
      const stored = await env.LEARN_DB.prepare("SELECT 1 FROM file_sources WHERE id = ? AND status = 'stored'").bind(id).first();
      add(block, 'resource', id, title ?? block.fileRef?.meta?.name ?? null, { status: HEALTH.CONFIRMED, problem: stored ? 'This file opens for you but a signed-out visitor is refused.' : 'This file is no longer stored, so nobody can open it.' });
    })());
    if (ext) jobs.push(checkExternal(fetcher, ext, timeoutMs).then(r => r && add(block, 'resource', ext.id, title, r)));
  }
  await Promise.all(jobs);
  return group;
}

export async function publicationHealthFetch(req, env, { now = Date.now, fetcher = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!env.LEARN_DB) return json({ error: 'Publication health needs the Learn database on this worker.' }, 503);
  const user = await repositoryIdentity(req, env); if (user instanceof Response) return user;
  const canvas = new URL(req.url).searchParams.get('canvas');
  if (canvas !== null && !CANVAS.test(canvas)) return json({ error: 'canvas must be a canvas name such as canvas-0a1b2c3d' }, 400);
  const { results } = await env.LEARN_DB.prepare(`SELECT c.name AS canvas, c.title, c.project, p.token ${PUBLISHED} AND c.owner_email = ? ORDER BY p.published_at DESC, p.rowid DESC`).bind(user.email).all();
  const scope = canvas ? results.filter(r => r.canvas === canvas) : results;
  if (canvas && !scope.length) return json({ error: 'No public canvas of yours by that name' }, 404);
  const t = now(), last = lastRun.get(user.email);
  if (last && t - last < MIN_INTERVAL_MS) return json({ error: 'Checked a moment ago. Try again in a few seconds.' }, 429, { 'Retry-After': String(Math.ceil((MIN_INTERVAL_MS - (t - last)) / 1000)) });
  lastRun.set(user.email, t);
  const at = new Date(t).toISOString(), budget = { left: MAX_CHECKS };
  const groups = [];
  for (const c of scope) groups.push(await checkCanvas(env, c, { fetcher, timeoutMs, budget, at }));
  return json(healthReport({ groups, checked_at: at, canvas }));
}

export const _resetHealthRateLimit = () => lastRun.clear(); // tests only
