// The Explain-back durable attempt store the card reads through ExplainBackService (ExplainBackPanel.jsx documents the
// value; plan 2026-10-30-explain-back.md EB-04.3). LearnPage provides it around the canvas when VITE_EXPLAIN_BACK is
// 'true'; otherwise the card keeps its legacy single-attempt grade. Reads never call a model; submit saves one immutable
// attempt and its one assessment runs inside that request (learn-attempt-routes.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { AttemptRequestError, bindCard, listAttempts, newSubmissionKey, readAttempt, readSketchMeta, reassessAttempt, submitAnswer } from './explain-back-client.js';
import { EXPLAIN_BACK_KIND, ANSWER_VERSION } from './explain-back-contract.js';

// On in dev and CI builds (VITE_COACHING_DEV) and when VITE_EXPLAIN_BACK is set; production builds set neither until release.
export const explainBackEnabled = () => import.meta.env?.VITE_EXPLAIN_BACK === 'true' || import.meta.env?.VITE_COACHING_DEV === 'true';

const MESSAGES = {
  stale_baseline: 'the attempt you are revising was reviewed again; open it and revise once more',
  baseline_not_found: 'the attempt you are revising is no longer available',
  empty_answer: 'add an answer, a voice note or a sketch first',
  evidence_unavailable: 'an input is still uploading or unavailable',
  unknown_asset: 'a recording or sketch could not be found',
  cross_scope_evidence: 'an input belongs to another canvas',
  self_reference: 'a card cannot be its own input',
  submission_too_large: 'the answer is too large',
  attempts_unavailable: 'saving is unavailable right now',
};
const UNCONFIRMED = 'the connection dropped before the save was confirmed; submit again to finish (it will not be saved twice)';
const readable = error => (error instanceof AttemptRequestError ? MESSAGES[error.code] || error.code.replace(/_/g, ' ') : error instanceof TypeError ? UNCONFIRMED : error?.message || 'try again');

// The pending submission key survives a reload (sessionStorage, this tab only), so resubmitting after a lost response
// replays the saved attempt instead of saving and assessing it twice.
const keyStore = (app, board) => {
  const name = id => `rh.explain-back.key:${app}:${board}:${id}`;
  const store = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
  return {
    get: id => { try { return store()?.getItem(name(id)) || null; } catch { return null; } },
    set: (id, key) => { try { store()?.setItem(name(id), key); } catch { /* memory only */ } },
    clear: id => { try { store()?.removeItem(name(id)); } catch { /* memory only */ } },
  };
};
const assetUrl = (app, board, assetId) => `/api/learn/tutor/attempts/assets/${encodeURIComponent(assetId)}?${new URLSearchParams({ app, board })}`;

// Oldest first, each with its submitted content and latest assessment (what explain-back-view.js serviceView reads).
async function loadCard({ app, board, cardId }) {
  const list = await listAttempts({ app, board, cardId });
  const attempts = await Promise.all(list.slice().reverse().map(async entry => {
    const view = await readAttempt({ app, board, attemptId: entry.attemptId });
    const submittedContent = view.attempt?.submittedContent || {};
    const sketchId = submittedContent.sketch?.assetId;
    return { attemptId: entry.attemptId, submittedContent, assessment: view.assessment || null, sketchUrl: sketchId ? assetUrl(app, board, sketchId) : null };
  }));
  return { attempts };
}

/** @returns the ExplainBackService value, or null when the durable path is off or the board is unknown. */
export function useExplainBackService({ app, board, enabled = explainBackEnabled(), assets = null, canvasApi = null }) {
  const [cards, setCards] = useState(() => new Map());
  const cardsRef = useRef(cards); cardsRef.current = cards;
  const bindings = useRef(new Map());
  const pending = useRef(new Set());
  const keys = useRef(new Map());
  const retrying = useRef(new Map());
  const scope = `${app}\u0000${board}`;
  useEffect(() => { setCards(new Map()); bindings.current.clear(); pending.current.clear(); keys.current.clear(); retrying.current.clear(); }, [scope]);

  return useMemo(() => {
    if (!enabled || !app || !board) return null;
    const saved = keyStore(app, board);
    const keyOf = id => keys.current.get(id) || saved.get(id);
    const setKey = (id, key) => { keys.current.set(id, key); saved.set(id, key); };
    const put = (id, raw) => setCards(previous => new Map(previous).set(id, raw));
    const refresh = id => loadCard({ app, board, cardId: id })
      .then(raw => put(id, raw))
      .catch(error => put(id, { attempts: cardsRef.current.get(id)?.attempts || [], error: readable(error) }));
    const bind = block => {
      const expects = Array.isArray(block.expects) ? block.expects : [];
      const key = JSON.stringify([block.id, block.prompt || '', expects]);
      if (!bindings.current.has(key)) bindings.current.set(key, bindCard({ app, board, cardId: block.id, prompt: block.prompt || '', expects }).catch(error => { bindings.current.delete(key); throw error; }));
      return bindings.current.get(key);
    };
    return {
      app,
      board,
      card(blockId) {
        const raw = cardsRef.current.get(blockId);
        if (!raw && !pending.current.has(blockId)) { pending.current.add(blockId); queueMicrotask(() => refresh(blockId)); }
        return raw || null;
      },
      async submit({ block, text = '', sketch = null, voice = null, recording = null, parentAttemptId = null, resources = [], snapshots = [] }) {
        try {
          const binding = await bind(block);
          // A sketch is never sent as text only: without the private asset store it is refused with a reason.
          if (sketch && !assets?.uploadSketch) throw new Error('Sketch answers are not available on this build');
          const sketchRef = sketch ? await assets.uploadSketch({ block, sketch }) : null;
          const parent = parentAttemptId ? cardsRef.current.get(block.id)?.attempts.find(entry => entry.attemptId === parentAttemptId) : null;
          const baseline = parentAttemptId ? { parentAttemptId, parentAssessmentId: parent?.assessment?.status === 'completed' ? parent.assessment.assessmentId : null } : null;
          const answer = {
            v: ANSWER_VERSION, kind: EXPLAIN_BACK_KIND, text, voice: voice ? [voice] : [], resources, assistance: [],
            ...(sketchRef ? { sketch: sketchRef } : {}), ...(recording ? { recording } : {}), ...(baseline ? { baseline } : {}),
          };
          // One key per card until a submission saves, so a lost response replays instead of saving twice. A key the
          // server already holds for other content (the learner edited after a lost response) gets a fresh key once.
          const send = () => submitAnswer({ app, board, binding, submissionKey: keyOf(block.id), answer, snapshots });
          if (!keyOf(block.id)) setKey(block.id, newSubmissionKey());
          try { await send(); } catch (error) {
            if (!(error instanceof AttemptRequestError && error.code === 'submission_key_conflict')) throw error;
            setKey(block.id, newSubmissionKey());
            await send();
          }
          keys.current.delete(block.id); saved.clear(block.id);
        } catch (error) {
          throw new Error(readable(error));
        } finally {
          await refresh(block.id);
        }
      },
      // One re-review at a time per attempt, with one request key until it settles (a double click never pays twice).
      retry({ block, attemptId }) {
        if (retrying.current.has(attemptId)) return retrying.current.get(attemptId);
        const slot = `retry:${attemptId}`;
        if (!keyOf(slot)) setKey(slot, newSubmissionKey());
        const run = reassessAttempt({ app, board, attemptId, requestKey: keyOf(slot) })
          .then(() => { keys.current.delete(slot); saved.clear(slot); })
          .finally(() => { retrying.current.delete(attemptId); return refresh(block.id); });
        retrying.current.set(attemptId, run);
        return run;
      },
      voice: assets?.voice || null,
      recording: assets?.recording || null,
      drafts: assets?.drafts || null,
      sketchMeta: assetId => readSketchMeta({ app, board, assetId }),
      VoicePlayer: assets?.VoicePlayer,
      // A cited input: focus the source it came from on this canvas (its submitted revision is what the review read).
      openEvidence({ evidence }) {
        const source = evidence?.connection?.links?.[0]?.from || evidence?.sourceId;
        return source ? !!canvasApi?.current?.focusBlock?.(source) : false;
      },
    };
  }, [enabled, app, board, assets, canvasApi, cards]);
}
