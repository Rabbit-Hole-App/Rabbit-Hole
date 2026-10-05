// M5 render stage: a validated Author composition -> one job on the Motion render service (the
// M1 service and sandbox, motion/service) -> its artifacts, validated again on this side -> one
// RenderResult (contracts.js). The service executes untrusted code; this side decides whether
// the result is ready. No model calls, and only an Author `composition` is ever submitted.
//
//   renderComposition({brief, storyboard, author, service, dir, origin}) ->
//     { submitted: false, reason, errors? }      needs_revision, author_invalid, failed, or a source the gate refuses
//     { submitted: true, result: RenderResult }  ready | render_failed | artifact_invalid
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { checkAuthorSource } from './author-check.js';
import { RENDER_ARTIFACTS, RENDER_RESULT_SCHEMA, RENDER_SCHEMA, STAGE, validateRenderRequest, validateRenderResult } from './contracts.js';
import { FONT_PINS, OUTPUT_MAX_BYTES, RemotionRenderer, contactFrames, lumaStddev, probe } from './remotion-renderer.mjs';
import { coverageErrors, coverageFrames, determinismFrames } from './render-coverage.js';
import { motionRenderService } from './service/server.mjs';
import { checkComposition } from './static-check.js';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const secs = ms => +(ms / 1000).toFixed(2);
const firstLine = error => String(error?.message || error).split('\n')[0].slice(0, 300);
// Sorted keys: the same brief or storyboard hashes the same however its file is formatted.
export const canonical = v => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
// Service failures where rendering finished but the output broke the artifact contract.
const ARTIFACT_FAILURES = new Set(['final_validation_failed', 'nondeterministic', 'preview_final_mismatch', 'output_too_large']);

export const renderRequest = (brief, storyboard, output) => ({ schema: RENDER_SCHEMA, renderer: 'remotion', brief, storyboard, composition: { composition_id: output.composition_id, source: output.source } });

export function renderProvenance({ brief, storyboard, source, origin }) {
  return {
    motion_job_id: brief.id, prompt_spec_version: brief.prompt_spec_version,
    brief_sha256: sha256(canonical(brief)), storyboard_sha256: sha256(canonical(storyboard)), composition_sha256: sha256(source),
    source_bytes: Buffer.byteLength(source), source_chars: [...source].length,
    storyboard_origin: origin.storyboard, composition_origin: origin.composition, fonts: { ...FONT_PINS },
  };
}

// The service API (server.mjs): health, submit, poll, artifacts. The token never leaves this object.
export function serviceClient({ url, token, fetchImpl = fetch }) {
  const call = (path, init = {}) => fetchImpl(url + path, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  return {
    url,
    health: () => fetchImpl(`${url}/health`).then(r => r.json()),
    submit: request => call('/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }),
    status: id => call(`/render/${id}`).then(r => r.json()),
    artifact: (id, name) => call(`/render/${id}/artifacts/${name}`),
  };
}

// The same service in this process, on loopback, with the unsandboxed child: the authoring host
// (Windows) path. Acceptance renders run in the Linux sandbox (the deployed dev service).
export async function localService({ timeoutMs, log = () => {} } = {}) {
  const token = randomBytes(24).toString('hex');
  const svc = motionRenderService({ token, sandbox: 'none', timeoutMs, log });
  await new Promise(done => svc.server.listen(0, '127.0.0.1', done));
  const client = serviceClient({ url: `http://127.0.0.1:${svc.server.address().port}`, token });
  return { client, sandbox: 'none', close: () => { svc.stop(); svc.server.close(); } };
}

export function previewChecks({ v, size }, brief) {
  const scale = brief.output_requirements.preview_scale, w = Math.round(STAGE.width * scale), h = Math.round(STAGE.height * scale), frames = brief.duration.seconds * STAGE.fps;
  return [
    ['frame count', Number(v.nb_read_frames) === frames, `${v.nb_read_frames} (want ${frames})`],
    ['fps', v.r_frame_rate === `${STAGE.fps}/1`, v.r_frame_rate],
    ['resolution', v.width === w && v.height === h, `${v.width}x${v.height} (want ${w}x${h}, scale ${scale})`],
    ['codec', v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && v.color_space === 'bt709', `${v.codec_name} ${v.pix_fmt} ${v.color_space}`],
    ['size', size <= OUTPUT_MAX_BYTES, `${size} bytes (cap ${OUTPUT_MAX_BYTES})`],
  ];
}

// The four artifacts as received: final.mp4 through the M1 validator again (decodes every frame,
// the duration / frame / codec / size contract, nonblank at every contact and coverage frame),
// preview.mp4 at its scale, the poster as the determinism check's last frame, one contact tile
// per contact frame.
export async function validateArtifacts({ dir, brief, storyboard, record }) {
  const rows = [];
  const row = (artifact, name, ok, detail) => rows.push({ artifact, name, ok: !!ok, detail: String(detail) });
  let final = null;
  try {
    final = await new RemotionRenderer().validateFinal({ dir, brief, storyboard });
    for (const c of final.checks) row('final.mp4', c.name, c.ok, c.detail);
  } catch (error) { row('final.mp4', 'decodes', false, firstLine(error)); }
  try { for (const [name, ok, detail] of previewChecks(await probe(join(dir, 'preview.mp4')), brief)) row('preview.mp4', name, ok, detail); }
  catch (error) { row('preview.mp4', 'decodes', false, firstLine(error)); }
  const png = (name, fn) => { let img; try { img = PNG.sync.read(readFileSync(join(dir, name))); } catch (error) { return row(name, 'decodes', false, firstLine(error)); } fn(img); };
  png('poster.png', img => {
    row('poster.png', 'resolution', img.width === STAGE.width && img.height === STAGE.height, `${img.width}x${img.height}`);
    row('poster.png', 'nonblank', lumaStddev(img) > 2, `luma stddev ${lumaStddev(img).toFixed(2)}`);
    const last = record.determinism?.frames?.at(-1);
    row('poster.png', 'last frame', last?.frame === brief.duration.seconds * STAGE.fps - 1 && sha256(img.data) === last?.hashes?.[0], `#${last?.frame}: pixels ${sha256(img.data).slice(0, 12)} vs determinism ${String(last?.hashes?.[0]).slice(0, 12)}`);
  });
  png('contact-sheet.png', img => {
    const n = contactFrames(brief, storyboard).length, scale = brief.output_requirements.preview_scale;
    const w = Math.round(STAGE.width * scale), h = Math.round(STAGE.height * scale), rows4 = Math.ceil(n / 4);
    const want = [4 * w + 5 * 16, rows4 * (h + 44) + (rows4 + 1) * 16];
    row('contact-sheet.png', 'tiles', img.width === want[0] && img.height === want[1] && record.contact_sheet?.length === n, `${img.width}x${img.height}, ${record.contact_sheet?.length} tiles (want ${want.join('x')}, ${n} tiles)`);
    row('contact-sheet.png', 'nonblank', lumaStddev(img) > 2, `luma stddev ${lumaStddev(img).toFixed(2)}`);
  });
  const finalRows = rows.filter(r => r.artifact === 'final.mp4'), others = rows.filter(r => r.artifact !== 'final.mp4');
  return { final: { ok: !!final?.ok && finalRows.every(r => r.ok), checks: finalRows, keyframes: final?.keyframe_hashes?.length ?? 0 }, others: { ok: others.every(r => r.ok), checks: others } };
}

// Decoded-pixel determinism, recomputed from the hashes (the service's own flag is not the verdict).
export function judgeDeterminism(record, brief, storyboard) {
  const want = determinismFrames(brief, storyboard), got = record.determinism?.frames || [];
  const errors = [];
  if (JSON.stringify(got.map(f => f.frame)) !== JSON.stringify(want)) errors.push(`frames [${got.map(f => f.frame)}] (want [${want}])`);
  for (const f of got) if (f.hashes?.length !== 2 || !/^[0-9a-f]{64}$/.test(f.hashes[0]) || f.hashes[0] !== f.hashes[1]) errors.push(`#${f.frame}: the two fresh contexts differ`);
  return { ok: !errors.length, method: record.determinism?.method ?? null, frames: got, errors };
}

export function judgeCoverage(record, brief, storyboard, TEXT) {
  const want = coverageFrames(storyboard), obs = record.coverage?.observations || [];
  const errors = [];
  if (JSON.stringify((record.coverage?.frames || []).map(s => s.frame)) !== JSON.stringify(want.map(s => s.frame))) errors.push('the service sampled other frames than the storyboard needs');
  // One probe line per frame: a second line for a frame did not come from the harness probe alone.
  const lines = obs.reduce((m, p) => m.set(p.frame, (m.get(p.frame) || 0) + 1), new Map());
  for (const [frame, n] of lines) if (n > 1) errors.push(`#${frame}: ${n} probe lines (one expected)`);
  errors.push(...coverageErrors(obs, brief, storyboard, TEXT));
  return { ok: !errors.length, frames: want.length, observed: obs.length, errors };
}

export async function renderComposition({ brief, storyboard, author, service, dir, origin, pollMs = 2000, waitMs = 8 * 60 * 1000, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  if (author?.status !== 'composition') return { submitted: false, reason: `the Author result is ${author?.status ?? 'missing'}; only a validated composition is rendered` };
  const request = renderRequest(brief, storyboard, author.output);
  const source = String(request.composition.source || '');
  const contract = checkAuthorSource(source, brief, storyboard);
  const gate = [...validateRenderRequest(request), ...checkComposition(source, { durationSeconds: brief.duration.seconds }), ...contract.errors];
  if (gate.length) return { submitted: false, reason: 'invalid_job', errors: gate };

  const t0 = now();
  const result = {
    schema: RENDER_RESULT_SCHEMA, status: 'render_failed', render_id: null, composition_id: request.composition.composition_id,
    renderer: { name: 'remotion', service_version: (await service.health().catch(() => null))?.version ?? 'unreachable' },
    artifacts: {}, hashes: {}, validation: null, resources: null, timings: {}, provenance: renderProvenance({ brief, storyboard, source, origin }),
  };
  const done = (status, failure) => {
    Object.assign(result, { status }, failure ? { failure } : {});
    result.timings.total_s = secs(now() - t0);
    const errors = validateRenderResult(result);
    if (errors.length) throw new Error(`render-job built an invalid RenderResult: ${errors.join('; ')}`);
    return { submitted: true, result };
  };
  const fail = (status, category, detail, errors) => done(status, { category, detail: String(detail || ''), ...(errors?.length ? { errors: errors.slice(0, 50) } : {}) });

  let res;
  try { res = await service.submit(request); } catch (error) { return fail('render_failed', 'unreachable', firstLine(error)); }
  const accepted = await res.json().catch(() => ({}));
  // Refused before anything ran: invalid_job, busy, degraded, unauthorized, too_large.
  if (res.status !== 202) return fail('render_failed', accepted.error || `http_${res.status}`, accepted.detail || (accepted.errors || []).slice(0, 3).join('; ') || `HTTP ${res.status}`, accepted.errors);
  result.render_id = accepted.render_id;

  let record = null;
  for (const start = now(); ; await sleep(pollMs)) {
    record = await service.status(accepted.render_id).catch(() => null); // a dropped poll is retried until the deadline
    if (record && record.status !== 'rendering') break;
    if (now() - start > waitMs) return fail('render_failed', 'timeout', `the render did not finish within ${secs(waitMs)}s of polling`);
  }
  result.timings.submit_to_finished_s = secs(now() - t0);
  result.timings.service = record.timings ?? null;
  Object.assign(result.renderer, { remotion: record.renderer?.version ?? null, chrome: record.renderer?.chrome ?? null, ffmpeg: record.renderer?.ffmpeg ?? null, sandbox: record.sandbox?.mode ?? null });
  result.resources = { sandbox: record.sandbox ?? null, limits: record.resources ?? null };
  for (const k of ['duration_seconds', 'fps', 'width', 'height']) if (record[k] !== undefined) result[k] = record[k];
  if (record.status !== 'ready') {
    // Rendering finished but the service's own validation refused the output: its artifacts are
    // withheld, and what it observed is still judged here so the failure is never the only fact.
    if (ARTIFACT_FAILURES.has(record.error)) {
      result.validation = { ok: false, final: { ok: !!record.final_validation?.ok, checks: record.final_validation?.checks ?? [] }, coverage: judgeCoverage(record, brief, storyboard, contract.mapping.text), determinism: judgeDeterminism(record, brief, storyboard), preview_final: previewFinalOf(record) };
      return fail('artifact_invalid', record.error, record.detail, record.errors);
    }
    return fail('render_failed', record.error || 'renderer_failure', record.detail, record.errors);
  }

  const t1 = now();
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const missing = [];
  for (const [key, name] of Object.entries(RENDER_ARTIFACTS)) {
    const got = await service.artifact(record.render_id, name).catch(error => ({ ok: false, status: firstLine(error) }));
    const bytes = got.ok ? Buffer.from(await got.arrayBuffer()) : null;
    if (!bytes?.length) { missing.push(`${name}: ${got.ok ? 'empty' : `HTTP ${got.status}`}`); continue; }
    writeFileSync(join(dir, name), bytes);
    Object.assign(result.artifacts, { [key]: name });
    Object.assign(result.hashes, { [key]: sha256(bytes) });
  }
  result.timings.download_s = secs(now() - t1);
  if (missing.length) return fail('artifact_invalid', 'artifact_missing', missing.join('; '));

  const t2 = now();
  const artifacts = await validateArtifacts({ dir, brief, storyboard, record });
  const coverage = judgeCoverage(record, brief, storyboard, contract.mapping.text);
  const determinism = judgeDeterminism(record, brief, storyboard);
  const previewFinal = previewFinalOf(record);
  result.timings.client_validation_s = secs(now() - t2);
  result.validation = {
    ok: artifacts.final.ok && artifacts.others.ok && coverage.ok && determinism.ok && previewFinal.ok,
    final: artifacts.final, artifacts: artifacts.others, coverage, determinism, preview_final: previewFinal,
  };
  if (result.validation.ok) return done('ready');
  const failed = rows => rows.filter(c => !c.ok).map(c => `${c.artifact} ${c.name}: ${c.detail}`);
  const [category, errors] = !artifacts.final.ok ? ['final_invalid', failed(artifacts.final.checks)]
    : !artifacts.others.ok ? [ARTIFACT_CATEGORY[artifacts.others.checks.find(c => !c.ok).artifact], failed(artifacts.others.checks)]
    : !coverage.ok ? ['coverage_failed', coverage.errors]
    : !determinism.ok ? ['nondeterministic', determinism.errors]
    : ['preview_final_mismatch', [`final vs preview mean difference ${previewFinal.max} > ${previewFinal.threshold}`]];
  return fail('artifact_invalid', category, errors.slice(0, 3).join('; '), errors);
}
function previewFinalOf(record) {
  const pf = record.preview_final_comparison;
  return { ok: pf?.ok === true && pf.max <= pf.threshold, max: pf?.max ?? null, threshold: pf?.threshold ?? null };
}
const ARTIFACT_CATEGORY = { 'preview.mp4': 'preview_invalid', 'poster.png': 'poster_invalid', 'contact-sheet.png': 'contact_sheet_invalid' };
