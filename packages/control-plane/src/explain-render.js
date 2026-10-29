// /explain render step (EXP-T18 step 1, owner decision 4): render the compiled scene through the production
// render entry (packages/web/render/scene.html, the real AnimatedScene card body with the app's fonts and
// KaTeX) in a Browser Rendering session, and save one PNG per distinct manifest state.
// Inert by construction: request interception serves only the entry's own built files from env.ASSETS and
// aborts everything else, so the page has no network, no cookies and no Cloudflare Access hop. The scene goes
// in with page.evaluate, never in a URL. Images inside scenes are refused by the gates, so no private asset
// is ever fetched.
import { evaluateScene } from '../../web/src/scene-evaluate.js';
import { LIMITS as SCENE_LIMITS, timeCheckpoints } from '../../web/src/visual-components/budget.js';
import { stateInputs } from '../../web/src/visual-components/compile.js';
import { learnMedia } from './learn-storage.js';
import { defaultInputs, programMoments } from './explain-program.js';

export const RENDER_ORIGIN = 'https://render.invalid'; // never resolves: every request is answered or aborted here
export const RENDER_ENTRY = '/render/scene.html';
export const RENDER_LIMITS = Object.freeze({ maxCaptures: 64, maxPixels: 64 * 1600 * 1200 * 4, navigateMs: 15_000, captureMs: 10_000, totalMs: 90_000, closeMs: 5_000, maxSide: 4096, keepAliveMs: 10_000 });

export class RenderError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));

// Sorted keys, so equal states hash equally (same rule as explain-contract.js canonicalJson).
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const compiledHash = scene => sha256Hex(canonicalJson(scene));

const pixelsOf = entry => entry.width * entry.height * entry.dpr * entry.dpr;

// Worst-case capture budget fixed BEFORE authoring from enforced limits (plan 3.5); the compiled manifest must fit it.
// cap: the round's capture allowance (explain-policy.js EXPLAIN_LIMITS.render.capturesPerRound); the reservation is the
// product of the dimensions, never more than the cap or the renderer's own maxCaptures.
export function reserveCaptures({ parts = 1, states = 1, checkpoints = 1, themes = 1, width = 1200, height = 900, dpr = 2, cap = Infinity }) {
  const captures = Math.min(parts * states * checkpoints * themes, cap, RENDER_LIMITS.maxCaptures);
  return { captures, pixels: captures * width * height * dpr * dpr };
}

// The round's reservation before anything is authored: the cap's worth of captures at the largest card the scene limits
// admit (budget.js LIMITS, the same bound the compiler enforces), so no compiled manifest can need more pixels.
export const reserveRound = ({ cap, dpr = 1 }) => reserveCaptures({ states: Infinity, width: SCENE_LIMITS.width, height: SCENE_LIMITS.height, dpr, cap });

// The moments a capture must show (plan 3.5, EXP-T18): every named step of a steps card (each is its own frame, earlier
// context staying), every declared time checkpoint of a time card (stills prove only those moments), else the end.
export function captureMoments(scene) {
  const mode = scene.presentation?.mode;
  if (mode === 'steps') return scene.presentation.steps.map(step => ({ time: step.at, step: step.title }));
  if (mode === 'time') return timeCheckpoints(scene).map(time => ({ time }));
  return [{ time: scene.duration }];
}

// The bounded capture manifest (plan 3.5, r2-contract.md section 4): every admitted state (pager parts included) x every
// moment x the themes that fit. Captures of the same evaluated frame share a frameHash, so checkManifest renders them once
// and keeps the others as aliases. Both themes when the distinct frames fit twice, else light; if even that does not fit
// the representation is refused (over_budget), never sampled. Ids name only the dimensions that vary, so a static
// single-state card keeps the ids light and dark.
export async function captureManifest(scene, { reserved, themes = ['light', 'dark'], dpr = 1, target = 'frame' }) {
  const states = stateInputs(scene), moments = captureMoments(scene);
  const frames = [];
  for (const [s, inputs] of states.entries()) {
    for (const [m, moment] of moments.entries()) {
      const drawn = evaluateScene(structuredClone(scene), moment.time, inputs).state.objects;
      frames.push({ s, m, inputs, moment, frameHash: await sha256Hex(canonicalJson(drawn)) });
    }
  }
  const unique = new Set(frames.map(frame => frame.frameHash)).size;
  const fit = themes.filter((_, index) => unique * (index + 1) <= reserved.captures).length;
  if (!fit) throw new RenderError('over_budget', `this card has ${unique} distinct frames (${states.length} control states x ${moments.length} moments) and a round reviews at most ${reserved.captures}: use fewer steps or control values`);
  const name = (frame, theme) => [states.length > 1 && `s${frame.s}`, moments.length > 1 && `t${frame.m}`, theme].filter(Boolean).join('-');
  const entries = frames.flatMap(frame => themes.slice(0, fit).map(theme => ({
    id: name(frame, theme), part: frame.inputs.part ?? 0, ...(frame.moment.step ? { step: frame.moment.step } : {}), time: frame.moment.time,
    inputs: frame.inputs, theme, width: scene.width, height: scene.height, dpr, target, frameHash: frame.frameHash,
  })));
  return { compiledHash: await compiledHash(scene), reserved, entries, coverage: { states: states.length, moments: moments.length, frames: unique, themes: themes.slice(0, fit) } };
}

// The single-input boundary states of a program, in declared order (a number's min and max, a select's first and last option), each a
// change from the defaults, then ONE combined state (every input at its max/last, else at its min/first). Identical states are
// dropped, so none costs a capture twice. shortcut: the contract has only number and select inputs; intermediate values and further
// combinations are not sampled, so these are evidence, never an exhaustive claim.
function alternativeStates(manifest, defaults) {
  const bounds = input => (input.type === 'number' ? [['min', input.min], ['max', input.max]] : [['first', input.options[0].value], ['last', input.options.at(-1).value]]);
  const seen = new Set([canonicalJson(defaults)]), out = [];
  const add = (label, inputs) => { const key = canonicalJson(inputs); if (!seen.has(key)) { seen.add(key); out.push({ label, inputs }); } };
  for (const input of manifest.inputs) for (const [edge, value] of bounds(input)) add(`${edge} of ${input.id}`, { ...defaults, [input.id]: value });
  const single = out.length;
  if (manifest.inputs.length > 1) for (const side of [1, 0]) if (out.length === single) add(`combined: every input at its ${side ? 'max/last' : 'min/first'}`, Object.fromEntries(manifest.inputs.map(input => [input.id, bounds(input)[side][1]])));
  return out;
}

// The most events replayed before one capture (reducer work is bounded per capture as well as by the capture count).
export const REVIEW_EVENTS = 4;
// A stateful program's sampled transitions, from its initial state at the default inputs, in declared order: each button pressed
// once, each selectable object selected once, then the first button pressed REVIEW_EVENTS times (a run of the same step). Identical
// sequences are dropped. shortcut: longer or mixed sequences are not sampled; these are evidence, never an exhaustive claim.
export function transitionSequences(manifest) {
  const actions = (manifest.actions || []).map(a => ({ label: `press ${a.id}`, events: [{ type: 'action', action: a.id }] }));
  const targets = (manifest.targets || []).map(t => ({ label: `select ${t.id}`, events: [{ type: 'select', target: t.id }] }));
  const run = manifest.actions?.length ? [{ label: `press ${manifest.actions[0].id} ${REVIEW_EVENTS} times`, events: Array.from({ length: REVIEW_EVENTS }, () => ({ type: 'action', action: manifest.actions[0].id })) }] : [];
  return [...actions, ...targets, ...run];
}

// The program card's capture manifest: the default inputs at the start, middle and end of the declared playback (the start only when
// there is none), then, in the capture budget that remains, a stateful program's transitions (transitionSequences, at the first
// moment) and then the boundary input states (alternativeStates) at the middle moment, light theme. The defaults always come first and
// are never dropped for an alternative; what does not fit is listed in coverage.omitted (never trimmed silently, never over the
// reservation). A schema 1 program decides the frame size at run time (the nominal viewport is the contract default); a stateful one
// is captured at its declared viewport, with the seed every capture replays from.
export async function programCaptureManifest(artifact, { reserved, themes = ['light'], dpr = 1, width = artifact.manifest.viewport?.width ?? 960, height = artifact.manifest.viewport?.height ?? 540, seed = 0 }) {
  const inputs = defaultInputs(artifact.manifest), moments = programMoments(artifact.manifest);
  const fit = themes.filter((_, index) => moments.length * (index + 1) <= reserved.captures);
  if (!fit.length) throw new RenderError('over_budget', `this program needs ${moments.length} captures and a round reviews at most ${reserved.captures}`);
  const stateful = artifact.schemaVersion === 2;
  const entry = (id, time, theme, state, events) => ({ id, part: 0, time, inputs: state, theme, width, height, dpr, target: 'frame', ...(stateful ? { seed, events: events ?? [] } : {}) });
  const entries = moments.flatMap((time, m) => fit.map(theme => entry([moments.length > 1 && `t${m}`, theme].filter(Boolean).join('-'), time, theme, inputs)));
  const sampled = moments.map((time, m) => ({ id: entries[m * fit.length].id, label: 'default', inputs: {}, time, ...(stateful ? { events: [] } : {}) }));
  let room = Math.max(0, reserved.captures - entries.length);
  const transitions = stateful ? transitionSequences(artifact.manifest) : [], taken = transitions.slice(0, room);
  for (const [k, { label, events }] of taken.entries()) {
    const added = entry(`e${k}-${fit[0]}`, moments[0], fit[0], inputs, events);
    entries.push(added);
    sampled.push({ id: added.id, label, inputs: {}, time: moments[0], events });
  }
  room -= taken.length;
  const candidates = alternativeStates(artifact.manifest, inputs);
  const alternatives = candidates.slice(0, room), time = moments[moments.length >> 1];
  for (const [k, { label, inputs: state }] of alternatives.entries()) {
    const added = entry(`a${k}-${fit[0]}`, time, fit[0], state);
    entries.push(added);
    sampled.push({ id: added.id, label, inputs: Object.fromEntries(Object.entries(state).filter(([key, value]) => value !== inputs[key])), time, ...(stateful ? { events: [] } : {}) });
  }
  const omitted = [...transitions.slice(taken.length), ...candidates.slice(room)].map(c => c.label);
  return { compiledHash: await compiledHash(artifact), reserved, entries, coverage: { states: 1 + alternatives.length, moments: moments.length, frames: sampled.length, themes: fit, sampled, omitted,
    ...(stateful ? { transitions: { sampled: taken.length, declared: transitions.length, events: taken.reduce((sum, t) => sum + t.events.length, 0), seed } } : {}) } };
}

// Exact manifest after compile: dedups identical states by hash, refuses (never trims) an over-budget manifest
// and a manifest built for another compiled version.
export async function checkManifest(manifest, scene, limits = RENDER_LIMITS) {
  const actual = await compiledHash(scene);
  if (manifest.compiledHash !== actual) throw new RenderError('stale_version', 'capture manifest is for a different compiled version');
  const reserved = manifest.reserved;
  if (!reserved || !(reserved.captures > 0) || !(reserved.pixels > 0)) throw new RenderError('no_reservation', 'capture manifest has no reserved bound');
  const seen = new Map();
  for (const raw of manifest.entries || []) {
    const entry = { part: 0, step: undefined, time: 0, inputs: {}, theme: 'light', dpr: 1, target: 'frame', ...raw };
    if (!(entry.width >= 16 && entry.width <= limits.maxSide && entry.height >= 16 && entry.height <= limits.maxSide) || ![1, 2].includes(entry.dpr)) throw new RenderError('bad_entry', `capture ${entry.id} has an unsupported size`);
    if (!['light', 'dark'].includes(entry.theme) || !['frame', 'body'].includes(entry.target)) throw new RenderError('bad_entry', `capture ${entry.id} has an unknown theme or target`);
    // A frameHash (captureManifest: the evaluated frame) identifies the pixels; without one, the requested state does.
    // A stateful program's capture is also the seed and the ordered events replayed before it (bounded, REVIEW_EVENTS).
    if (entry.events && (!Array.isArray(entry.events) || entry.events.length > REVIEW_EVENTS || !Number.isInteger(entry.seed))) throw new RenderError('bad_entry', `capture ${entry.id} has an unbounded event sequence`);
    const state = entry.frameHash ? { frameHash: entry.frameHash } : { part: entry.part, step: entry.step, time: entry.time, inputs: entry.inputs, ...(entry.events ? { seed: entry.seed, events: entry.events } : {}) };
    const stateHash = await sha256Hex(canonicalJson({ compiledHash: actual, ...state, theme: entry.theme, width: entry.width, height: entry.height, dpr: entry.dpr, target: entry.target }));
    if (seen.has(stateHash)) seen.get(stateHash).aliases.push(entry.id);
    else seen.set(stateHash, { ...entry, stateHash, aliases: [] });
  }
  const unique = [...seen.values()];
  if (!unique.length) throw new RenderError('empty_manifest', 'capture manifest has no entries');
  const pixels = unique.reduce((sum, e) => sum + pixelsOf(e), 0);
  if (unique.length > Math.min(reserved.captures, limits.maxCaptures) || pixels > Math.min(reserved.pixels, limits.maxPixels)) {
    throw new RenderError('over_budget', `capture manifest needs ${unique.length} captures / ${pixels} px, over its reservation`);
  }
  return { compiledHash: actual, entries: unique, pixels };
}

// Only the entry and its hashed build assets; nothing else may load.
// The pinned interpreter's WASM is a trusted, versioned, hashed build asset like the scripts; it is served with its own MIME type
// (a streaming compile refuses anything else) and nothing else of that shape is admitted.
export const allowedAsset = url => url.origin === RENDER_ORIGIN && !url.search && (url.pathname === RENDER_ENTRY || /^\/static\/[A-Za-z0-9._-]+\.(js|css|woff2?|ttf|wasm)$/.test(url.pathname));
// The review page starts the engine's Worker from a Blob it built itself (page-worker.js): the browser serves that blob: URL, there is
// nothing to fetch, so it is let through only when it belongs to this page's origin. Every other blob:, data: or remote URL is aborted.
const ownBlob = url => url.protocol === 'blob:' && url.origin === RENDER_ORIGIN;
const contentTypeOf = (url, response) => (url.pathname.endsWith('.wasm') ? 'application/wasm' : response.headers.get('content-type') || 'application/octet-stream');

// The interception handler, separate so a unit test can drive it with fake requests.
export function interceptor(assets, log) {
  return async request => {
    let url;
    try { url = new URL(request.url()); } catch { url = null; }
    if (url && ownBlob(url)) { log.served.push('blob:worker'); return request.continue(); }
    if (!url || !allowedAsset(url)) { log.blocked.push(request.url()); return request.abort('blockedbyclient'); }
    const response = await assets.fetch(new Request(url.href));
    if (!response.ok) { log.blocked.push(request.url()); return request.abort('failed'); }
    log.served.push(url.pathname);
    return request.respond({ status: 200, headers: { 'content-type': contentTypeOf(url, response) }, body: new Uint8Array(await response.arrayBuffer()) });
  };
}

// A close that never answers (a page whose thread is blocked) must not hold the job: it gets closeMs, then the session is closed
// instead, which ends every page in it. Never rejects.
const closeWithin = (ms, closing) => {
  let timer;
  return Promise.race([Promise.resolve(closing).catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, ms); })]).finally(() => clearTimeout(timer));
};
const within = (ms, promise, code) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new RenderError(code, `render timed out after ${ms} ms`)), ms); })]).finally(() => clearTimeout(timer));
};

// renderStates(env, compiled, manifest, deps) -> { compiledHash, captures: [{ id, aliases, stateHash, png, sha256, key? }], requests }
// compiled: { scene } (CompiledVisual). deps.launch(env) returns a puppeteer-shaped browser (default:
// @cloudflare/puppeteer on env.BROWSER); deps.store(key, png) defaults to LEARN_MEDIA under explain/<jobId>/.
export async function renderStates(env, compiled, manifest, deps = {}) {
  const limits = { ...RENDER_LIMITS, ...(deps.limits || {}) };
  // A program card is captured from its artifact (the same pinned engine and renderer play it); a legacy card from its scene.
  const subject = compiled.program ?? compiled.scene;
  const checked = await checkManifest(manifest, subject, limits);
  if (!env?.ASSETS?.fetch) throw new RenderError('render_unavailable', 'render assets are not bound');
  let browser = deps.browser; // a caller-owned session (several scenes in one session); never closed here
  const opened = Date.now();
  if (!browser) {
    try {
      browser = await within(limits.navigateMs, (deps.launch || launchBrowser)(env, limits), 'render_unavailable');
    } catch (error) {
      throw error instanceof RenderError ? error : new RenderError('render_unavailable', `browser launch failed: ${error.message}`);
    }
  }
  const requests = { served: [], blocked: [] };
  try {
    return await within(limits.totalMs, (async () => {
      const page = await browser.newPage();
      try {
      await page.setRequestInterception(true);
      page.on('request', interceptor(env.ASSETS, requests));
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); // settled states, no springs mid-flight
      await page.goto(`${RENDER_ORIGIN}${RENDER_ENTRY}`, { waitUntil: 'load', timeout: limits.navigateMs });
      await page.waitForFunction('window.__renderReady === true', { timeout: limits.navigateMs });
      const captures = [];
      for (const entry of checked.entries) {
        await page.setViewport({ width: entry.width + 48, height: entry.height + 400, deviceScaleFactor: entry.dpr });
        const request = { time: entry.time, inputs: entry.inputs, theme: entry.theme, width: entry.width, height: entry.height, ...(entry.events ? { seed: entry.seed, events: entry.events } : {}) };
        const done = await within(limits.captureMs, compiled.program
          ? page.evaluate(request => window.__renderProgram(request), { ...request, program: compiled.program })
          : page.evaluate(request => window.__renderScene(request), { ...request, scene: compiled.scene }), 'capture_timeout');
        // A program that ran and failed is the program's fault (repairable), not the renderer's: its stable code and a bounded private
        // diagnostic go to repair, never to the learner.
        if (done?.programError) throw Object.assign(new RenderError('program_error', `the program failed on capture ${entry.id}`), { program: done.programError });
        if (!done?.ok) throw new RenderError('scene_invalid', `render entry refused capture ${entry.id}: ${done?.error || 'unknown'}`);
        // A stateful capture is of the sealed bundle and of the very sequence asked for: anything else is never reviewed.
        if (compiled.program && entry.events && (done.bundleHash !== compiled.program.bundleHash || canonicalJson(done.trace?.events ?? null) !== canonicalJson(entry.events))) throw new RenderError('scene_invalid', `capture ${entry.id} ran another bundle or event sequence`);
        if (done.fonts?.missing?.length) throw new RenderError('fonts_missing', `fonts not loaded for ${entry.id}: ${done.fonts.missing.join(', ')}`);
        const element = await page.$(entry.target === 'body' ? '[data-render-target]' : '[data-animation-frame]');
        if (!element) throw new RenderError('scene_invalid', `capture target missing for ${entry.id}`);
        const png = new Uint8Array(await element.screenshot({ type: 'png' }));
        // A program capture is bound to its bundle: the bundle hash, the replayed seed and events, the resulting state hash (in the trace) and the pixels' hash.
        const capture = { id: entry.id, aliases: entry.aliases, stateHash: entry.stateHash, theme: entry.theme, time: entry.time, inputs: entry.inputs, ...(entry.step ? { step: entry.step } : {}),
          ...(compiled.program ? { bundleHash: compiled.program.bundleHash } : {}), ...(entry.events ? { seed: entry.seed, events: entry.events } : {}), ...(done.trace ? { trace: done.trace } : {}), png, sha256: await sha256Hex(png) };
        if (deps.jobId || deps.store) {
          capture.key = `explain/${deps.jobId || 'adhoc'}/${entry.stateHash.slice(0, 16)}.png`;
          await (deps.store ? deps.store(capture.key, png) : learnMedia(env).put(capture.key, png, { httpMetadata: { contentType: 'image/png' } }));
        }
        captures.push(capture);
      }
      return { compiledHash: checked.compiledHash, captures, requests, browserMs: Date.now() - opened };
      } finally { await closeWithin(limits.closeMs, page.close?.()); }
    })(), 'render_timeout');
  } finally {
    if (!deps.browser) await closeWithin(limits.closeMs, browser.close());
  }
}

// Browser Rendering session (@cloudflare/puppeteer on env.BROWSER, as webpage-capture.js uses it).
export async function launchBrowser(env, limits = RENDER_LIMITS) {
  if (!env?.BROWSER) throw new RenderError('render_unavailable', 'Browser Rendering is not bound');
  const { default: puppeteer } = await import('@cloudflare/puppeteer');
  return puppeteer.launch(env.BROWSER, { keep_alive: limits.keepAliveMs }); // idle browser time is billed: at most 10 s
}
