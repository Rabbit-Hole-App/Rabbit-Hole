// /animation review render (AN-05; plan section 7): bounded sample captures of a validated candidate through the existing Browser
// Rendering seam (env.BROWSER, explain-render.js launchBrowser), never a new rendering service. Up to 2 views x 3 parameter/time/event
// states per review round (ANIMATION_LIMITS.render), each a PNG of the real scene plus its execution trace.
//
// The capture page is the review entry served from this Worker's own assets (ANIMATION_RENDER_ENTRY, built with the app and drawn by
// the animation3d renderer and runtime, lane R; P integrates it). Inert by construction, as /explain's: request interception serves
// only that entry, its hashed /static/ files and the page's own blob: worker, and aborts everything else, so the page has no network,
// cookies or session. There is no URL token: the ONE candidate goes in through page.evaluate, never in a URL, and every capture must
// echo that candidate's artifact hash and exactly the requested events, or it is not reviewed. No generated URL is ever navigated to.
// A deployment without the capture binding or the assets is an explicit structured blocker at rendering (Retry rendering keeps the
// validated artifact); it is never a review pass.
import { RENDER_LIMITS, RENDER_ORIGIN, RenderError, launchBrowser } from './explain-render.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';
import { resolveAnimationInputs } from '../../web/src/animation3d/contract.js';
import { ANIMATION_LIMITS } from './animation-policy.js';
import { learnMedia } from './learn-storage.js';
import { ANIMATION_REVIEW_LIMITS } from './animation-review.js';

export const ANIMATION_RENDER_ENTRY = '/render/animation3d.html';
// Loop sample times as fractions of the duration, chosen so a motion repeating k = 1..12 times per loop is never back at the same phase:
// every k x fraction (and k x their difference) is at least 0.076 of a cycle from a whole number. Simple fractions (1/2, 1/3) alias:
// a 12 s loop with 3 turns sampled at 0, 4 and 8 s looked still (accept-2, 2026-10-30).
export const LOOP_FRACTIONS = Object.freeze([0.538, 0.769]);
export const ANIMATION_CAPTURE = Object.freeze({ width: 960, height: 540, dpr: 1, theme: 'light', maxEvents: 4, maxTicks: 90, traceKeys: ['inputs', 'time', 'events', 'ticks', 'readouts', 'goal', 'selection', 'stateHash'] });

const blocker = (code, message) => Object.assign(new Error(message), { status: 503, code, category: 'renderer' });

// The two views: the artifact's own camera, and that camera orbited SIDE_VIEW about its own target (55 degrees round, 15 degrees higher,
// same distance and field of view), so the review checks a nearby angle of what the learner sees. A quarter turn (the earlier second
// view) saw a planar drivetrain edge-on and failed a good scene twice (accept-8).
export const SIDE_VIEW = Object.freeze({ azimuthDeg: 55, elevationDeg: 15, maxElevationDeg: 75 });
export function captureViews(artifact) {
  const { position, target, fov = 50 } = artifact.camera, [tx, ty, tz] = target;
  const [dx, dy, dz] = position.map((v, i) => v - target[i]), r = Math.hypot(dx, dy, dz), rad = Math.PI / 180;
  const az = Math.atan2(dx, dz) + SIDE_VIEW.azimuthDeg * rad;
  const el = Math.min(SIDE_VIEW.maxElevationDeg * rad, Math.max(-SIDE_VIEW.maxElevationDeg * rad, Math.atan2(dy, Math.hypot(dx, dz)) + SIDE_VIEW.elevationDeg * rad));
  const round = v => Number(v.toFixed(4));
  const side = [tx + r * Math.cos(el) * Math.sin(az), ty + r * Math.sin(el), tz + r * Math.cos(el) * Math.cos(az)].map(round);
  return [{ name: 'default', position: [...position], target: [...target], fov }, { name: 'side', position: side, target: [...target], fov }].slice(0, ANIMATION_LIMITS.render.views);
}
const lowOf = p => (p.type === 'number' ? p.min : p.type === 'toggle' ? !p.default : p.options[0].value);
const highOf = p => (p.type === 'number' ? p.max : p.type === 'toggle' ? !p.default : p.options.at(-1).value);
// The states sampled, in priority order, at most ANIMATION_LIMITS.render.states; the rest are listed as omitted (never claimed).
//   timeline: the start, a third and two thirds of the loop at the defaults;
//   parameters: the defaults, every parameter at its low end, every parameter at its high end (mid-loop when there is a timeline);
//   actions, selectable or draggable nodes: the initial state, one action, then a short sequence (bounded events);
//   stepped: the same with the host's steps advanced (bounded ticks).
export function captureStates(artifact) {
  const inputs = resolveAnimationInputs(artifact, {}), d = artifact.timeline?.duration ?? 0, mid = Number((d * LOOP_FRACTIONS[0]).toFixed(3));
  const at = (label, extra = {}) => ({ label, inputs, time: 0, events: [], ticks: 0, ...extra });
  const out = [at('initial')];
  const actions = artifact.actions || [], nodes = artifact.scene.nodes, pick = nodes.find(n => n.selectable), drag = nodes.find(n => n.drag);
  const events = [...actions.map(a => ({ type: 'action', action: a.id })), ...(pick ? [{ type: 'select', node: pick.id }] : []), ...(drag ? [{ type: 'drag_start', node: drag.id, value: drag.drag.min }, { type: 'drag_move', node: drag.id, value: drag.drag.max }, { type: 'drag_end', node: drag.id, value: drag.drag.max }] : [])];
  const ticks = artifact.stepped ? 30 : 0;
  if (events.length) {
    out.push(at(`${events[0].type} ${events[0].action ?? events[0].node}`, { events: events.slice(0, 1), ticks }));
    const run = Array.from({ length: ANIMATION_CAPTURE.maxEvents }, (_, i) => events[i % events.length]);
    out.push(at(`sequence of ${run.length} events`, { events: run, ticks: Math.min(ANIMATION_CAPTURE.maxTicks, ticks * 3) }));
  }
  if (artifact.parameters.length) {
    const low = Object.fromEntries(artifact.parameters.map(p => [p.id, lowOf(p)])), high = Object.fromEntries(artifact.parameters.map(p => [p.id, highOf(p)]));
    out.push(at('every parameter at its low end', { inputs: { ...inputs, ...low }, time: mid }), at('every parameter at its high end', { inputs: { ...inputs, ...high }, time: mid }));
  }
  if (d) out.push(...LOOP_FRACTIONS.map(f => at(`${Math.round(f * 100)}% of the loop`, { time: Number((d * f).toFixed(3)) })));
  const seen = new Set(), unique = out.filter(s => { const k = canonicalJson([s.inputs, s.time, s.events, s.ticks]); if (seen.has(k)) return false; seen.add(k); return true; });
  return { sampled: unique.slice(0, ANIMATION_LIMITS.render.states), omitted: unique.slice(ANIMATION_LIMITS.render.states).map(s => s.label) };
}

// The round's manifest: every view x every sampled state, light theme, one fixed size. -> { entries, coverage }
export function captureManifest(artifact) {
  const views = captureViews(artifact), { sampled, omitted } = captureStates(artifact);
  const entries = views.flatMap((view, v) => sampled.map((state, s) => ({ id: `v${v}-s${s}`, view, label: state.label, inputs: state.inputs, time: state.time, events: state.events, ticks: state.ticks,
    seed: artifact.seed, theme: ANIMATION_CAPTURE.theme, width: ANIMATION_CAPTURE.width, height: ANIMATION_CAPTURE.height, dpr: ANIMATION_CAPTURE.dpr })));
  if (entries.length > ANIMATION_LIMITS.render.capturesPerRound) throw new RenderError('over_budget', `${entries.length} captures, over ${ANIMATION_LIMITS.render.capturesPerRound}`);
  return { entries, coverage: { views: views.map(v => v.name), sampled: sampled.map(s => ({ label: s.label, time: s.time, events: s.events.length, ticks: s.ticks })), omitted } };
}

// Only the entry, its hashed build assets and the page's own blob: worker; nothing else may load.
export const allowedAsset = url => url.origin === RENDER_ORIGIN && !url.search && (url.pathname === ANIMATION_RENDER_ENTRY || /^\/static\/[A-Za-z0-9._-]+\.(js|css|woff2?|ttf|wasm)$/.test(url.pathname));
export function interceptor(assets, log) {
  return async request => {
    let url;
    try { url = new URL(request.url()); } catch { url = null; }
    if (url && url.protocol === 'blob:' && url.origin === RENDER_ORIGIN) { log.served.push('blob:worker'); return request.continue(); }
    if (!url || !allowedAsset(url)) { log.blocked.push(request.url()); return request.abort('blockedbyclient'); }
    const response = await assets.fetch(new Request(url.href));
    if (!response.ok) { log.blocked.push(request.url()); return request.abort('failed'); }
    log.served.push(url.pathname);
    return request.respond({ status: 200, headers: { 'content-type': url.pathname.endsWith('.wasm') ? 'application/wasm' : response.headers.get('content-type') || 'application/octet-stream' }, body: new Uint8Array(await response.arrayBuffer()) });
  };
}
const within = (ms, promise, code) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new RenderError(code, `render timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer)); };
const closeWithin = (ms, closing) => { let timer; return Promise.race([Promise.resolve(closing).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, ms); })]).finally(() => clearTimeout(timer)); };
const traceOf = trace => Object.fromEntries(ANIMATION_CAPTURE.traceKeys.filter(k => trace?.[k] !== undefined).map(k => [k, trace[k]]));

// renderAnimation(env, { artifact, artifactHash }, manifest, deps) -> { captures: [{ ..., png, sha256, key? }], requests }
// deps.launch(env) or deps.browser: a puppeteer-shaped browser (tests); deps.store(key, png): defaults to LEARN_MEDIA.
export async function renderAnimation(env, candidate, manifest, deps = {}) {
  const limits = { ...RENDER_LIMITS, ...(deps.limits || {}) };
  if (!env?.ASSETS?.fetch) throw new RenderError('render_unavailable', 'render assets are not bound');
  let browser = deps.browser;
  if (!browser) {
    try { browser = await within(limits.navigateMs, (deps.launch || launchBrowser)(env, limits), 'render_unavailable'); }
    catch (error) { throw error instanceof RenderError ? error : new RenderError('render_unavailable', `browser launch failed: ${error.message}`); }
  }
  const requests = { served: [], blocked: [] };
  try {
    return await within(limits.totalMs, (async () => {
      const page = await browser.newPage();
      try {
        await page.setRequestInterception(true);
        page.on('request', interceptor(env.ASSETS, requests));
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.goto(`${RENDER_ORIGIN}${ANIMATION_RENDER_ENTRY}`, { waitUntil: 'load', timeout: limits.navigateMs });
        await page.waitForFunction('window.__animationRenderReady === true', { timeout: limits.navigateMs });
        const captures = [];
        for (const entry of manifest.entries) {
          await page.setViewport({ width: entry.width, height: entry.height, deviceScaleFactor: entry.dpr });
          const request = { artifact: candidate.artifact, artifactHash: candidate.artifactHash, view: entry.view, inputs: entry.inputs, time: entry.time, events: entry.events, ticks: entry.ticks, seed: entry.seed, theme: entry.theme, width: entry.width, height: entry.height };
          const done = await within(limits.captureMs, page.evaluate(r => window.__renderAnimation3d(r), request), 'capture_timeout');
          if (done?.programError) throw Object.assign(new RenderError('program_error', `the program failed on capture ${entry.id}`), { program: done.programError });
          if (!done?.ok) throw new RenderError('scene_invalid', `the review page refused capture ${entry.id}: ${String(done?.error || 'unknown').slice(0, 200)}`);
          if (done.artifactHash !== candidate.artifactHash || canonicalJson(done.trace?.events ?? null) !== canonicalJson(entry.events)) throw new RenderError('scene_invalid', `capture ${entry.id} ran another artifact or event sequence`);
          const element = await page.$('[data-animation3d-frame]');
          if (!element) throw new RenderError('scene_invalid', `capture target missing for ${entry.id}`);
          const png = new Uint8Array(await element.screenshot({ type: 'png' }));
          const capture = { id: entry.id, artifactHash: candidate.artifactHash, view: entry.view.name, label: entry.label, inputs: entry.inputs, time: entry.time, events: entry.events, ticks: entry.ticks, seed: entry.seed, trace: traceOf(done.trace), png, sha256: await sha256Hex(png), mediaType: 'image/png' };
          if (deps.jobId || deps.store) {
            capture.key = `animation/${deps.jobId || 'adhoc'}/${candidate.artifactHash.slice(0, 16)}-${entry.id}.png`;
            await (deps.store ? deps.store(capture.key, png) : learnMedia(env).put(capture.key, png, { httpMetadata: { contentType: 'image/png' } }));
          }
          captures.push(capture);
        }
        return { captures, requests };
      } finally { await closeWithin(limits.closeMs, page.close?.()); }
    })(), 'render_timeout');
  } finally {
    if (!deps.browser) await closeWithin(limits.closeMs, browser.close());
  }
}

// The dev render probe (no model call): one artifact through exactly the review capture path above (same manifest, page, interception and
// screenshot target), with the PNGs returned instead of stored. -> { ok, error?, program?, coverage, captures: [{ id, label, view, time,
// events, ticks, bytes, sha256, pngBase64, trace }], requests: { served, blocked } }
const pngBase64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export async function renderProbe(env, artifact, artifactHash, deps = {}) {
  if (!env?.BROWSER && !deps.launch && !deps.browser) return { ok: false, error: 'render_unavailable: no BROWSER binding on this deployment' };
  if (!env?.ASSETS?.fetch) return { ok: false, error: 'render_unavailable: no ASSETS binding on this deployment' };
  const manifest = captureManifest(artifact);
  try {
    const out = await renderAnimation(env, { artifact, artifactHash }, manifest, deps);
    return { ok: true, artifactHash, coverage: manifest.coverage, requests: out.requests,
      captures: out.captures.map(c => ({ id: c.id, label: c.label, view: c.view, time: c.time, events: c.events, ticks: c.ticks, bytes: c.png.length, sha256: c.sha256, pngBase64: pngBase64(c.png), trace: c.trace })) };
  } catch (error) {
    return { ok: false, artifactHash, coverage: manifest.coverage, error: `${error.code || 'render_failed'}: ${String(error.message).slice(0, 500)}`, ...(error.program ? { program: error.program } : {}) };
  }
}

// The render stage. -> { captures, renders, coverage } | { problems, category, repairable, renders? }
export const renderStage = (deps = {}) => async (job, ctx) => {
  if (!ctx.env?.BROWSER && !deps.launch && !deps.browser) throw blocker('render_unavailable', 'Rendering animations for review is not available here. Your animation is kept; retry rendering once it is.');
  if (!ctx.env?.ASSETS?.fetch) throw blocker('render_unavailable', 'The review page is not available here. Your animation is kept; retry rendering once it is.');
  let manifest;
  try { manifest = captureManifest(job.artifact); } catch (error) { if (error.code === 'over_budget') return { problems: [error.message], category: 'spec', repairable: true }; throw error; }
  let out;
  try { out = await renderAnimation(ctx.env, { artifact: job.artifact, artifactHash: job.artifactHash }, manifest, { jobId: job.id, ...deps }); }
  catch (error) {
    // The candidate's program ran and failed, or held the page: the candidate's problem, repairable, never a render outage.
    if (error.code === 'program_error' && !['setup', 'engine'].includes(error.program?.phase)) return { problems: [`running the program failed (${String(error.program?.code || 'runtime_error').slice(0, 40)}${error.program?.phase ? `, phase ${error.program.phase}` : ''}): ${String(error.program?.diagnostic || 'no detail').slice(0, 300)}`], category: 'spec', repairable: true };
    if (error.code === 'capture_timeout') return { problems: ['running the program did not finish within the capture time limit: write a lighter program'], category: 'spec', repairable: true };
    throw blocker(error.code === 'render_unavailable' ? 'render_unavailable' : 'render_failed', `The animation could not be rendered for review (${error.code || 'render_failed'}). Retry rendering.`);
  }
  const renders = out.captures.map(() => ({ ok: true }));
  // The review reads every trace whole; traces over its limit are this candidate's size, told to the repair before any review is spent.
  const size = new TextEncoder().encode(JSON.stringify(out.captures.map(c => ({ id: c.id, ...c.trace })))).length;
  if (size > ANIMATION_REVIEW_LIMITS.traceBytes) return { problems: [`the execution traces of the ${out.captures.length} captures are ${size} bytes, over the review limit of ${ANIMATION_REVIEW_LIMITS.traceBytes}: report fewer or shorter readouts`], category: 'spec', repairable: true, renders };
  return { captures: out.captures.map(({ png: _bytes, ...capture }) => capture), renders, coverage: manifest.coverage };
};
