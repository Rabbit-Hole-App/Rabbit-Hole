// Tutor v1 on the Learn page (docs/features/tutor-v1-implementation-map.md §5). Active only on the
// NanoGPT Attention slice board and the Rabbit Holes under it. The dock composer hands learner
// messages here instead of /api/learn/ask; /dive stays /dive's (Dive.jsx), and the Tutor only
// proposes a dive through it.
import { cloneElement, useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { TUTOR_BOARD } from './learn-tutor-claims.js';
import { loadStore, saveStore, storeKey } from './learn-tutor-evidence.js';
import { arriveAt, enterHole, executeActions, keepHere, markOpened, openingQuestion, runTurn } from './learn-tutor.js';

export function useTutor({ app, board, access, canvasApi, canvasState, dive, placeExchange }) {
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

  const turn = useCallback(async ({ raw, targetId = null, opening = false }) => {
    const canvas = canvasApi.current;
    const block = canvas?.block?.(targetId) || canvas?.block?.(stateRef.current.card?.id) || null;
    const slash = slashNext.current;
    slashNext.current = null;
    const result = await runTurn({
      raw: slash?.raw || raw, slash: slash?.name || null, opening,
      canvas: { ...here, ...(record ? { dive: record } : {}) },
      access, block, store: load(),
      post: (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) }),
    });
    save(result.store);
    if (result.log.length) console.info('[tutor]', result.routed.row, result.log.join('; '));
    setChips(executeActions(result.actions, {
      canvas: canvasApi.current || {},
      suggestDive: detail => window.dispatchEvent(new CustomEvent('small:dive-suggest', { detail })),
      climb: () => dive.navigator.climb(dive.navigator.tree.path.length - 2),
    }));
    return result.text || (result.actions.some(action => action.type !== 'no_action') ? '' : 'Nothing to add here yet.');
  }, [access, record, here.app, here.board]); // eslint-disable-line react-hooks/exhaustive-deps

  // A hole's opening turn (§6.4): once, answering the pending question inside the hole.
  const opened = useRef(null);
  useEffect(() => {
    if (!active || !record?.dive_id || opened.current === record.dive_id) return;
    opened.current = record.dive_id;
    let store = enterHole(load(), record);
    const question = openingQuestion(store, record);
    save(store);
    if (!question) return;
    save(store = markOpened(store, record));
    const id = crypto.randomUUID();
    placeExchange({ id, question });
    turn({ raw: question, opening: true })
      .then(text => placeExchange({ id, delta: text }))
      .catch(error => placeExchange({ id, delta: `✗ ${error.message}` }))
      .finally(() => placeExchange({ id, done: true }));
  }, [active, record?.dive_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return { active: false };
  return {
    active: true,
    ask: ({ raw, targetId }) => { setChips([]); return turn({ raw, targetId }); },
    // /deeper and /simplify go to the Tutor as the turn's slash (§5): its prompt is sent through
    // the composer as usual, and the Tutor reads the typed command in its place.
    slash: (name, raw) => { slashNext.current = { name, raw }; },
    // "Keep it on this canvas" on the dive suggestion: the next turn here gets dive_choice inline.
    wrapSuggestion: card => card && cloneElement(card, { onKeep: () => { save(keepHere(load(), here)); card.props.onKeep(); } }),
    chipBar: chips.length ? (
      <div data-tutor-chips role="group" aria-label="Tutor suggestions" className="flex flex-wrap justify-center gap-2">
        {chips.map(chip => (
          <button key={chip.label} type="button" onClick={() => { chip.run(); setChips(previous => previous.filter(other => other !== chip)); }}
            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm hover:bg-hover">
            {chip.label}
          </button>
        ))}
      </div>
    ) : null,
  };
}
