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
export const ANIMATION_CAPTURE = Object.freeze({ width: 960, height: 540, dpr: 1, theme: 'light', maxEvents: 4, maxTicks: 90, traceKeys: ['inputs', 'time', 'events', 'ticks', 'readouts', 'goal', 'selection', 'stateHash', 'clamped', 'buried', 'trails', 'overlaps', 'arrowsUnder', 'arrowsHidden'] });

const blocker = (code, message) => Object.assign(new Error(message), { status: 503, code, category: 'renderer' });

// The two views: the artifact's own camera direction, and that camera orbited SIDE_VIEW about its own target (55 degrees round, 15 degrees
// higher, same field of view); the capture page fits each to the scene's motion at the capture's inputs (web animation3d/framing.js), as the
// learner's card does, so the review checks what the learner sees. A quarter turn (the earlier second
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
// The middle of a parameter: a number at the middle of its range, the geometric middle when its positive range spans a factor of 10 or
// more (a rate, a size), on its step; a select's middle option; a toggle's default.
export function middleOf(p) {
  if (p.type === 'select') return p.options[Math.floor((p.options.length - 1) / 2)].value;
  if (p.type !== 'number') return p.default;
  const raw = p.min > 0 && p.max >= 10 * p.min ? Math.sqrt(p.min * p.max) : (p.min + p.max) / 2, on = p.step ? p.min + Math.round((raw - p.min) / p.step) * p.step : raw;
  return Number(Math.min(p.max, Math.max(p.min, on)).toFixed(10));
}
// The states sampled, in priority order, at most ANIMATION_LIMITS.render.states; the rest are listed as omitted (never claimed).
//   timeline: the start, a third and two thirds of the loop at the defaults;
//   parameters: the defaults, every parameter at its low end, every parameter at its high end (mid-loop when there is a timeline; after
//     the longest step run when stepped, so the parameters have acted);
//   actions, selectable or draggable nodes: the initial state, one action, then a short sequence (bounded events);
//   stepped: the same with the host's steps advanced (bounded ticks); the one action runs after steps too, so an action on accumulated
//     state (keep a path, compare, reset) acts on some, then shows its effect.
// An experiment with parameters varies its main control (the first parameter) one setting at a time, the others at their defaults
// (owner 2026-11-02; aj_086fd46's joint extremes changed every parameter at once and switched its comparison arrow off): the initial
// state, the middle setting with every declared action pressed once after some steps (an action that acts on a path, a tally or a score
// has one) and then more steps, and the high end after steps; the low end, the joint extremes and the rest follow as not sampled.
// Anything else keeps the initial state, action and sequence first, so a game's action and win paths stay covered.
// A stepped scene whose motion an action starts (an action that declares nothing or startsMotion true, contract.js) is sampled after it:
// the host's steps alone move nothing in such a scene, so a state at the high end of a parameter would show no divergence and no trail
// (aj_0b6ca2b, review: "Run was never pressed in the high-rate sample"). That action (the first such one in declared order) is pressed once (before the ticks; in the comparison state first, see below; the others
// may stop the motion), and before the ticks; with none, nothing changes. Still at most maxEvents events and maxTicks ticks a capture.
// The comparison state of a stepped scene that has a start-motion action AND other actions (a save, a clear, a single step): a paused scene gains nothing
// from lead ticks before any action, so the sequence follows the contract's own order: press the start-motion action and let it run (the state the other
// actions act on), then the other actions in declared order (as many as the limits leave room for), then resume the motion (the start-motion action is
// pressed again only if the scene is idle after them: an action that toggles must not pause a running scene), then more steps. At most maxEvents actions
// and maxTicks steps in all: the first run gets what the probe and the final steps leave (owner 2026-11-03, aj_0b6ca2b: Save path saved one point).
const PROBE_TICKS = 12;
export function captureStates(artifact) {
  const inputs = resolveAnimationInputs(artifact, {}), d = artifact.timeline?.duration ?? 0, mid = Number((d * LOOP_FRACTIONS[0]).toFixed(3));
  const at = (label, extra = {}) => ({ label, inputs, time: 0, events: [], leadTicks: 0, ticks: 0, ...extra });
  const actions = artifact.actions || [], nodes = artifact.scene.nodes, pick = nodes.find(n => n.selectable), drag = nodes.find(n => n.drag);
  const events = [...actions.map(a => ({ type: 'action', action: a.id })), ...(pick ? [{ type: 'select', node: pick.id }] : []), ...(drag ? [{ type: 'drag_start', node: drag.id, value: drag.drag.min }, { type: 'drag_move', node: drag.id, value: drag.drag.max }, { type: 'drag_end', node: drag.id, value: drag.drag.max }] : [])];
  const ticks = artifact.stepped ? 30 : 0, acted = [], swept = [];
  const starter = artifact.stepped ? actions.find(a => a.startsMotion !== false) : undefined, go = starter ? [{ type: 'action', action: starter.id }] : [];
  if (events.length) {
    const first = `${events[0].type} ${events[0].action ?? events[0].node}`;
    acted.push(at(ticks ? `${ticks * 2} steps, then ${first}, then ${ticks} steps` : first, { events: events.slice(0, 1), leadTicks: ticks * 2, ticks }));
    const run = Array.from({ length: ANIMATION_CAPTURE.maxEvents }, (_, i) => events[i % events.length]);
    acted.push(at(`sequence of ${run.length} events`, { events: run, ticks: Math.min(ANIMATION_CAPTURE.maxTicks, ticks * 3) }));
  }
  if (artifact.parameters.length) {
    const low = Object.fromEntries(artifact.parameters.map(p => [p.id, lowOf(p)])), high = Object.fromEntries(artifact.parameters.map(p => [p.id, highOf(p)]));
    const run = artifact.stepped ? ANIMATION_CAPTURE.maxTicks : 0;
    swept.push(at('every parameter at its low end', { inputs: { ...inputs, ...low }, time: mid, events: go, ticks: run }), at('every parameter at its high end', { inputs: { ...inputs, ...high }, time: mid, events: go, ticks: run }));
  }
  const looped = d ? LOOP_FRACTIONS.map(f => at(`${Math.round(f * 100)}% of the loop`, { time: Number((d * f).toFixed(3)) })) : [];
  let first = [];
  if (artifact.experience === 'experiment' && artifact.parameters.length) {
    const [main] = artifact.parameters, only = value => ({ ...inputs, [main.id]: value }), run = artifact.stepped ? ANIMATION_CAPTURE.maxTicks : 0, after = run ? `, after ${starter ? `${starter.action ?? starter.id}, then ` : ''}${run} steps` : '';
    // Every declared action and the selectable node, once each; a drag sets the scene up again, so it stays in the omitted sequence.
    const others = events.filter(e => (e.type === 'action' || e.type === 'select') && !(starter && e.action === starter.id)), acts = [...others.slice(0, ANIMATION_CAPTURE.maxEvents - go.length), ...go], middle = middleOf(main), names = acts.map(e => e.action ?? `select ${e.node}`).join(', ');
    const between = others.slice(0, ANIMATION_CAPTURE.maxEvents - 2), firstRun = ANIMATION_CAPTURE.maxTicks - PROBE_TICKS - ticks;
    const compare = starter && between.length && ticks ? { events: [...go, { type: 'advance', ticks: firstRun }, ...between, { type: 'resume', action: starter.id, probe: PROBE_TICKS }],
      label: `${main.id} at ${middle}: ${starter.id}, ${firstRun} steps, then ${between.map(e => e.action ?? `select ${e.node}`).join(', ')}, then ${starter.id} if idle, then ${ticks} steps` } : null;
    first = [at('initial'),
      compare ? at(compare.label, { inputs: only(middle), time: mid, events: compare.events, leadTicks: 0, ticks })
        : at(`${main.id} at ${middle}${acts.length && ticks ? `: ${ticks * 2} steps, then ${names}, then ${ticks} steps` : acts.length ? `, then ${names}` : after}`,
          { inputs: only(middle), time: mid, events: acts, leadTicks: acts.length ? ticks * 2 : 0, ticks: acts.length ? ticks : run }),
      at(`${main.id} at its high end (${highOf(main)})${after}`, { inputs: only(highOf(main)), time: mid, events: go, ticks: run }),
      at(`${main.id} at its low end (${lowOf(main)})${after}`, { inputs: only(lowOf(main)), time: mid, events: go, ticks: run })];
  }
  const out = first.length ? [...first, ...swept, ...acted, ...looped] : [at('initial'), ...acted, ...swept, ...looped];
  const seen = new Set(), unique = out.filter(s => { const k = canonicalJson([s.inputs, s.time, s.events, s.leadTicks, s.ticks]); if (seen.has(k)) return false; seen.add(k); return true; });
  return { sampled: unique.slice(0, ANIMATION_LIMITS.render.states), omitted: unique.slice(ANIMATION_LIMITS.render.states).map(s => s.label) };
}

// The round's manifest: every view x every sampled state, light theme, one fixed size. -> { entries, coverage }
export function captureManifest(artifact) {
  const views = captureViews(artifact), { sampled, omitted } = captureStates(artifact);
  const entries = views.flatMap((view, v) => sampled.map((state, s) => ({ id: `v${v}-s${s}`, view, label: state.label, inputs: state.inputs, time: state.time, events: state.events, leadTicks: state.leadTicks, ticks: state.ticks,
    seed: artifact.seed, theme: ANIMATION_CAPTURE.theme, width: ANIMATION_CAPTURE.width, height: ANIMATION_CAPTURE.height, dpr: ANIMATION_CAPTURE.dpr })));
  if (entries.length > ANIMATION_LIMITS.render.capturesPerRound) throw new RenderError('over_budget', `${entries.length} captures, over ${ANIMATION_LIMITS.render.capturesPerRound}`);
  return { entries, coverage: { views: views.map(v => v.name), sampled: sampled.map(s => ({ label: s.label, time: s.time, events: s.events.filter(e => e.type !== 'advance').length, ...(s.leadTicks ? { leadTicks: s.leadTicks } : {}), ticks: s.ticks })), omitted } };
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
          const request = { artifact: candidate.artifact, artifactHash: candidate.artifactHash, view: entry.view, inputs: entry.inputs, time: entry.time, events: entry.events, leadTicks: entry.leadTicks ?? 0, ticks: entry.ticks, seed: entry.seed, theme: entry.theme, width: entry.width, height: entry.height };
          const done = await within(limits.captureMs, page.evaluate(r => window.__renderAnimation3d(r), request), 'capture_timeout');
          if (done?.programError) throw Object.assign(new RenderError('program_error', `the program failed on capture ${entry.id}`), { program: done.programError });
          if (!done?.ok) throw new RenderError('scene_invalid', `the review page refused capture ${entry.id}: ${String(done?.error || 'unknown').slice(0, 200)}`);
          if (done.artifactHash !== candidate.artifactHash || canonicalJson(done.trace?.events ?? null) !== canonicalJson(entry.events)) throw new RenderError('scene_invalid', `capture ${entry.id} ran another artifact or event sequence`);
          const element = await page.$('[data-animation3d-frame]');
          if (!element) throw new RenderError('scene_invalid', `capture target missing for ${entry.id}`);
          const png = new Uint8Array(await element.screenshot({ type: 'png' }));
          const capture = { id: entry.id, artifactHash: candidate.artifactHash, view: entry.view.name, label: entry.label, inputs: entry.inputs, time: entry.time, events: entry.events, ...(entry.leadTicks ? { leadTicks: entry.leadTicks } : {}), ticks: entry.ticks, seed: entry.seed, trace: traceOf(done.trace), png, sha256: await sha256Hex(png), mediaType: 'image/png' };
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
// states (the result probe only): chosen settings to draw in the default view instead of the review's own sample, for checking
// framing at parameter extremes: [{ label, inputs, events?, ticks? }], at most capturesPerRound, bounded as the review's own.
export function chosenManifest(artifact, states) {
  if (!Array.isArray(states) || !states.length || states.length > ANIMATION_LIMITS.render.capturesPerRound) throw new RenderError('over_budget', `give 1 to ${ANIMATION_LIMITS.render.capturesPerRound} states`);
  const view = captureViews(artifact)[0];
  const entries = states.map((state, i) => ({ id: `chosen-${i}`, view, label: String(state.label ?? `state ${i}`).slice(0, 80), inputs: resolveAnimationInputs(artifact, state.inputs ?? {}), time: Number(state.time) || 0,
    events: (state.events ?? []).slice(0, ANIMATION_CAPTURE.maxEvents), ticks: artifact.stepped ? Math.min(ANIMATION_CAPTURE.maxTicks, Math.max(0, Number(state.ticks) || 0)) : 0,
    seed: artifact.seed, theme: ANIMATION_CAPTURE.theme, width: ANIMATION_CAPTURE.width, height: ANIMATION_CAPTURE.height, dpr: ANIMATION_CAPTURE.dpr }));
  return { entries, coverage: { views: [view.name], sampled: entries.map(e => ({ label: e.label, time: e.time, events: e.events.length, ticks: e.ticks })), omitted: [] } };
}
export async function renderProbe(env, artifact, artifactHash, deps = {}, states = null) {
  if (!env?.BROWSER && !deps.launch && !deps.browser) return { ok: false, error: 'render_unavailable: no BROWSER binding on this deployment' };
  if (!env?.ASSETS?.fetch) return { ok: false, error: 'render_unavailable: no ASSETS binding on this deployment' };
  const manifest = states ? chosenManifest(artifact, states) : captureManifest(artifact);
  try {
    const out = await renderAnimation(env, { artifact, artifactHash }, manifest, deps);
    return { ok: true, artifactHash, coverage: manifest.coverage, requests: out.requests,
      captures: out.captures.map(c => ({ id: c.id, label: c.label, view: c.view, time: c.time, events: c.events, ...(c.leadTicks ? { leadTicks: c.leadTicks } : {}), ticks: c.ticks, bytes: c.png.length, sha256: c.sha256, pngBase64: pngBase64(c.png), trace: c.trace })) };
  } catch (error) {
    return { ok: false, artifactHash, coverage: manifest.coverage, error: `${error.code || 'render_failed'}: ${String(error.message).slice(0, 500)}`, ...(error.program ? { program: error.program } : {}) };
  }
}

// The render stage. -> { captures, renders, coverage } | { problems, category, repairable, renders? }
// C12 (b) and (e): what the capture traces say about the run path, the markers and the arrows, as problems of the same kind as a buried marker: the candidate's own disagreement, told to the repair
// before any review is spent (the repair path of the render stage; no correction ask). One line each, naming the captures it holds in:
//   (i)   at the high end of the main control (the first parameter's max), a run that reads diverged with fewer than 4 trail points since the run started;
//   (ii)  a run still going after K steps whose run path holds fewer than K points (K is read from a steps readout: id steps, stepCount or iterations, or the label Steps taken; none, nothing is said);
//   (iii) at the initial capture, two sphere markers within half a radius of each other, neither a ghost;
//   (e)   an arrow whose tip or middle is drawn under the surface.
// ponytail: (ii) cannot see a step count the program does not report; (i) and (ii) need the capture's trace to carry the run path's points (trace.trails).
const nth = n => `${n}${[, 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10] ?? 'th'}`;
const STEP_COUNT_ID = /^(steps?|stepCount|iterations?)$/i, STEP_COUNT_LABEL = /^(steps|iterations)( taken| so far| done| count)?$/i;
export function traceProblems(artifact, captures) {
  const lines = [], ids = list => `capture${list.length > 1 ? 's' : ''} ${list.slice(0, 4).join(', ')}`, plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const [main] = artifact.parameters ?? [], counter = (artifact.readouts ?? []).find(r => r.kind !== 'text' && (STEP_COUNT_ID.test(r.id) || STEP_COUNT_LABEL.test(r.label ?? '')));
  const stepsOf = trace => (Number.isInteger(trace?.readouts?.[counter?.id]) ? trace.readouts[counter.id] : null);
  const said = trace => Object.values(trace?.readouts ?? {}).filter(value => typeof value === 'string').map(value => value.toLowerCase());
  const fullest = trace => { // the run path holding the most points: { points, max }, or null when the trace carries none
    const counted = Object.entries(trace?.trails ?? {}).map(([id, points]) => ({ points, max: artifact.scene.geometries.find(g => g.id === artifact.scene.nodes.find(n => n.id === id)?.geometry)?.max ?? Infinity }));
    return counted.reduce((best, item) => (!best || item.points > best.points ? item : best), null);
  };
  if (main?.type === 'number') {
    const short = captures.filter(c => c.ticks > 0 && c.inputs?.[main.id] === main.max && said(c.trace).includes('diverged') && (fullest(c.trace)?.points ?? 4) < 4);
    if (short.length) {
      const { points } = fullest(short[0].trace), steps = stepsOf(short[0].trace) ?? Math.max(1, points - 1);
      lines.push(`at the highest ${main.id} (${main.max}) the run diverges in ${plural(steps, 'step')} in ${ids(short.map(c => c.id))}: its path holds ${plural(points, 'trail point')} since the run started and a diverging run makes at least 4: have it take at least 4 steps to leave the surface, so the path shows the swing`);
    }
  }
  const sparse = captures.filter(c => { const steps = stepsOf(c.trace), counted = fullest(c.trace); return steps !== null && counted && !said(c.trace).some(w => w === 'converged' || w === 'diverged') && counted.points < Math.min(steps, counted.max); });
  if (sparse.length) {
    const steps = stepsOf(sparse[0].trace), { points } = fullest(sparse[0].trace);
    lines.push(`the trail marks every ${nth(Math.max(2, Math.round(steps / Math.max(1, points - 1))))} step: it holds ${plural(points, 'point')} after ${plural(steps, 'step')} in ${ids(sparse.map(c => c.id))}: add a point for every step, so the path shows each one`);
  }
  const pairs = new Map();
  for (const c of captures.filter(item => item.time === 0 && !item.ticks && !item.leadTicks && !item.events?.length)) {
    for (const { a, b, distance } of c.trace?.overlaps ?? []) pairs.set(`${a}|${b}`, { a, b, distance, ids: [...(pairs.get(`${a}|${b}`)?.ids ?? []), c.id] });
  }
  for (const { a, b, distance, ids: seen } of [...pairs.values()].slice(0, 2)) lines.push(`one marker hides the other in ${ids(seen)}: ${a} and ${b} are ${distance} apart, under half a radius: put them apart`);
  const arrows = new Map();
  for (const c of captures) {
    for (const { id, point, under } of c.trace?.arrowsUnder ?? []) {
      const seen = arrows.get(id) ?? { ids: [], point, under };
      seen.ids.push(c.id);
      if (under > seen.under) Object.assign(seen, { point, under });
      arrows.set(id, seen);
    }
  }
  for (const [id, seen] of [...arrows].slice(0, 2)) lines.push(`the ${id} arrow runs through the surface in ${ids(seen.ids)}: its ${seen.point} is ${seen.under.toFixed(2)} under it: scale it so its longest arrow stays under a quarter of the surface width`);
  return lines;
}
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
  // A marker or path drawn below the surface it sits on (C9, owner; C7 job 3: a surface drawn at twice the height the program uses): the candidate's own disagreement, found in the traces and
  // told to the repair before any review is spent, one line for each node with the captures it shows in and its worst case.
  const buried = new Map();
  for (const capture of out.captures) {
    for (const { node, y, surfaceY } of capture.trace?.buried ?? []) {
      const seen = buried.get(node) ?? { ids: [], depth: -Infinity, y, surfaceY };
      seen.ids.push(capture.id);
      if (surfaceY - y > seen.depth) Object.assign(seen, { depth: surfaceY - y, y, surfaceY });
      buried.set(node, seen);
    }
  }
  const buriedLines = [...buried].map(([node, seen]) => `${node} is drawn below the surface it sits on in capture${seen.ids.length > 1 ? 's' : ''} ${seen.ids.slice(0, 4).join(', ')} (${seen.depth.toFixed(2)} under it: its y is ${seen.y} where the surface is ${seen.surfaceY}): make the program's heights and the surface's heights follow the same heights, so the marker and the path are drawn on the surface`);
  const problems = [...buriedLines, ...traceProblems(job.artifact, out.captures)].slice(0, 6); // a buried marker first, then what the traces say about the trail, the markers and the arrows
  if (problems.length) return { problems, category: 'spec', repairable: true, renders };
  return { captures: out.captures.map(({ png: _bytes, ...capture }) => capture), renders, coverage: manifest.coverage };
};
