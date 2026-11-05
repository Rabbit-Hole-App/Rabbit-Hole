// /whiteboard assets (roadmap v1 W1.3, section 4.7): the R2 keys of a video and its checkpoints, the captions and transcript writers, the owner-only
// asset route, and the sweep of a failed job's leftovers after 24 h.
//   learn-whiteboard/<org>/<app>/<board>/<artifactId>/{final.mp4, poster.png, contact-sheet.png, captions.vtt, transcript.json, manifest.json}
//   learn-whiteboard/<org>/<app>/<board>/<artifactId>/audio/<scene>-<beat>.mp3          (narrating's checkpoints)
// GET|HEAD /api/learn/whiteboard/assets?app=&workspace=&artifact=&kind=final|poster|captions[&download=1]: the canvas owner only, through
// learn-video.js serveClip (Range, ETag, HEAD, 416, Cache-Control private), with Content-Disposition attachment "<slug>.mp4" on download=1.
import { learnMedia } from './learn-storage.js';
import { serveClip } from './learn-video.js';
import { authorizedBoardApp } from './learn-board.js';
import { WHITEBOARD_LIMITS as L } from './whiteboard-policy.js';

const seg = value => encodeURIComponent(String(value));
export const assetPrefix = job => `learn-whiteboard/${seg(job.owner.org)}/${seg(job.app)}/${seg(job.board)}/${seg(job.artifactId)}/`;
export const assetKey = (job, name) => `${assetPrefix(job)}${name}`;
export const KINDS = Object.freeze({ final: { name: 'final.mp4', type: 'video/mp4' }, poster: { name: 'poster.png', type: 'image/png' }, captions: { name: 'captions.vtt', type: 'text/vtt' } });
export const ORPHAN_MS = 24 * 60 * 60 * 1000;

// The download name: the card title as ASCII, at most 60 characters (roadmap 1.3).
export const fileSlug = title => String(title ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60).trim() || 'whiteboard';

const stamp = seconds => { const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
// One cue per narrated beat, from its start to the end of its audio.
export function captionsVtt(scenes, timing) {
  const narration = new Map(scenes.flatMap(s => s.beats.map(b => [`${s.sceneId}/${b.id}`, b.narration])));
  const cues = timing.beats.filter(t => t.audioFrames > 0).map((t, i) => `${i + 1}\n${stamp(t.startFrame / L.fps)} --> ${stamp((t.startFrame + t.audioFrames) / L.fps)}\n${narration.get(`${t.sceneId}/${t.id}`).replace(/\s*\n\s*/g, ' ')}`);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
export function transcriptOf(scenes, timing) {
  const narration = new Map(scenes.flatMap(s => s.beats.map(b => [`${s.sceneId}/${b.id}`, b.narration])));
  return { schema: 'whiteboard-transcript/1', beats: timing.beats.filter(t => t.audioFrames > 0).map(t => ({ sceneId: t.sceneId, beatId: t.id, start: t.startFrame / L.fps, end: (t.startFrame + t.audioFrames) / L.fps, text: narration.get(`${t.sceneId}/${t.id}`) })) };
}

// A failed job's checkpoints and partial pulls, deleted once it has been over for 24 h. -> objects deleted
export async function sweepOrphans(bucket, job) {
  let deleted = 0, cursor;
  do {
    const page = await bucket.list({ prefix: assetPrefix(job), ...(cursor ? { cursor } : {}) });
    const keys = page.objects.map(o => o.key);
    if (keys.length) { await bucket.delete(keys); deleted += keys.length; }
    cursor = page.truncated ? page.cursor : null;
  } while (cursor);
  return deleted;
}

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// deps.authorize(req, env, app) -> access { org, email, name } | Response (authorizedBoardApp); the job object answers for its owner only.
export async function assetsRoute(req, env, deps = {}) {
  if (!['GET', 'HEAD'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  const url = new URL(req.url), kind = KINDS[url.searchParams.get('kind')], artifactId = url.searchParams.get('artifact');
  if (!kind || !/^wa_[0-9a-f]{32}$/.test(artifactId || '')) return json({ error: 'Not found' }, 404);
  if (url.searchParams.has('workspace')) { const headers = new Headers(req.headers); headers.set('x-small-workspace', url.searchParams.get('workspace')); req = new Request(req, { headers }); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, url.searchParams.get('app'));
  if (access instanceof Response) return access;
  if (!access.email || !access.org) return json({ error: 'Sign in first' }, 401);
  const { results: boards } = await env.LEARN_DB.prepare('SELECT id, app, board FROM learn_boards WHERE app = ? AND org = ? AND owner_email = ?').bind(access.name, access.org, access.email).all();
  for (const board of boards || []) {
    const read = await env.WHITEBOARD_JOBS.get(env.WHITEBOARD_JOBS.idFromName(board.id)).fetch('https://whiteboard/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'result', id: artifactId, payload: {}, board, user: { org: access.org, email: access.email } }) });
    if (!read.ok) continue;
    const { result, title } = await read.json();
    const key = { final: result.keys.mp4, poster: result.keys.poster, captions: result.keys.captions }[url.searchParams.get('kind')];
    const served = await serveClip({ ...env, LEARN_MEDIA: learnMedia(env) }, { storageKey: key, contentType: kind.type }, req);
    if (url.searchParams.get('download') !== '1' || !served.ok) return served;
    const headers = new Headers(served.headers);
    headers.set('Content-Disposition', `attachment; filename="${fileSlug(title)}${kind.name.slice(kind.name.lastIndexOf('.'))}"`);
    return new Response(served.body, { status: served.status, headers });
  }
  return json({ error: 'Not available' }, 404);
}
