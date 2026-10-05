// Tutor v1 on the Learn page (docs/features/tutor-v1-implementation-map.md §5). Active only on the
// NanoGPT Attention slice board and the Rabbit Holes under it. The dock composer hands learner
// messages here instead of /api/learn/ask; /dive stays /dive's (Dive.jsx), and the Tutor only
// proposes a dive through it.
// LP1 Task 12 (docs/features/adaptive-learning-path-v1-architecture.md §0 D1 and D6, §2, §7.2): on a canvas with a live
// learning journey Tutor v2 is the one Tutor, with the journey domain (learn-journey-domain.js), and the journey's
// resolver runs at the top of turn(), which typed and voice turns share.
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import { api, apiFetch } from './api.js';
import { NANOGPT, TUTOR_BOARD } from './learn-tutor-claims.js';
import { loadStore, saveStore, storeKey } from './learn-tutor-evidence.js';
import { journeyDomain } from './learn-journey-domain.js';
import { arriveAt, enterHole, executeActions, keepHere, markOpened, openingQuestion, readPlanStream, runTurn, showableCards, wantsCard } from './learn-tutor.js';

// A Tutor request that never answers ends as an error reply, not an endless spinner; Stop ends it too.
const TURN_TIMEOUT_MS = 60000;

// on: this canvas is the supplied NanoGPT course, whose composer is the Tutor (LearnPage.jsx). A Rabbit Hole keeps the
// Tutor when its root is that course's repository (the server names a repository root by its repo) or the slice board.
// journey: the board's journey (useJourney, LearnJourney.jsx); a live one makes the Tutor this canvas's responder.
export const COURSE_REPO = 'karpathy/nanoGPT';
export function useTutor({ app, board, access, canvasApi, canvasState, dive, on = false, journey = null }) {
  const record = dive.tree?.dive || null;
  const root = dive.tree?.path?.[0];
  const active = on || board === TUTOR_BOARD || root?.board === TUTOR_BOARD || (root?.kind === 'repository' && root.title === COURSE_REPO) || !!journey?.journey;
  const here = { app: app.name, board };
  // A journey's conversational store is its own (§5): open question, turns, Socratic counts. Its evidence is the server's.
  const journeyId = journey?.journey?.id ?? null;
  const key = journeyId ? `${storeKey(app)}:journey:${journeyId}` : storeKey(app);
  const [chips, setChips] = useState([]);
  const slashNext = useRef(null);
  const stateRef = useRef(canvasState); stateRef.current = canvasState;
  const journeyRef = useRef(journey); journeyRef.current = journey;
  // The journey's server events replace the stored copy when they are newer: the last turn here adopted them, so the two
  // agree until an option click or another tab stores more.
  const load = () => {
    const store = loadStore(sessionStorage, key), evidence = journeyRef.current?.journey?.evidence;
    return evidence && evidence.seq > store.seq ? { ...store, events: evidence.events, seq: evidence.seq } : store;
  };
  const save = store => saveStore(sessionStorage, key, store);

  // Back on a parent after a hole: its next turn carries returned_from (§6.4).
  useEffect(() => { if (active) save(arriveAt(load(), here)); }, [active, here.app, here.board]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolves the turn's result once its canvas actions have run; typed and voice turns share it.
  // onSpeakable (voice): the plan streams, and its first validated, self-contained sentence is handed over
  // before the plan is complete (runTurn, learn-tutor-validate.js speakable) so Fish can start on it.
  // skipJourney: the learner chose Ask the Tutor for these words, so the journey's resolver has had them. onAnswer: called
  // once the turn is the Tutor's to answer (the composer draws its exchange then); a turn the journey takes never calls
  // it and resolves to { text: '', handled: true, failed }.
  const turn = useCallback(async ({ raw, targetId = null, opening = false, signal, inputModality = 'text', turnId = null, onSpeakable = null, skipJourney = false, onAnswer = null }) => {
    const canvas = canvasApi.current;
    const block = canvas?.block?.(targetId) || canvas?.block?.(stateRef.current.card?.id) || null;
    const slash = slashNext.current;
    slashNext.current = null;
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
    // A journey canvas (§3.2): the journey domain, built per turn from the journey, its path and the canvas blocks.
    const live = journeyRef.current?.journey ? journeyRef.current : null;
    const domain = live ? journeyDomain({ journey: live.journey, path: live.path, blocks: canvas?.blocks?.() || [] }) : NANOGPT;
    const common = { canvas: { ...here, ...(record ? { dive: record } : {}) }, access, block, inputModality, turnId, domain, post };
    // §7.2, D6: the journey's resolver first (handleText: rules 1-4, then the model's rule 5; never punctuation). A tray
    // answer, path edit, cancel, clarification or second broad intent is the journey's and never reaches the planner. A
    // free-text answer to the open diagnostic probe is a Tutor turn without a plan (§6.3): runTurn({ plan: false }) with
    // the probe as the open question, so buildTurn reads it as answering and the evaluate route stores the probe's
    // evidence; the walker steps on after. Anything else (an unrelated question, Ask the Tutor's words) is answered below,
    // in the journey domain. A slash or a hole's opening is a Tutor turn as it is.
    if (live && !slash && !opening && !skipJourney) {
      const answerProbe = async (probe, text) => save((await runTurn({ ...common, raw: text, plan: false, store: { ...load(), open: { action_id: probe.id, claim: probe.claims[0], text: probe.prompt, canvas: here } } })).store);
      const routed = await live.handleText(raw, { answerProbe });
      if (routed.handled) return { text: '', handled: true, failed: !!routed.failed };
      raw = routed.text ?? raw;
    }
    onAnswer?.();
    let result;
    try {
      result = await runTurn({
        ...common, raw: slash?.raw || raw, slash: slash?.name || null, opening, store: load(), onSpeakable,
        // A journey's cards are blocks already on the canvas (its showCard reveals, never inserts), so a held place would
        // never be taken; and before the path is accepted the canvas gets no card at all.
        onTurn: built => { if (domain === NANOGPT && wantsCard(built)) slot = canvas?.reserve?.({ label: 'Creating a card…', card: 'animation', samples: showableCards() }) ?? null; },
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
    result.mark('canvas_action_complete');
    result.mark('reply_ready'); // the reply text goes to the chat now; tutor-bench measures when it is drawn
    const done = Math.round((performance.now() - started) * 10) / 10;
    bench({ ...result.bench, ms: { ...result.bench.ms, canvas_done: done, total_in_app: done } });
    return { ...result, bench: { ...result.bench, ms: { ...result.bench.ms, canvas_done: done } } };
  }, [access, record, here.app, here.board, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hole's opening turn (§6.4): once per hole, the pending question asked inside the hole. The
  // dock sends it like a typed message (ask.jsx), so it reads as the learner's question carried down
  // and never lands on the empty hole's canvas.
  const [opening, setOpening] = useState(null);
  useEffect(() => {
    if (!active || !record?.dive_id) return;
    const store = enterHole(load(), record);
    const question = openingQuestion(store, record);
    save(question ? markOpened(store, record) : store);
    if (question) setOpening({ key: record.dive_id, question });
  }, [active, record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return { active: false };
  return {
    active: true,
    // begin (ask.jsx): draws the turn's chat bubbles and exchange, once the turn is the Tutor's. A turn the journey took
    // resolves to { handled: true, failed } and draws nothing.
    ask: async ({ raw, targetId, opening: first = false, signal, inputModality = 'text', turnId, skipJourney = false, begin = null }) => {
      setChips([]);
      const result = await turn({ raw, targetId, opening: first, signal, inputModality, turnId, skipJourney, onAnswer: begin });
      if (result.handled) return result;
      // An empty reply is drawn as the spinner (ask.jsx), so a turn that only acts on the canvas says so.
      return result.text || (result.actions.some(action => action.type !== 'no_action') ? 'See the canvas.' : 'Nothing to add here yet.');
    },
    // Voice Mode (docs/features/voice-tutor-mvp.md §1): the same turn, spoken. `speech` is the Tutor's
    // own words or '' - never a fallback; `ms` are the turn's timings for the voice telemetry. A turn the journey took
    // says nothing: the tray shows where the journey is.
    voiceTurn: async ({ raw, targetId, signal, turnId, onSpeakable = null, opening = false }) => {
      setChips([]);
      const result = await turn({ raw, targetId, opening, signal, inputModality: 'voice', turnId, onSpeakable });
      if (result.handled) return { speech: '', turnId, ms: {} };
      return { speech: result.text, turnId: result.turn.turn_id, ms: result.bench.ms };
    },
    opening,
    // /deeper and /simplify go to the Tutor as the turn's slash (§5): its prompt is sent through
    // the composer as usual, and the Tutor reads the typed command in its place. slash(null): the composer refused that
    // prompt (busy), so no stale command waits for the next turn.
    slash: (name, raw) => { slashNext.current = name ? { name, raw } : null; },
    // Shown under the Tutor's reply in the chat (ask.jsx): the dive suggestion, whose "Keep it on
    // this canvas" also gives the next turn here dive_choice inline, and the suggestion chips.
    extras: (dive.suggestionCard || chips.length) ? <>
      {dive.suggestionCard && cloneElement(dive.suggestionCard, { onKeep: () => { save(keepHere(load(), here)); dive.suggestionCard.props.onKeep(); } })}
      {chips.length > 0 && <div data-tutor-chips role="group" aria-label="Tutor suggestions" className="flex flex-wrap gap-2">
        {chips.map(chip => (
          <button key={chip.label} type="button" onClick={() => { chip.run(); setChips(previous => previous.filter(other => other !== chip)); }}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm hover:bg-hover">
            {chip.label}
          </button>
        ))}
      </div>}
    </> : null,
  };
}
