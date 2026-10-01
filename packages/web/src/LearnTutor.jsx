// Tutor v1 on the Learn page (docs/features/tutor-v1-implementation-map.md §5). Active only on the
// NanoGPT Attention slice board and the Rabbit Holes under it. The dock composer hands learner
// messages here instead of /api/learn/ask; /dive stays /dive's (Dive.jsx), and the Tutor only
// proposes a dive through it.
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import { api, apiFetch } from './api.js';
import { TUTOR_BOARD } from './learn-tutor-claims.js';
import { loadStore, saveStore, storeKey } from './learn-tutor-evidence.js';
import { arriveAt, enterHole, executeActions, keepHere, markOpened, openingQuestion, readPlanStream, runTurn } from './learn-tutor.js';

// A Tutor request that never answers ends as an error reply, not an endless spinner; Stop ends it too.
const TURN_TIMEOUT_MS = 60000;

export function useTutor({ app, board, access, canvasApi, canvasState, dive }) {
  const record = dive.tree?.dive || null;
  const active = board === TUTOR_BOARD || dive.tree?.path?.[0]?.board === TUTOR_BOARD;
  const here = { app: app.name, board };
  const key = storeKey(app);
  const [chips, setChips] = useState([]);
  const slashNext = useRef(null);
  const stateRef = useRef(canvasState); stateRef.current = canvasState;
  const load = () => loadStore(sessionStorage, key);
  const save = store => saveStore(sessionStorage, key, store);

  // Back on a parent after a hole: its next turn carries returned_from (§6.4).
  useEffect(() => { if (active) save(arriveAt(load(), here)); }, [active, here.app, here.board]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolves the turn's result once its canvas actions have run; typed and voice turns share it.
  // onSpeakable (voice): the plan streams, and its first validated, self-contained sentence is handed over
  // before the plan is complete (runTurn, learn-tutor-validate.js speakable) so Fish can start on it.
  const turn = useCallback(async ({ raw, targetId = null, opening = false, signal, inputModality = 'text', turnId = null, onSpeakable = null }) => {
    const canvas = canvasApi.current;
    const block = canvas?.block?.(targetId) || canvas?.block?.(stateRef.current.card?.id) || null;
    const slash = slashNext.current;
    slashNext.current = null;
    // The per-turn benchmark record (e2e/tutor-bench.mjs listens); a failed turn reports its error name.
    const started = performance.now();
    const bench = detail => window.dispatchEvent(new CustomEvent('small:tutor-bench', { detail }));
    let result;
    try {
      result = await runTurn({
        raw: slash?.raw || raw, slash: slash?.name || null, opening,
        canvas: { ...here, ...(record ? { dive: record } : {}) },
        access, block, store: load(), inputModality, turnId, onSpeakable,
        post: (path, body, stream) => {
          const limit = AbortSignal.any([AbortSignal.timeout(TURN_TIMEOUT_MS), ...(signal ? [signal] : [])]);
          // A streamed plan (body.stream, NDJSON): its sentences reach onSentence as they validate.
          if (stream?.onSentence) return apiFetch(path, { method: 'POST', body: JSON.stringify(body), signal: limit }).then(response => readPlanStream(response, stream.onSentence));
          return api(path, { method: 'POST', body: JSON.stringify(body), signal: limit });
        },
      });
    } catch (error) {
      bench({ error: error?.name || 'Error', trace: error?.trace ?? null, ms: { total_in_app: Math.round((performance.now() - started) * 10) / 10 } });
      throw error;
    }
    save(result.store);
    if (result.log.length) console.info('[tutor]', result.routed.row, result.log.join('; '));
    setChips(executeActions(result.actions, {
      canvas: canvasApi.current || {},
      suggestDive: detail => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail })),
      climb: () => dive.navigator.climb(dive.navigator.tree.path.length - 2),
    }));
    result.mark('canvas_action_complete');
    result.mark('reply_ready'); // the reply text goes to the chat now; tutor-bench measures when it is drawn
    const done = Math.round((performance.now() - started) * 10) / 10;
    bench({ ...result.bench, ms: { ...result.bench.ms, canvas_done: done, total_in_app: done } });
    return { ...result, bench: { ...result.bench, ms: { ...result.bench.ms, canvas_done: done } } };
  }, [access, record, here.app, here.board]); // eslint-disable-line react-hooks/exhaustive-deps

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
    ask: async ({ raw, targetId, opening: first = false, signal, inputModality = 'text', turnId }) => {
      setChips([]);
      const result = await turn({ raw, targetId, opening: first, signal, inputModality, turnId });
      // An empty reply is drawn as the spinner (ask.jsx), so a turn that only acts on the canvas says so.
      return result.text || (result.actions.some(action => action.type !== 'no_action') ? 'See the canvas.' : 'Nothing to add here yet.');
    },
    // Voice Mode (docs/features/voice-tutor-mvp.md §1): the same turn, spoken. `speech` is the Tutor's
    // own words or '' - never a fallback; `ms` are the turn's timings for the voice telemetry.
    voiceTurn: async ({ raw, targetId, signal, turnId, onSpeakable = null }) => {
      setChips([]);
      const result = await turn({ raw, targetId, signal, inputModality: 'voice', turnId, onSpeakable });
      return { speech: result.text, turnId: result.turn.turn_id, ms: result.bench.ms };
    },
    opening,
    // /deeper and /simplify go to the Tutor as the turn's slash (§5): its prompt is sent through
    // the composer as usual, and the Tutor reads the typed command in its place.
    slash: (name, raw) => { slashNext.current = { name, raw }; },
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
