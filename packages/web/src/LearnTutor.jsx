// Tutor v1 on the Learn page (docs/features/tutor-v1-implementation-map.md §5). Active where the Tutor domain registry
// (learn-tutor-domains.js) or a journey resolves a domain, and the Rabbit Holes under it. The dock composer hands learner
// messages here instead of /api/learn/ask; /dive stays /dive's (Dive.jsx), and the Tutor only
// proposes a dive through it.
// LP1 Task 12 (docs/features/adaptive-learning-path-v1-architecture.md §0 D1 and D6, §2, §7.2): on a canvas with a live
// learning journey Tutor v2 is the one Tutor, with the journey domain (learn-journey-domain.js), and the journey's
// resolver runs at the top of turn(), which typed and voice turns share.
// LP1 Task 14 (architecture §13): a Rabbit Hole opened from a journey section has no journey of its own; its dive record
// names the parent's journey, section, concepts and claims. The parent journey is read once, read-only (diveJourney),
// and the hole's turns run the journey domain in its dive form over it: the dive's claims, the hole's own blocks, and
// evidence in this hole's session store. The parent's resolver and tray never run here, so the hole posts no journey
// action; a refusal leaves the hole as it was. Reconciliation on return is LP5.
import { cloneElement, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { api, apiFetch } from './api.js';
import { tutorContext } from './learn-tutor-domains.js';
import { loadStore, saveStore, storeKey } from './learn-tutor-evidence.js';
import { diveJourney } from './learn-journey-domain.js';
import { SLASHES, arriveAt, executeActions, keepHere, learnerIntent, readPlanStream, runTurn, showableCards, wantsCard } from './learn-tutor.js';
import { materialCommands, runMaterials } from './learn-slash.js';
import { holeOpening } from './learn-next-steps.js';
import { inJourneySetup, startRequest } from './LearnJourney.jsx';
import { MODE_SLASHES } from '../../control-plane/src/agents/learn-tutor.js';
import { emitDecision, newSessionId, tracing } from './learn-tutor-trace.js';
import PaidConfirm from './PaidConfirm.jsx';

// A Tutor request that never answers ends as an error reply, not an endless spinner; Stop ends it too.
const TURN_TIMEOUT_MS = 60000;

// courseCanvas: this surface is its app's own canvas (LearnPage.jsx: the Rabbit Hole product, no review board), so the app's
// course is looked up in the Tutor domain registry (learn-tutor-domains.js); a registered course with a Tutor makes the
// composer the Tutor, and a Rabbit Hole keeps it when its root is that course's repository or board (Task 0: no course
// is named here). journey: the board's journey (useJourney, LearnJourney.jsx); a live one makes the Tutor this canvas's responder.
// The Tutor's sessionStorage key. A journey's conversational store is its own (§5): open question, turns, Socratic counts;
// its evidence is the server's. A hole opened from a journey section (Task 14 review round 1) keeps its session evidence
// and turns apart from nanoGPT's tab-wide store and from other topics. A canvas-domain canvas or hole (Task 10; canvas:
// `<app>|<board>`) keeps its hook turns in its own store. Every other key is unchanged.
export const tutorStoreKey = (app, journeyId, record, canvas = null) => (journeyId ? `${storeKey(app)}:journey:${journeyId}`
  : record?.journey ? `${storeKey(app)}:dive:${record.journey.journey_id}` : canvas ? `${storeKey(app)}:canvas:${canvas}` : storeKey(app));
// The context hooks are built in (snapshot; Task 10 fix rounds 1-2, owner eleventh message 1): none while the canvas may be a
// hole whose dives record has not landed (recordPending), nor while a record naming a journey waits for its parent journey
// read (read: the dive id it settled for), so no hook set stands on a canvas domain the record or the parent journey
// replaces; then tutorContext's - the dive domain, or the canvas domain after a refusal.
// What a turn may offer beyond words (Task 11b), from structural page state only, never the learner's words: materials - the
// Learn commands create_material may run (owner ninth message) - on every turn except a hole's automatic opening (the learner
// has not asked yet: fix B4; a carried hook is a next_step turn and keeps them) and a journey in setup (no card before the
// path is accepted, LP1); research - the Research this offer, only where the page wired openResearch and never in setup (fix
// A1: the journey prompt's setup line allows words only); journeyOffer - suggest_journey, where journeys are supported here
// (journey.start), never in setup and never inside a hole (fix B1); on a live journey too (fix round 2), where the click meets
// LP1's own continue-or-start; repository (Task 11c-B) - the repository_context handoff, where the canvas reads a repository,
// never in setup (the journey prompt's setup line allows words only).
export function turnOffers({ journey = null, record = null, opening = false, nextStep = null, openResearch = null, repository = false }) {
  const setup = inJourneySetup(journey?.journey);
  return { materials: setup || (opening && !nextStep) ? [] : materialCommands(), research: !!openResearch && !setup, journeyOffer: !!journey?.start && !setup && !record, repository: !!repository && !setup };
}
// Whether a canvas reads a repository (Task 11c-B), from its app data alone: a repository app, or a canvas in a project - the
// two forms the handoff route resolves (learn-shared-ask.js boardRevision). Never the learner's words.
export const canvasRepository = app => typeof app?.name === 'string' && (app.name.startsWith('repo-') || !!app.project);
export const hookContext = (where, read, recordPending = false) => (recordPending || (where.record?.journey && read !== where.record.dive_id) ? null : tutorContext(where));
// canvasVersion: the board revision when the page passes it (decision telemetry only).
// Professor Next Steps (docs/features/professor-next-steps.md §1.3, §1.4): the returned object always carries askStep, snapshot,
// lastTurn, busy and showing, also where the Tutor is not active, so useNextSteps can ask whether hooks belong here.
// openResearch(request) (Task 11b, owner nineteenth message): the page's way into its existing Home/Library Research workflow.
// Given, the Tutor may offer suggest_research (a Research this chip that calls it); absent, it never offers one. Nothing is
// researched inside a Tutor turn. repository (Task 11c-B): whether the turn may hand off to repository_context; the page may pass
// false when the learner detached the repository source (LearnPage repoAttached), else it is the app's own (canvasRepository).
export function useTutor({ app, board, access, canvasApi, canvasState, dive, courseCanvas = false, journey = null, canvasVersion = null, openResearch = null, repository = null }) {
  const record = dive.tree?.dive || null;
  const root = dive.tree?.path?.[0];
  // The parent journey of a hole whose record carries one (Task 14): { journey, path } once read, else null.
  // ponytail: the hole Tutor is inactive until the parent journey GET returns (the first instant is the plain hole); hold
  // the composer on a pending state if learners type before it lands.
  // parentRead: the dive id whose parent read has settled, found or refused (hookContext waits for it).
  const [parentJourney, setParentJourney] = useState(null);
  const [parentRead, setParentRead] = useState(null);
  useEffect(() => {
    setParentJourney(null);
    if (!record?.journey) return;
    let current = true;
    diveJourney(record, path => api(path)).then(found => { if (current) { setParentJourney(found); setParentRead(record.dive_id); } });
    return () => { current = false; };
  }, [record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Whether the Tutor runs here, and its domain, is the registry resolver's (learn-tutor-domains.js tutorContext): a live
  // journey, a hole's read parent journey, then a registered course by its repository, board or a hole's root.
  // The live title (Task 10 fix round 3): the server title of this level on the dives path (dives.js level(), reloaded by
  // Dive on a rename; a pending hole's renamed title in session), app.title last. A rename never changes app.title or a
  // hole record's creation-time title, so neither is read for a title while the path has one; no copied name cache.
  const liveTitle = dive.tree?.path?.at(-1)?.title ?? app.title ?? null;
  const where = { app: courseCanvas ? app : null, board, root, parentJourney, record, title: liveTitle };
  // Ruling F4, amended by Task 11b: typed and voice turns need capabilities.tutor (plain canvases have it since 11b); a hook
  // turn (askStep), a carried opening and its paid proposals also run where only capabilities.hook_turns holds.
  const context = tutorContext({ ...where, journey }), capabilities = context?.capabilities;
  const active = capabilities?.tutor === true, hookTurns = active || capabilities?.hook_turns === true;
  const here = { app: app.name, board };
  const reads = repository ?? canvasRepository(app);
  const journeyId = journey?.journey?.id ?? null;
  const key = tutorStoreKey(app, journeyId, record, context?.source === 'canvas' ? `${app.name}|${board || 'main'}` : null);
  const slashNext = useRef(null);
  // busy: a turn is in flight (a stopping point for the hooks); lastTurn: the last finished turn, a hook basis trigger;
  // shown: the hooks on screen (useNextSteps), for the decision trace. desk: what shows in extras - the turn's suggestion
  // chips (Back up among them, Task 10 fix round 1), the paid card waiting for Generate / Not now, and the notices of
  // material that could not be made. It is plain state read when extras is drawn (redraw re-renders), so anything that
  // lands after a render is never lost.
  const [busy, setBusy] = useState(false);
  const [lastTurn, setLastTurn] = useState(null);
  const [, redraw] = useReducer(n => n + 1, 0);
  const desk = useRef({ chips: [], proposal: null, notices: [] }).current;
  const put = next => { Object.assign(desk, next); redraw(); };
  const seq = useRef(0), shown = useRef([]), flying = useRef(0), asking = useRef(Promise.resolve());
  const stateRef = useRef(canvasState); stateRef.current = canvasState;
  const journeyRef = useRef(journey); journeyRef.current = journey;
  // The journey's server events replace the stored copy when they are newer: the last turn here adopted them, so the two
  // agree until an option click or another tab stores more.
  // The Tutor session id (contract §3.1 identity) is minted once per store: decision telemetry only, never sent to a planner.
  const load = () => {
    let store = loadStore(sessionStorage, key);
    if (!store.session_id) { store = { ...store, session_id: newSessionId() }; saveStore(sessionStorage, key, store); }
    const evidence = journeyRef.current?.journey?.evidence;
    return evidence && evidence.seq > store.seq ? { ...store, events: evidence.events, seq: evidence.seq } : store;
  };
  const save = store => saveStore(sessionStorage, key, store);
  // The Tutor's domain on this canvas, built per turn: a journey canvas's (§3.2) from the journey, its path and the canvas
  // blocks; a hole opened from a journey section (Task 14) the dive domain over the parent journey, session evidence; else
  // the registered course's; else the canvas domain (Task 10; typed and voice turns too since Task 11b).
  const domainOf = (canvas, selected = null) => tutorContext({ ...where, journey: journeyRef.current, blocks: canvas?.blocks?.() || [], selected })?.domain;

  // Back on a parent after a hole: its next turn carries returned_from (§6.4).
  useEffect(() => { if (active) save(arriveAt(load(), here)); }, [active, here.app, here.board]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolves the turn's result once its canvas actions have run; typed and voice turns share it.
  // onSpeakable (voice): the plan streams, and its first validated, self-contained sentence is handed over
  // before the plan is complete (runTurn, learn-tutor-validate.js speakable) so Fish can start on it.
  // skipJourney: the learner chose Ask the Tutor for these words, so the journey's resolver has had them. onAnswer: called
  // once the turn is the Tutor's to answer (the composer draws its exchange then); a turn the journey takes never calls
  // it and resolves to { text: '', handled: true, failed }.
  // nextStep (contract §1.4): a clicked hook's selected_next_step, never evidence - no target block (so no practice rung), no
  // journey resolver, no learner words (so no evaluate), and a waiting /deeper stays for the next typed turn. selectedAt: the
  // click's time, for the decision trace.
  const turn = useCallback(async ({ raw, targetId = null, opening = false, signal, inputModality = 'text', turnId = null, onSpeakable = null, skipJourney = false, onAnswer = null, nextStep = null, selectedAt = null }) => {
    const canvas = canvasApi.current;
    const block = nextStep ? null : canvas?.block?.(targetId) || canvas?.block?.(stateRef.current.card?.id) || null;
    const domain = domainOf(canvas, block?.id ?? null); // fix B2: the selected block is the target, not one of the canvas cards
    if (!domain) return { text: '', handled: true, failed: true };
    const slash = nextStep ? null : slashNext.current;
    if (!nextStep) slashNext.current = null;
    // The per-turn benchmark record (e2e/tutor-bench.mjs listens); a failed turn reports its error name.
    const started = performance.now();
    const bench = detail => window.dispatchEvent(new CustomEvent('small:tutor-bench', { detail }));
    // A turn that asks to see a card holds its place from the send (wantsCard,
    // docs/features/canvas-skeleton-cards.md); the card takes it, and anything else - text only, a card
    // already on the canvas, an error, a timeout, Stop - gives it up.
    let slot = null;
    const release = () => canvasApi.current?.release?.(slot);
    const post = (path, body, stream) => {
      const limit = AbortSignal.any([AbortSignal.timeout(TURN_TIMEOUT_MS), ...(signal ? [signal] : [])]);
      // A streamed plan (body.stream, NDJSON): its sentences reach onSentence as they validate.
      if (stream?.onSentence) return apiFetch(path, { method: 'POST', body: JSON.stringify(body), signal: limit }).then(response => readPlanStream(response, stream.onSentence));
      return api(path, { method: 'POST', body: JSON.stringify(body), signal: limit });
    };
    const live = journeyRef.current?.journey ? journeyRef.current : null;
    const common = { canvas: { ...here, ...(record ? { dive: record, liveTitle } : {}) }, access, block, inputModality, turnId, domain, post };
    // §7.2, D6: the journey's resolver first (handleText: rules 1-4, then the model's rule 5; never punctuation). A tray
    // answer, a setup path edit, a cancel or a clarification is the journey's and never reaches the planner; a second broad
    // intent is a Tutor turn here (tutor: true below), which may offer suggest_journey. A
    // free-text answer to the open diagnostic probe is a Tutor turn without a plan (§6.3): runTurn({ plan: false }) with
    // the probe as the open question, so buildTurn reads it as answering and the evaluate route stores the probe's
    // evidence; the walker steps on after. Anything else (an unrelated question, Ask the Tutor's words) is answered below,
    // in the journey domain. A slash, a hole's opening or a hook click is a Tutor turn as it is.
    if (live && !slash && !opening && !skipJourney && !nextStep) {
      const answerProbe = async (probe, text) => save((await runTurn({ ...common, raw: text, plan: false, store: { ...load(), open: { action_id: probe.id, claim: probe.claims[0], text: probe.prompt, canvas: here } } })).store);
      // tutor: this is a Tutor turn, so no word rule turns it into continue-or-start (Task 11b fix round 2); tray answers stay.
      const routed = await live.handleText(raw, { answerProbe, tutor: true });
      if (routed.handled) return { text: '', handled: true, failed: !!routed.failed };
      raw = routed.text ?? raw;
    }
    onAnswer?.();
    let result;
    try {
      result = await runTurn({
        // The typed command is read in place of the composer's words only where it fixes the move (/deeper or /simplify on a
        // depth ladder); /ask, /teach (fix A3) and a ladderless /deeper or /simplify (fix B5) keep the composer's words.
        ...common, raw: nextStep ? '' : (slash && !MODE_SLASHES.includes(slash.name) && domain.ladder?.length ? slash.raw : raw), slash: slash?.name || null, opening, store: load(), onSpeakable,
        nextStep, ...turnOffers({ journey: journeyRef.current, record, opening, nextStep, openResearch, repository: reads }),
        // Decision telemetry only while a sink is registered (contract §3.3); the planner request is the same either way.
        trace: tracing() && { identity: { canvas_version: canvasVersion }, blocks: canvas?.blocks?.() || [], next_step_options: shown.current, selected_at: selectedAt },
        // Only a domain whose cards are inserted (no showCard of its own: the authored-module one) holds a place. A journey's
        // cards are blocks already on the canvas (its showCard reveals, never inserts), so a held place would never be
        // taken; and before the path is accepted the canvas gets no card at all.
        onTurn: built => { if (!domain.showCard && wantsCard(built)) slot = canvas?.reserve?.({ label: 'Creating a card…', card: 'animation', samples: showableCards(domain) }) ?? null; },
      });
      // Fix round 2 (R1-M1): a Stop pressed after the plan or the handoff resolved, while the turn was still finishing (an
      // evaluation pending), ends the turn exactly as a Stop does: no canvas action, no material, nothing saved.
      if (signal?.aborted) throw Object.assign(signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'), { trace: result.bench.trace, handoff: result.bench.handoff });
    } catch (error) {
      release();
      bench({ error: error?.name || 'Error', trace: error?.trace ?? null, handoff: error?.handoff ?? null, ms: { total_in_app: Math.round((performance.now() - started) * 10) / 10 } });
      throw error;
    }
    save(result.store);
    if (result.log.length) console.info('[tutor]', result.routed.row, result.log.join('; '));
    put({ chips: executeActions(result.actions, {
      canvas: canvasApi.current || {},
      suggestDive: detail => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail })),
      climb: () => dive.navigator.climb(dive.navigator.tree.path.length - 2),
      slot, domain, openResearch,
      // Fix B1: the existing journey start, through LP1's start-wrapping rule (fix round 2); a start the server refuses here (not
      // a learning request, or no journeys on this canvas) says so rather than doing nothing.
      startJourney: async request => {
        const out = await journeyRef.current?.start?.(startRequest(request));
        if (out && !out.handled) put({ notices: [...desk.notices, { tone: 'info', text: 'That request cannot start a learning path here.' }] });
      },
    }) });
    release();
    // create_material (contract §2.5): the existing Learn command path (runMaterials -> runLearnCommand), never a second
    // generator, in the plan's order; a paid card waits for Generate / Not now (offer), one proposal at a time across turns.
    // The reply does not wait for the cards.
    runMaterials(result.actions, {
      app: app.name, openSearch: () => {}, offer,
      // What could not be made says so (an error, a clarification, an unsupported command); a made card is its own notice.
      // ponytail: a slow command's notice can land after the next turn began, under that reply (informative, accepted for
      // v1); tag notices with their turn id and drop stale ones if that ever confuses.
      onNotice: notice => { if (notice.tone !== 'done') put({ notices: [...desk.notices, notice] }); },
      canvas: { insertNotebook: () => canvasApi.current?.insertNotebook(), insertBlock: (b, o) => canvasApi.current?.insertBlock(b, o), reserve: s => canvasApi.current?.reserve(s), release: id => canvasApi.current?.release(id) },
      post: (path, body, options) => api(path, { ...options, method: 'POST', body: JSON.stringify({ ...body, ...(access.pending ? { pending: access.pending } : {}) }) }),
    }).catch(error => console.info('[tutor] create_material', error.message));
    result.mark('canvas_action_complete');
    result.mark('reply_ready'); // the reply text goes to the chat now; tutor-bench measures when it is drawn
    const done = Math.round((performance.now() - started) * 10) / 10;
    bench({ ...result.bench, ms: { ...result.bench.ms, canvas_done: done, total_in_app: done } });
    // A hook basis trigger (contract §2.3): every finished turn, with its own turn id; the learner's words only for a
    // question or request (the hook input's recent.question), and the claim state changes.
    const intent = learnerIntent(result.turn);
    setLastTurn({ seq: ++seq.current, turn_id: result.turn.turn_id, kind: intent.kind, ...(['question', 'request'].includes(intent.kind) ? { question: result.turn.raw_user_message.slice(0, 300) } : {}), transitions: result.transitions.map(({ claim, from, to }) => ({ claim, from, to })) });
    // After the canvas actions, so the result is final; a sink error is swallowed and counted (emitDecision).
    if (result.trace) emitDecision(result.trace);
    return { ...result, bench: { ...result.bench, ms: { ...result.bench.ms, canvas_done: done } } };
  }, [access, record, here.app, here.board, key, parentJourney, courseCanvas, root, canvasVersion, liveTitle, openResearch, reads]); // eslint-disable-line react-hooks/exhaustive-deps
  // Paid proposals from create_material, one at a time: each waits until the one before it is answered (PaidConfirm).
  const offer = next => (asking.current = asking.current.then(() => new Promise(done => put({ proposal: { ...next, done } }))));
  // Generate or Not now: the offer always clears and the next one shows, even when generate throws.
  const decide = generate => {
    const { proposal } = desk;
    try { if (generate) proposal.generate(); } finally { put({ proposal: null }); proposal.done(); }
  };
  // A new turn starts clean: the chips and the notices of the turn before (a waiting paid card stays until answered).
  const fresh = () => { if (desk.chips.length || desk.notices.length) put({ chips: [], notices: [] }); };
  // Any turn in flight is busy: a stopping point for the hooks (stoppingPoint), until the last one ends.
  const tracked = async args => {
    flying.current += 1;
    setBusy(true);
    try { return await turn(args); } finally { flying.current -= 1; if (!flying.current) setBusy(false); }
  };

  // A hole's opening turn (§6.4): once per hole, the pending question asked inside the hole. The
  // dock sends it like a typed message (ask.jsx), so it reads as the learner's question carried down
  // and never lands on the empty hole's canvas. A hook carried from a shared canvas (Professor Next Steps contract §1.4)
  // opens the hole once instead, as a next_step turn the dock sends with askStep (no evaluate call); it is taken only where
  // hook turns run (Ruling F4), so a hole whose Tutor is not resolved yet keeps it until it is. settled (merge of Tasks 10 and
  // 11): the opening also waits for the hook context hooks are built in, so a carried step never runs on the canvas domain of
  // a journey hole whose parent read is pending; a settled refusal keeps the canvas domain and takes it there.
  // recordPending (fix round 2, probe D): a canvas - structurally a possible hole, by its name - whose dives record (useDive's
  // tree) has not landed; a repository or project app is never a hole.
  const recordPending = /^canvas-[a-f0-9]{8}$/.test(app.name) && !dive.tree;
  const settled = hookContext({ ...where, journey }, parentRead, recordPending) !== null;
  const [opening, setOpening] = useState(null);
  useEffect(() => {
    const { store, opening: next } = holeOpening({ storage: sessionStorage, load, record, title: liveTitle, hookTurns, settled, active, domain: () => domainOf(canvasApi.current) });
    if (store) save(store);
    if (next) setOpening(next);
  }, [active, hookTurns, settled, record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The typed path (ask) and a hook click (askStep) share one turn and one return contract: the reply text, or
  // { handled } for a turn the journey took. An empty reply is drawn as the spinner (ask.jsx), so a turn that only acts on
  // the canvas says so.
  const answer = async args => {
    fresh();
    const result = await tracked(args);
    if (result.handled) return result;
    return result.text || (result.actions.some(action => action.type !== 'no_action') ? 'See the canvas.' : 'Nothing to add here yet.');
  };
  // A hook click (contract §1.4): one next_step turn with the step as structured data and no learner words; its
  // create_material actions run through runMaterials. inputModality 'voice' in Voice Mode: the same turn, and the reply
  // follows the existing voice behaviour (onSpeakable).
  const askStep = ({ selected_next_step, signal, begin = null, inputModality = 'text', turnId = null, onSpeakable = null }) => answer({ raw: '', nextStep: selected_next_step, selectedAt: new Date().toISOString(), signal, inputModality, turnId, onSpeakable, onAnswer: begin });
  // snapshot(): what useNextSteps builds the hook input from - the Tutor context here (null: no hooks), the merged store, a
  // hole's parent journey and record, and the live title. showing(options): the hooks on screen, named in the next turn's
  // decision trace.
  const steps = {
    askStep, lastTurn, busy,
    snapshot: () => ({ context: hookContext({ ...where, journey: journeyRef.current, blocks: canvasApi.current?.blocks?.() || [] }, parentRead, recordPending), store: load(), parent: parentJourney, record, liveTitle }),
    showing: options => { shown.current = options; },
  };
  // Read when drawn (extras is a getter): the desk as it is now.
  const made = () => <>
    {desk.notices.length > 0 && <div data-tutor-notices role="status" className="flex flex-col gap-1 text-xs">
      {desk.notices.map((notice, i) => <p key={i} className={notice.tone === 'error' ? 'text-red-700' : 'text-ink-2'}>{notice.text}</p>)}
    </div>}
    {desk.proposal && <PaidConfirm message={desk.proposal.message} onGenerate={() => decide(true)} onCancel={() => decide(false)} />}
  </>;
  const hasMade = () => !!desk.proposal || desk.notices.length > 0;
  // The turn's suggestion chips (Back up the Rabbit Hole among them), read when drawn; a pressed chip runs and goes.
  const chipRow = () => desk.chips.length > 0 && <div data-tutor-chips role="group" aria-label="Tutor suggestions" className="flex flex-wrap gap-2">
    {desk.chips.map(chip => (
      <button key={chip.label} type="button" onClick={() => { chip.run(); put({ chips: desk.chips.filter(other => other !== chip) }); }}
        className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm hover:bg-hover">
        {chip.label}
      </button>
    ))}
  </div>;
  if (!hookTurns) return { active: false, ...steps };
  // Hook-only (Ruling F4): a canvas-domain hole keeps the same Back up chip as any hole (owner eleventh message 4).
  if (!active) return { active: false, ...steps, opening, get extras() { return desk.chips.length || hasMade() ? <>{chipRow()}{made()}</> : null; } };
  return {
    active: true,
    ...steps,
    // begin (ask.jsx): draws the turn's chat bubbles and exchange, once the turn is the Tutor's. A turn the journey took
    // resolves to { handled: true, failed } and draws nothing.
    ask: ({ raw, targetId, opening: first = false, signal, inputModality = 'text', turnId, skipJourney = false, begin = null }) => answer({ raw, targetId, opening: first, signal, inputModality, turnId, skipJourney, onAnswer: begin }),
    // Voice Mode (docs/features/voice-tutor-mvp.md §1): the same turn, spoken. `speech` is the Tutor's
    // own words or '' - never a fallback; `ms` are the turn's timings for the voice telemetry. A turn the journey took
    // says nothing: the tray shows where the journey is.
    // nextStep: a hook clicked while Voice is on (voice-session say with nextStep) - the same next_step turn as askStep.
    voiceTurn: async ({ raw, targetId, signal, turnId, onSpeakable = null, opening = false, nextStep = null, selectedAt = null }) => {
      fresh();
      const result = await tracked({ raw, targetId, opening, signal, inputModality: 'voice', turnId, onSpeakable, nextStep, selectedAt: nextStep ? selectedAt ?? new Date().toISOString() : null });
      if (result.handled) return { speech: '', turnId, ms: {} };
      return { speech: result.text, turnId: result.turn.turn_id, ms: result.bench.ms };
    },
    opening,
    // /deeper and /simplify go to the Tutor as the turn's slash (§5): its prompt is sent through
    // the composer as usual, and the Tutor reads the typed command in its place. slash(null): the composer refused that
    // prompt (busy), so no stale command waits for the next turn. Task 11b: /ask and /teach too, as explicit intent overrides
    // (learn-tutor.js SLASHES); any other name (/research, /do: not Canvas commands) leaves the turn an Auto turn.
    slash: (name, raw) => { slashNext.current = SLASHES.includes(name) ? { name, raw } : null; },
    // Shown under the Tutor's reply in the chat (ask.jsx): the dive suggestion, whose "Keep it on
    // this canvas" also gives the next turn here dive_choice inline, the suggestion chips, and Tutor-made material's notices
    // and Generate / Not now (read when drawn).
    get extras() { return (dive.suggestionCard || desk.chips.length || hasMade()) ? <>
      {dive.suggestionCard && cloneElement(dive.suggestionCard, { onKeep: () => { save(keepHere(load(), here)); dive.suggestionCard.props.onKeep(); } })}
      {chipRow()}
      {made()}
    </> : null; },
  };
}
