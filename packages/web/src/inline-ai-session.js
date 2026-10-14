// One inline AI editor session (docs/features/inline-ai-editor.md §6, §10-§12, A2, A3): a request's life from submit
// to Accept, Reject or Cancel. Pure apart from the injected transport and clock, so the node tests drive every path.
//
// - One request at a time: a second submit while one runs is a counted duplicate, not a second call.
// - Every await re-checks the request's token: a cancel, a supersede, a refine or a closed editor drops late results and
//   late stream chunks; nothing of an old request reaches a new one.
// - Streamed text lives only here and in the preview layer, coalesced to one update per flushMs (A2): never the board,
//   never autosave or undo. The result is accepted only once complete and validated.
// - A completed result is kept by idempotency key (board, target fingerprints, the supporting context's fingerprint, mode,
//   prompt, scope): the same request again reuses it instead of generating twice; new words around the selection do not
//   (owner 2026-10-13, point 7). A move changes none of these.
// - Metrics are per request id, monotonic (now()), content-free (A3).
import { commandInput, decideRoute, EARLIER_MAX, explicitCommand, planRoute, PROMPT_MAX, promptTooLong, ROUTES } from './inline-ai-route.js';

export const STAGES = Object.freeze({ routing: 'Choosing a format…', note: 'Writing the explanation…', edit: 'Preparing the edit…', artifact: 'Making the {label}…' });
const busyStates = new Set(['routing', 'generating', 'streaming']);
export const idempotencyKey = ({ boardKey, prints, mode, prompt, selectionOnly }) => JSON.stringify([boardKey, prints.target, prints.relations, prints.context ?? null, mode, String(prompt).trim(), !!selectionOnly]);
// The A5 route column of one request's metrics. jev: this request asked JEV, or tried to and fell back
// (fallback:<reason>). direct: an explicit / command. bypassed: no routing call for this request - a plain explain,
// Edit, a reused result, an answered clarification (its routing call, if any, was the earlier request's row).
// skipped:<reason>: the worker refused before JEV was called (no key, the spend guard): bypassed, never jev.
export const routeColumn = entry => (entry.routing === 'jev' || String(entry.routing || '').startsWith('fallback:') ? 'jev' : entry.via === 'command' ? 'direct' : 'bypassed');
// The candidate a refine revises (§10), as the handler reads it: a note's words, an edit's operations, a card's type,
// title and text.
// At most EARLIER_MAX characters, the worker's limit: a longer edit has each operation's text cut to fit, and says so.
export function earlierResult(preview) {
  if (preview.kind === 'note') return String(preview.text || '').slice(0, EARLIER_MAX);
  if (preview.kind === 'edit') {
    const summary = preview.summary || '', ops = preview.raw?.ops || [];
    const full = JSON.stringify({ summary, ops });
    if (full.length <= EARLIER_MAX) return full;
    const each = Math.max(40, Math.floor((EARLIER_MAX - 600) / Math.max(1, ops.length)) - 120);
    const cut = ops.map(op => (typeof op.text === 'string' && op.text.length > each ? { ...op, text: `${op.text.slice(0, each)}…` } : op));
    return JSON.stringify({ summary, truncated: true, ops: cut }).slice(0, EARLIER_MAX);
  }
  const block = preview.block || {};
  return JSON.stringify({ type: block.type, title: block.title || '', text: block.brief || block.caption || block.body || block.code || '' }).slice(0, EARLIER_MAX);
}
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `r${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

// transport: { route(input, { signal }) -> readRoute() result, or throws;
//              generate(input, { signal, onEvent }) -> { result, usage, streaming } (onEvent gets { type: 'delta' | 'preview', ... });
//              artifact(input, { signal }) -> the /api/learn/artifact answer }
// validate(result, plan) -> { ok, preview, errors }: the editor's check against the live board (inline-ai-apply.js).
export function createInlineSession({ transport, boardKey, enabled = ['note'], validate, motion = null, now = () => performance.now(), flushMs = 50, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, onMetrics = () => {} }) {
  let token = 0, controller = null, closed = false, flushTimer = null, pending = '', pendingRequest = null;
  const results = new Map();
  const metrics = new Map();
  const state = { status: 'idle', stage: null, requestId: null, mode: null, route: null, via: null, notice: null, stream: null, preview: null, clarify: null, error: null, proposal: null, accepted: false, stale: null };
  const emit = () => { if (!closed) onChange({ ...state }); };
  const set = patch => { Object.assign(state, patch); emit(); };
  const metric = id => {
    if (!metrics.has(id)) metrics.set(id, { requestId: id, marks: {}, counts: { modelCalls: 0, routeCalls: 0, chunks: 0, flushes: 0, duplicates: 0, cancels: 0, stale: 0, errors: 0, timeouts: 0, reused: 0 }, routing: null, streaming: false, outcome: null });
    return metrics.get(id);
  };
  const mark = (id, name, at = now()) => { const entry = metric(id); if (entry.marks[name] == null) entry.marks[name] = at; };
  const count = (id, name, by = 1) => { metric(id).counts[name] += by; };
  // previewed and reused are provisional: Accept, Reject, a stale refusal or closing the editor settles them.
  const PROVISIONAL = new Set(['previewed', 'reused']);
  const finish = (id, outcome) => { const entry = metric(id); if (entry.outcome && !PROVISIONAL.has(entry.outcome)) return; entry.outcome = outcome; entry.marks.end = now(); onMetrics({ ...entry, marks: { ...entry.marks }, counts: { ...entry.counts } }); };
  const live = mine => mine === token && !closed;
  // What the editor shows when a request ends without a new result: the preview still there - a paid proposal stays a
  // proposal, with its cost disclosure and Generate, never a plain Accept - or, with none, the given state.
  const shown = otherwise => (state.preview ? (state.preview.kind === 'proposal' ? 'proposal' : 'preview') : otherwise);
  const flush = (mine, id) => {
    flushTimer = null;
    if (!live(mine) || !pending) return;
    state.stream = { ...(state.stream || {}), text: (state.stream?.text || '') + pending };
    pending = '';
    count(id, 'flushes');
    mark(id, 'firstPreview');
    set({ status: 'streaming' });
  };
  // One streamed event: note text is appended (coalesced); an edit's partial text replaces its object's line.
  const onEvent = (mine, id) => event => {
    if (!live(mine)) return;
    // The real mode: a provider that answers whole still arrives as one delta, so chunks never decide it.
    if (event.type === 'meta') { metric(id).streaming = !!event.streaming; return; }
    count(id, 'chunks');
    mark(id, 'firstOutput');
    if (event.type === 'delta' && event.text) {
      pending += event.text;
      if (flushMs <= 0) flush(mine, id);
      else if (!flushTimer) flushTimer = setTimer(() => flush(mine, id), flushMs);
    } else if (event.type === 'preview' && typeof event.text === 'string') {
      state.stream = { ...(state.stream || {}), edits: { ...(state.stream?.edits || {}), [event.id]: event.text } };
      if (!flushTimer) flushTimer = setTimer(() => { flushTimer = null; if (live(mine)) { count(id, 'flushes'); mark(id, 'firstPreview'); set({ status: 'streaming' }); } }, Math.max(0, flushMs));
    }
  };
  const stopTimers = () => { if (flushTimer) clearTimer(flushTimer); flushTimer = null; pending = ''; };

  // Generate for a settled route. plan: { route, via, args }, request: { mode, prompt, context, summary, frozen, key }.
  async function generate(mine, id, plan, request) {
    const { route } = plan;
    const signal = controller.signal;
    // The handler's input, resolved first: no subject for a bare command or a photo search asks for one, calls nothing.
    const input = commandInput(plan, request);
    if (input.clarify) return { kind: 'clarify', question: input.clarify.question };
    if (route === 'motion') {
      // /motion is a paid proposal with no model call before Generate (learn-slash.js motionProposal). Its /motion line
      // carries the selection it is about; its concept is the selection's subject, never the canvas title.
      const proposal = motion?.(input.args, { selection: request.summary || '', concept: input.concept });
      if (!proposal) throw Object.assign(new Error('Video explainers (Motion) are not available on this canvas.'), { code: 'unavailable' });
      return { kind: 'proposal', route, block: proposal.block, message: proposal.message, primitive: 'motion' };
    }
    if (route === 'note' || route === 'edit') {
      set({ status: 'generating', stage: STAGES[route], stream: null });
      mark(id, 'providerStart');
      count(id, 'modelCalls');
      const out = await transport.generate({ requestId: id, mode: request.mode, route, prompt: input.args, context: request.context, ...(request.revise ? { revise: request.revise } : {}) }, { signal, onEvent: onEvent(mine, id) });
      if (!live(mine)) return null;
      if (out.usage) metric(id).tokens = { input: out.usage.input_tokens ?? null, output: out.usage.output_tokens ?? null };
      return out.result;
    }
    set({ status: 'generating', stage: STAGES.artifact.replace('{label}', (ROUTES[route]?.label || route).toLowerCase()), stream: null });
    mark(id, 'providerStart');
    count(id, 'modelCalls');
    const answer = await transport.artifact({ requestId: id, command: route, args: input.args, context: request.context, ...(request.revise ? { revise: request.revise } : {}) }, { signal });
    if (!live(mine)) return null;
    mark(id, 'firstOutput');
    if (answer.result === 'artifact') return { kind: 'card', route, block: answer.block, primitive: answer.primitive };
    if (answer.result === 'paid_proposal') return { kind: 'proposal', route, block: answer.block, message: answer.message, primitive: answer.primitive };
    if (answer.result === 'clarification') return { kind: 'clarify', question: answer.question };
    if (answer.result === 'unsupported') return { kind: 'unsupported', message: answer.message };
    throw Object.assign(new Error(answer.error || 'That could not be made. Try again.'), { code: answer.result || 'error' });
  }

  async function run(mine, id, plan, request) {
    Object.assign(metric(id), { capability: plan.route, via: plan.via });
    let result;
    try { result = await generate(mine, id, plan, request); }
    catch (error) {
      if (!live(mine)) return;
      stopTimers();
      const timeout = error.name === 'TimeoutError' || error.code === 'timeout';
      count(id, timeout ? 'timeouts' : 'errors');
      // A recoverable error keeps the prompt and the last valid preview (§10).
      set({ status: shown('error'), stage: null, stream: null, error: timeout ? 'That took too long. Try again.' : error.message || 'Something went wrong. Try again.' });
      finish(id, timeout ? 'timeout' : 'error');
      return;
    }
    if (!live(mine) || !result) return;
    stopTimers();
    if (result.kind === 'clarify' || result.kind === 'unsupported') {
      set({ status: 'clarify', stage: null, stream: null, clarify: { question: result.question || result.message, options: result.kind === 'unsupported' ? ['note'] : [] } });
      finish(id, result.kind);
      return;
    }
    const checked = validate(result, plan, request);
    if (!checked.ok) {
      count(id, 'errors');
      set({ status: shown('error'), stage: null, stream: null, error: checked.errors?.[0] || checked.limitation || 'The result could not be checked.', ...(checked.limitation && !state.preview ? { notice: checked.limitation } : {}) });
      finish(id, checked.limitation ? 'limitation' : 'invalid');
      return;
    }
    results.set(request.key, { result, plan });
    mark(id, 'complete');
    set({ status: result.kind === 'proposal' ? 'proposal' : 'preview', stage: null, stream: null, preview: { ...checked.preview, requestId: id, route: plan.route, kind: result.kind, frozen: request.frozen, mode: request.mode, origin: request.revise?.prompt ?? request.prompt }, proposal: result.kind === 'proposal' ? { message: result.message, primitive: result.primitive } : null, requestId: id, route: plan.route, via: plan.via, error: null, accepted: false, stale: null });
    if (result.kind !== 'proposal') finish(id, 'previewed');
    // The candidate a refine revised is settled: it was neither accepted nor rejected, it was refined.
    if (request.replaces) finish(request.replaces, 'refined');
  }

  return {
    get state() { return { ...state }; },
    metrics: id => metrics.get(id),
    // request: { mode, prompt, prepare() -> { context, frozen, summary, prints, selectionOnly, prepMs, cacheHit } } -
    // prepare runs here, at submit, so the snapshot is the board as it is now (A1).
    async submit({ mode, prompt, prepare }) {
      if (closed) return 'closed';
      if (busyStates.has(state.status)) { if (state.requestId) count(state.requestId, 'duplicates'); return 'duplicate'; }
      // Over the one limit nothing is sent (the editor also holds Submit back and shows the count).
      if (String(prompt).length > PROMPT_MAX) { set({ error: promptTooLong(String(prompt).length), notice: null }); return 'too_long'; }
      // A refine (§10): new words while a preview shows revise that candidate - the same output, its result and the
      // original request go with the instruction, and the preview stays until the revision succeeds. A / command or the
      // other pill is a new request instead.
      const previous = state.status === 'preview' && state.preview && !state.accepted && state.preview.mode === mode && !explicitCommand(prompt) ? state.preview : null;
      const id = uuid(), mine = ++token;
      controller?.abort();
      controller = new AbortController();
      mark(id, 'submit');
      const snapshot = prepare();
      mark(id, 'refreshed');
      Object.assign(metric(id), { context: snapshot.shape || null, prep: { ms: snapshot.prepMs ?? null, cacheHit: !!snapshot.cacheHit } });
      const key = idempotencyKey({ boardKey, prints: snapshot.prints, mode, prompt: previous ? `${previous.requestId}|${prompt}` : prompt, selectionOnly: snapshot.selectionOnly });
      const request = { mode, prompt, context: snapshot.context, summary: snapshot.summary, frozen: snapshot.frozen, key,
        ...(previous ? { replaces: previous.requestId, revise: { prompt: String(previous.origin || ''), result: earlierResult(previous) } } : {}) };
      set({ requestId: id, mode, error: null, notice: null, clarify: null, stale: null });
      const kept = results.get(key);
      if (kept) {
        // The same request again: its result, re-checked against the board now; no second generation or charge.
        count(id, 'reused'); Object.assign(metric(id), { routing: 'reused', capability: kept.plan.route, via: kept.plan.via });
        const checked = validate(kept.result, kept.plan, request);
        if (checked.ok) {
          mark(id, 'complete');
          set({ status: kept.result.kind === 'proposal' ? 'proposal' : 'preview', preview: { ...checked.preview, requestId: id, route: kept.plan.route, kind: kept.result.kind, frozen: request.frozen, mode: request.mode, origin: request.revise?.prompt ?? request.prompt }, proposal: kept.result.kind === 'proposal' ? { message: kept.result.message, primitive: kept.result.primitive } : null, route: kept.plan.route, via: kept.plan.via, accepted: false });
          finish(id, 'reused');
          return 'reused';
        }
        results.delete(key);
      }
      let plan = previous ? { route: previous.route, via: 'refine', args: String(prompt).trim() } : planRoute({ mode, prompt, enabled });
      if (plan.classify) {
        set({ status: 'routing', stage: STAGES.routing });
        mark(id, 'routeStart');
        count(id, 'routeCalls');
        let read;
        try { read = await transport.route({ requestId: id, prompt, selection: snapshot.summary }, { signal: controller.signal }); }
        catch (error) { read = { error: error.code === 'timeout' || error.name === 'TimeoutError' ? 'timeout' : error.message || 'unavailable' }; if (read.error === 'timeout') count(id, 'timeouts'); }
        if (!live(mine)) return 'dropped';
        mark(id, 'routeEnd');
        // The worker refused the request itself (400: too long, malformed): say why, never a quiet plain note.
        if (read.status === 400) {
          // Refused before any JEV call: skipped, never jev.
          metric(id).routing = `skipped:${read.error || 'invalid'}`; count(id, 'errors');
          set({ status: shown('error'), stage: null, error: read.message || 'This request was refused. Change it and send again.' });
          finish(id, 'invalid');
          return 'invalid';
        }
        plan = decideRoute(read, { enabled });
        metric(id).routing = plan.via !== 'fallback' ? 'jev' : read.called === false ? `skipped:${read.error}` : `fallback:${read.error}`;
      } else metric(id).routing = previous ? 'refine' : 'bypassed';
      pendingRequest = request;
      if (plan.clarify) { set({ status: 'clarify', stage: null, clarify: plan.clarify }); finish(id, 'clarify'); return 'clarify'; }
      if (plan.unavailable) { metric(id).capability = plan.unavailable.route; set({ status: shown('error'), stage: null, error: plan.unavailable.text }); finish(id, 'unavailable'); return 'unavailable'; }
      if (plan.notice) set({ notice: plan.notice });
      await run(mine, id, plan, request);
      return live(mine) ? state.status : 'dropped';
    },
    // A clarification answered: generate with that route, no second routing call.
    async choose(route) {
      if (closed || state.status !== 'clarify' || !pendingRequest) return 'ignored';
      const mine = ++token, id = uuid();
      controller?.abort(); controller = new AbortController();
      mark(id, 'submit'); mark(id, 'refreshed');
      metric(id).routing = 'clarified';
      set({ clarify: null, requestId: id });
      if (!enabled.includes(route) && route !== 'note') { set({ status: 'error', error: `${ROUTES[route]?.label || route} isn't available on this canvas.` }); finish(id, 'unavailable'); return 'unavailable'; }
      await run(mine, id, { route, via: 'clarified', args: pendingRequest.prompt }, pendingRequest);
      return state.status;
    },
    // A question asked while a preview was showing: back to that preview, which is still there and still bound to its
    // own snapshot. The question's request is settled (clarify); answering it afterwards is not possible.
    back() {
      if (closed || state.status !== 'clarify' || !state.preview || state.accepted) return 'ignored';
      pendingRequest = null;
      set({ status: shown('idle'), clarify: null, error: null });
      return state.status;
    },
    // Stop: abort locally and upstream where the transport can; late results and chunks are dropped. A paid job a card
    // already started is not stopped by this (the editor says so); nothing here has started one.
    cancel() {
      const was = state.status;
      token += 1; controller?.abort(); stopTimers();
      if (state.requestId && busyStates.has(was)) { count(state.requestId, 'cancels'); finish(state.requestId, 'cancelled'); }
      if (busyStates.has(was)) set({ status: shown('idle'), stage: null, stream: null });
      return was;
    },
    // Accept once: apply(preview) returns { ok } or { stale } (inline-ai-apply.js / the canvas). A second Accept, or one
    // for a request that is not previewed, does nothing.
    accept(apply) {
      if (closed || state.accepted || !['preview', 'proposal'].includes(state.status) || !state.preview) return { ignored: true };
      // A paid proposal is accepted only from its own panel (the cost disclosure and Generate), never as a plain preview.
      if (state.preview.kind === 'proposal' && state.status !== 'proposal') return { ignored: true };
      const id = state.preview.requestId;
      mark(id, 'acceptClick');
      state.accepted = true;
      let out;
      // An Accept that cannot apply (it threw, or said why not) is undone, says so, and leaves Accept usable.
      try { out = apply(state.preview); } catch (error) { out = { error: `That could not be added to the canvas: ${error.message || 'an unexpected error'}.` }; }
      if (out?.error) {
        state.accepted = false;
        count(id, 'errors');
        set({ error: out.error });
        return out;
      }
      if (out?.stale) {
        state.accepted = false;
        count(id, 'stale');
        set({ status: 'stale', stale: out.stale });
        finish(id, 'stale');
        return out;
      }
      mark(id, 'committed');
      set({ status: 'accepted' });
      finish(id, 'accepted');
      return out || { ok: true };
    },
    reject() { if (state.preview) finish(state.preview.requestId, 'rejected'); token += 1; controller?.abort(); stopTimers(); set({ status: 'idle', preview: null, stream: null, proposal: null, stale: null }); },
    // The editor closed, the board changed or the canvas unmounted: nothing of this session lands anywhere after this.
    dispose(reason = 'closed') {
      if (state.requestId && busyStates.has(state.status)) { count(state.requestId, 'cancels'); finish(state.requestId, reason); }
      else if (state.preview && !state.accepted) finish(state.preview.requestId, reason);
      token += 1; controller?.abort(); stopTimers(); closed = true;
    },
    // Persistence measured apart from acceptance (A3): the canvas reports when the accepted board was saved.
    persisted(id, at = now()) { const entry = metrics.get(id); if (entry && entry.marks.persisted == null) { entry.marks.persisted = at; onMetrics({ ...entry, marks: { ...entry.marks }, counts: { ...entry.counts }, update: 'persisted' }); } },
  };
}

// The A3 stage durations of one request's marks (ms, monotonic within this browser).
export function stageTimings(entry) {
  const m = entry.marks, d = (a, b) => (m[a] != null && m[b] != null ? Math.round((m[b] - m[a]) * 10) / 10 : null);
  return {
    refresh: d('submit', 'refreshed'), routing: entry.routing === 'bypassed' || String(entry.routing || '').startsWith('skipped:') ? 'bypassed' : d('routeStart', 'routeEnd'),
    providerFirst: d('providerStart', 'firstOutput'), firstPreview: d('submit', 'firstPreview'), complete: d('submit', 'complete'),
    accept: d('acceptClick', 'committed'), persist: d('committed', 'persisted'),
  };
}
