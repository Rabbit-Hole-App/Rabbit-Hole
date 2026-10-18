// Existing FILE_JOBS namespace, separate DO names/protocol. Disabled unless explicitly configured.
// No converter Retry, board mutation, new namespace or monthly/CAD-budget inference.
import { createImageEditJobCoordinator } from './inline-image-edit-job.js';
import { imageEditProvider } from './inline-image-edit-provider.js';
import { admitSpend, settleSpend } from './learn-spend-ledger.js';
import { learnMedia } from './learn-storage.js';
const ID = /^ij_[a-f0-9]{32}$/, SOURCE = /^fs_[a-f0-9]{24}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = () => json({ error: 'Not available' }, 404);
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(n => n.toString(16).padStart(2, '0')).join('');
const enabled = env => env.INLINE_IMAGE_EDIT_ENABLED === 'true' && typeof env.OPENAI_API_KEY === 'string' && env.OPENAI_API_KEY.length > 0 && Number.isFinite(Number(env.INLINE_IMAGE_EDIT_RESERVED_USD)) && Number(env.INLINE_IMAGE_EDIT_RESERVED_USD) > 0;
async function boundedJson(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 16384) { await reader.cancel(); throw new Error('Oversized body'); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
const unavailable = () => json({ error: 'Image editing is not available.', code: 'not_configured' }, 503);
const defaults = {
  identity: async (req, env) => (await import('./repositories.js')).repositoryIdentity(req, env),
  board: async (req, env, body) => {
    const { boardOwner, ownerRow } = await import('./learn-boards.js');
    const owner = await boardOwner(req, env, body.app);
    if (owner instanceof Response) return owner;
    return { owner, row: await ownerRow(env, owner, body.app, body.board || 'main') };
  },
  source: async (req, env, id, row) => (await import('./file-access.js')).authorizeFileSource(req, env, id, { row }),
};
const stubFor = (env, id) => env.FILE_JOBS.get(env.FILE_JOBS.idFromName(`image-edit:${id}`));
const call = (env, id, action, body) => stubFor(env, id).fetch(new Request(`https://image-job.internal/image-edit/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const editableImage = card => card && (card.type === 'image' || card.type === 'file' && card.kind === 'image') && !card.locked && !card.sources?.length && !card.citations?.length && !card.references?.length;
const sourceBinding = source => ({ id: source.id, sha256: source.sha256, bytes: source.bytes, r2_key: source.r2_key });
const publicJob = job => job && ({ id: job.id, phase: job.phase, cancelRequested: job.cancelRequested, reason: job.reason || null, artifactId: job.phase === 'ready' ? job.artifactId : null, reservation: job.reservation, sourceSha256: job.request.sourceSha256 });

export async function inlineImageJobsRoute(path, req, env, dependencies = defaults) {
  const submit = path === '/api/learn/files/image-edits';
  const match = path.match(/^\/api\/learn\/files\/image-edits\/(ij_[a-f0-9]{32})(?:\/(cancel))?$/);
  if (!submit && !match) return null;
  if (!env.LEARN_DB || !env.FILE_JOBS || !learnMedia(env)) return unavailable();
  if (submit) {
    if (req.method === 'GET') {
      const user = await dependencies.identity(req, env);
      if (user instanceof Response) return user;
      const available = enabled(env);
      return json({ available, maximumReservedUsd: available ? Number(env.INLINE_IMAGE_EDIT_RESERVED_USD) : null, model: available ? 'gpt-image-2.5-sunburst-2026-09-08' : null });
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!enabled(env)) return unavailable();
    let body; try { body = await boundedJson(req); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || !['remove_background', 'edit_image'].includes(body.operation) || !SOURCE.test(body.sourceId || '') || typeof body.app !== 'string' || !body.app || body.app.length > 200 || (body.board != null && (typeof body.board !== 'string' || body.board.length > 200)) || typeof body.cardId !== 'string' || body.cardId.length > 200 || !/^[A-Za-z0-9_.:-]{8,128}$/.test(body.idempotencyKey || '') || body.paidConfirmation !== true) return json({ error: 'A confirmed, bounded image request is required.' }, 400);
    if (body.operation === 'edit_image' ? !SOURCE.test(body.maskSourceId || '') || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 2000 : body.maskSourceId != null || body.prompt != null) return json({ error: 'Invalid image operation inputs.' }, 400);
    if (typeof body.maxReservedUsd !== 'number' || !Number.isFinite(body.maxReservedUsd) || body.maxReservedUsd <= 0 || Number(env.INLINE_IMAGE_EDIT_RESERVED_USD) > body.maxReservedUsd) return json({ error: 'The configured reservation exceeds the approved amount.', code: 'consent_bound' }, 409);
    const scope = await dependencies.board(req, env, body);
    if (scope instanceof Response) return scope;
    if (!scope?.row || !scope.owner?.org || !scope.owner?.email) return denied();
    const blocks = JSON.parse(scope.row.state_json || '{}').blocks || [];
    const card = blocks.find(entry => entry.id === body.cardId);
    if (!editableImage(card) || card.fileRef?.source?.id !== body.sourceId) return denied();
    const access = await dependencies.source(req, env, body.sourceId, scope.row);
    if (access instanceof Response) return access;
    if (access.source.media_type !== 'image/png' || access.source.bytes > 5 * 1024 * 1024 || card.fileRef.source.rev !== access.source.sha256) return json({ error: 'A current normalized PNG source is required.' }, 409);
    let mask;
    if (body.maskSourceId) {
      // An unsaved mask may be owned by the requester but not referenced on the board yet.
      const owned = await env.LEARN_DB.prepare("SELECT * FROM file_sources WHERE id = ? AND org = ? AND owner_email = ? AND status = 'stored'").bind(body.maskSourceId, scope.owner.org, scope.owner.email).first();
      if (!owned || owned.media_type !== 'image/png' || owned.bytes >= 4 * 1024 * 1024) return denied();
      mask = sourceBinding(owned);
    }
    const id = `ij_${(await sha(JSON.stringify([scope.owner.org, scope.owner.email, body.idempotencyKey]))).slice(0, 32)}`;
    const context = { org: scope.owner.org, email: scope.owner.email, boardId: scope.row.id, app: body.app, board: body.board || 'main', cardId: body.cardId, source: sourceBinding(access.source), ...(mask ? { mask } : {}) };
    return call(env, id, 'create', { id, context, request: { id, operation: body.operation, sourceSha256: context.source.sha256, ...(mask ? { maskSha256: mask.sha256, prompt: body.prompt } : {}), reservedUsd: Number(env.INLINE_IMAGE_EDIT_RESERVED_USD) } });
  }
  const [, id, action] = match;
  if (req.method !== (action ? 'POST' : 'GET')) return json({ error: 'Method not allowed' }, 405);
  const user = await dependencies.identity(req, env);
  if (user instanceof Response) return user;
  return call(env, id, action || 'status', { id, identity: { org: user.org, email: user.email } });
}

const controllers = new WeakMap();
function coordinator(state, env, dependencies = {}) {
  if (!controllers.has(state)) controllers.set(state, (async () => {
    const context = await state.storage.get('image:context');
    if (!context) throw new Error('Image job context missing');
    return createImageEditJobCoordinator({
      storage: state.storage,
      admitSpend: options => (dependencies.admitSpend || admitSpend)(env.LEARN_DB, env, { ...options, userId: context.email, org: context.org }),
      settleSpend: (id, options) => (dependencies.settleSpend || settleSpend)(env.LEARN_DB, id, options),
      edit: dependencies.edit || (input => imageEditProvider({ apiKey: env.OPENAI_API_KEY }).edit(input)),
      publish: dependencies.publish || (async ({ jobId, sha256, result }) => {
        const sourceId = `fs_${(await sha(`image-edit-output:${jobId}`)).slice(0, 24)}`;
        const key = `file-sources/${sourceId}/original/${sha256}`;
        const old = await env.LEARN_DB.prepare('SELECT * FROM file_sources WHERE id = ?').bind(sourceId).first();
        if (old) {
          if (old.org !== context.org || old.owner_email !== context.email || old.sha256 !== sha256 || old.status !== 'stored') throw new Error('Image publication conflict');
          return { id: sourceId };
        }
        await learnMedia(env).put(key, result.bytes, { httpMetadata: { contentType: 'image/png' }, sha256 });
        await env.LEARN_DB.prepare("INSERT INTO file_sources (id, org, owner_email, app, board_id, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at, stored_at) VALUES (?, ?, ?, ?, ?, 'image', 'edited-image.png', 'image/png', 'image/png', ?, ?, ?, 'stored', ?, ?)").bind(sourceId, context.org, context.email, context.app, context.boardId, result.bytes.length, sha256, key, Date.now(), Date.now()).run();
        return { id: sourceId };
      }),
    });
  })());
  return controllers.get(state);
}

export async function imageJobFetch(state, env, req, dependencies) {
  const action = new URL(req.url).pathname.replace('/image-edit/', '');
  let body; try { body = await boundedJson(req); } catch { return json({ error: 'Invalid job request' }, 400); }
  if (!ID.test(body?.id || '')) return denied();
  if (action === 'create') {
    if (!enabled(env)) return unavailable();
    if (body.request?.id !== body.id || !body.context?.org || !body.context?.email || !body.context?.source?.id) return denied();
    const conflict = await state.storage.transaction(async tx => {
      const old = await tx.get('image:context'), id = await tx.get('image:id');
      if ((id && id !== body.id) || (old && JSON.stringify(old) !== JSON.stringify(body.context))) return true;
      await tx.put('image:context', body.context);
      await tx.put('image:id', body.id);
      return false;
    });
    if (conflict) return json({ error: 'Job binding conflict' }, 409);
    try {
      const job = await (await coordinator(state, env, dependencies)).create(body.request);
      await state.storage.put('image:id', body.id);
      if (job.phase === 'queued') await state.storage.setAlarm(Date.now() + 50);
      return json({ job: publicJob(job) }, 201);
    } catch (error) { return json({ error: 'Invalid or conflicting image job' }, error.code === 'conflict' ? 409 : 400); }
  }
  const context = await state.storage.get('image:context');
  if (await state.storage.get('image:id') !== body.id || !context || context.org !== body.identity?.org || context.email !== body.identity?.email) return denied();
  const control = await coordinator(state, env, dependencies);
  const job = action === 'cancel' ? await control.cancel(body.id) : action === 'status' ? await control.get(body.id) : null;
  return job ? json({ job: publicJob(job) }) : denied();
}

export async function imageJobAlarm(state, env, dependencies) {
  const id = await state.storage.get('image:id');
  if (!id) return false;
  const control = await coordinator(state, env, dependencies), job = await control.get(id);
  if (!job) return true;
  if (job.phase !== 'queued') { if (['admitting', 'started', 'publishing'].includes(job.phase)) await control.run(id, {}); return true; }
  if (!enabled(env)) { await control.cancel(id); return true; }
  const context = await state.storage.get('image:context');
  const board = await env.LEARN_DB.prepare('SELECT * FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(context.boardId, context.org, context.email).first();
  const card = board && (JSON.parse(board.state_json || '{}').blocks || []).find(entry => entry.id === context.cardId);
  if (!editableImage(card) || card.fileRef?.source?.id !== context.source.id || card.fileRef.source.rev !== context.source.sha256) { await control.cancel(id); return true; }
  async function load(binding, mask = false) {
    const source = await env.LEARN_DB.prepare("SELECT * FROM file_sources WHERE id = ? AND status = 'stored'").bind(binding.id).first();
    if (!source || source.sha256 !== binding.sha256 || source.r2_key !== binding.r2_key || source.bytes !== binding.bytes) throw new Error('Source revision changed');
    const owner = source.org === context.org && source.owner_email === context.email;
    const referenced = !mask && await env.LEARN_DB.prepare('SELECT 1 FROM file_source_refs WHERE source_id = ? AND board_id = ?').bind(binding.id, context.boardId).first();
    if (!owner && !referenced) throw new Error('Source access revoked');
    const object = await learnMedia(env).get(binding.r2_key);
    if (!object || object.size !== binding.bytes || object.size > (mask ? 4 : 5) * 1024 * 1024) throw new Error('Source bytes unavailable');
    return new Uint8Array(await object.arrayBuffer());
  }
  // Persist recovery before any admission; a crashed attempt becomes unknown, never retried.
  await state.storage.setAlarm(Date.now() + 180000);
  try { await control.run(id, { image: await load(context.source), ...(context.mask ? { mask: await load(context.mask, true) } : {}) }); }
  catch { await control.cancel(id); } // No automatic retry, including inaccessible source or uncertain storage.
  return true; // Keep terminal/unknown evidence; never legacy deleteAll.
}
