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
import { arriveAt, enterHole, executeActions, keepHere, learnerIntent, markOpened, openingQuestion, readPlanStream, runTurn, showableCards, wantsCard } from './learn-tutor.js';
import { materialCommands, runMaterials } from './learn-slash.js';
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
// canvasVersion: the board revision when the page passes it (decision telemetry only).
// Professor Next Steps (docs/features/professor-next-steps.md §1.3, §1.4): the returned object always carries askStep, snapshot,
// lastTurn, busy and showing, also where the Tutor is not active, so useNextSteps can ask whether hooks belong here.
export function useTutor({ app, board, access, canvasApi, canvasState, dive, courseCanvas = false, journey = null, canvasVersion = null }) {
  const record = dive.tree?.dive || null;
  const root = dive.tree?.path?.[0];
  // The parent journey of a hole whose record carries one (Task 14): { journey, path } once read, else null.
  // ponytail: the hole Tutor is inactive until the parent journey GET returns (the first instant is the plain hole); hold
  // the composer on a pending state if learners type before it lands.
  const [parentJourney, setParentJourney] = useState(null);
  useEffect(() => {
    setParentJourney(null);
    if (!record?.journey) return;
    let current = true;
    diveJourney(record, path => api(path)).then(found => { if (current) setParentJourney(found); });
    return () => { current = false; };
  }, [record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Whether the Tutor runs here, and its domain, is the registry resolver's (learn-tutor-domains.js tutorContext): a live
  // journey, a hole's read parent journey, then a registered course by its repository, board or a hole's root.
  const where = { app: courseCanvas ? app : null, board, root, parentJourney, record, title: app.title ?? null };
  // Ruling F4: typed and voice turns need capabilities.tutor; a hook turn (askStep), a carried opening and the paid
  // proposals it raises also run where only capabilities.hook_turns holds (Task 10: plain canvases).
  const context = tutorContext({ ...where, journey }), capabilities = context?.capabilities;
  const active = capabilities?.tutor === true, hookTurns = active || capabilities?.hook_turns === true;
  const here = { app: app.name, board };
  const journeyId = journey?.journey?.id ?? null;
  const key = tutorStoreKey(app, journeyId, record, context?.source === 'canvas' ? `${app.name}|${board || 'main'}` : null);
  const [chips, setChips] = useState([]);
  const slashNext = useRef(null);
  // busy: a turn is in flight (a stopping point for the hooks); lastTurn: the last finished turn, a hook basis trigger;
  // shown: the hooks on screen (useNextSteps), for the decision trace. desk: what Tutor-made material shows in extras - the
  // paid card waiting for Generate / Not now, and the notices of material that could not be made. It is plain state read
  // when extras is drawn (redraw re-renders), so a proposal or notice that lands after a render is never lost.
  const [busy, setBusy] = useState(false);
  const [lastTurn, setLastTurn] = useState(null);
  const [, redraw] = useReducer(n => n + 1, 0);
  const desk = useRef({ proposal: null, notices: [] }).current;
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
  // the registered course's; else the canvas domain, reached only by hook clicks (Task 10: typed turns need active).
  const domainOf = canvas => tutorContext({ ...where, journey: journeyRef.current, blocks: canvas?.blocks?.() || [] })?.domain;

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
    const domain = domainOf(canvas);
    if (!domain) return { text: '', handled: true, failed: true };
    const block = nextStep ? null : canvas?.block?.(targetId) || canvas?.block?.(stateRef.current.card?.id) || null;
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
    const common = { canvas: { ...here, ...(record ? { dive: record } : {}) }, access, block, inputModality, turnId, domain, post };
    // §7.2, D6: the journey's resolver first (handleText: rules 1-4, then the model's rule 5; never punctuation). A tray
    // answer, path edit, cancel, clarification or second broad intent is the journey's and never reaches the planner. A
    // free-text answer to the open diagnostic probe is a Tutor turn without a plan (§6.3): runTurn({ plan: false }) with
    // the probe as the open question, so buildTurn reads it as answering and the evaluate route stores the probe's
    // evidence; the walker steps on after. Anything else (an unrelated question, Ask the Tutor's words) is answered below,
    // in the journey domain. A slash, a hole's opening or a hook click is a Tutor turn as it is.
    if (live && !slash && !opening && !skipJourney && !nextStep) {
      const answerProbe = async (probe, text) => save((await runTurn({ ...common, raw: text, plan: false, store: { ...load(), open: { action_id: probe.id, claim: probe.claims[0], text: probe.prompt, canvas: here } } })).store);
      const routed = await live.handleText(raw, { answerProbe });
      if (routed.handled) return { text: '', handled: true, failed: !!routed.failed };
      raw = routed.text ?? raw;
    }
    onAnswer?.();
    let result;
    try {
      result = await runTurn({
        ...common, raw: nextStep ? '' : (slash?.raw || raw), slash: slash?.name || null, opening, store: load(), onSpeakable,
        nextStep, materials: nextStep ? materialCommands() : [],
        // Decision telemetry only while a sink is registered (contract §3.3); the planner request is the same either way.
        trace: tracing() && { identity: { canvas_version: canvasVersion }, blocks: canvas?.blocks?.() || [], next_step_options: shown.current, selected_at: selectedAt },
        // Only a domain whose cards are inserted (no showCard of its own: the authored-module one) holds a place. A journey's
        // cards are blocks already on the canvas (its showCard reveals, never inserts), so a held place would never be
        // taken; and before the path is accepted the canvas gets no card at all.
        onTurn: built => { if (!domain.showCard && wantsCard(built)) slot = canvas?.reserve?.({ label: 'Creating a card…', card: 'animation', samples: showableCards(domain) }) ?? null; },
      });
    } catch (error) {
      release();
      bench({ error: error?.name || 'Error', trace: error?.trace ?? null, ms: { total_in_app: Math.round((performance.now() - started) * 10) / 10 } });
      throw error;
    }
    save(result.store);
    if (result.log.length) console.info('[tutor]', result.routed.row, result.log.join('; '));
    setChips(executeActions(result.actions, {
      canvas: canvasApi.current || {},
      suggestDive: detail => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail })),
      climb: () => dive.navigator.climb(dive.navigator.tree.path.length - 2),
      slot, domain,
    }));
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
  }, [access, record, here.app, here.board, key, parentJourney, courseCanvas, root, canvasVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  // Paid proposals from create_material, one at a time: each waits until the one before it is answered (PaidConfirm).
  const offer = next => (asking.current = asking.current.then(() => new Promise(done => put({ proposal: { ...next, done } }))));
  // Generate or Not now: the offer always clears and the next one shows, even when generate throws.
  const decide = generate => {
    const { proposal } = desk;
    try { if (generate) proposal.generate(); } finally { put({ proposal: null }); proposal.done(); }
  };
  // A new turn starts clean: the chips and the notices of the turn before (a waiting paid card stays until answered).
  const fresh = () => { setChips([]); if (desk.notices.length) put({ notices: [] }); };
  // Any turn in flight is busy: a stopping point for the hooks (stoppingPoint), until the last one ends.
  const tracked = async args => {
    flying.current += 1;
    setBusy(true);
    try { return await turn(args); } finally { flying.current -= 1; if (!flying.current) setBusy(false); }
  };

  // A hole's opening turn (§6.4): once per hole, the pending question asked inside the hole. The
  // dock sends it like a typed message (ask.jsx), so it reads as the learner's question carried down
  // and never lands on the empty hole's canvas.
  const [opening, setOpening] = useState(null);
  useEffect(() => {
    if (!active || !record?.dive_id) return;
    const store = enterHole(load(), record, domainOf(canvasApi.current));
    const question = openingQuestion(store, record);
    save(question ? markOpened(store, record) : store);
    if (question) setOpening({ key: record.dive_id, question });
  }, [active, record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // hole's parent journey and record. showing(options): the hooks on screen, named in the next turn's decision trace.
  const steps = {
    askStep, lastTurn, busy,
    snapshot: () => ({ context: tutorContext({ ...where, journey: journeyRef.current, blocks: canvasApi.current?.blocks?.() || [] }), store: load(), parent: parentJourney, record }),
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
  if (!hookTurns) return { active: false, ...steps };
  if (!active) return { active: false, ...steps, opening, get extras() { return hasMade() ? made() : null; } };
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
    // prompt (busy), so no stale command waits for the next turn.
    slash: (name, raw) => { slashNext.current = name ? { name, raw } : null; },
    // Shown under the Tutor's reply in the chat (ask.jsx): the dive suggestion, whose "Keep it on
    // this canvas" also gives the next turn here dive_choice inline, the suggestion chips, and Tutor-made material's notices
    // and Generate / Not now (read when drawn).
    get extras() { return (dive.suggestionCard || chips.length || hasMade()) ? <>
      {dive.suggestionCard && cloneElement(dive.suggestionCard, { onKeep: () => { save(keepHere(load(), here)); dive.suggestionCard.props.onKeep(); } })}
      {chips.length > 0 && <div data-tutor-chips role="group" aria-label="Tutor suggestions" className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <button key={chip.label} type="button" onClick={() => { chip.run(); setChips(previous => previous.filter(other => other !== chip)); }}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm hover:bg-hover">
            {chip.label}
          </button>
        ))}
      </div>}
      {made()}
    </> : null; },
  };
}
