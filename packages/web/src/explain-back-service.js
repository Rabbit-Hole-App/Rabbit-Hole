// The Explain-back durable attempt store the card reads through ExplainBackService (ExplainBackPanel.jsx documents the
// value; plan 2026-10-30-explain-back.md EB-04.3). LearnPage provides it around the canvas when VITE_EXPLAIN_BACK is
// 'true'; otherwise the card keeps its legacy single-attempt grade. Reads never call a model; submit saves one immutable
// attempt and its one assessment runs inside that request (learn-attempt-routes.js).
import { useEffect, useMemo, useRef, useState } from 'react';
import { AttemptRequestError, bindCard, listAttempts, newSubmissionKey, readAttempt, reassessAttempt, submitAnswer } from './explain-back-client.js';
import { EXPLAIN_BACK_KIND, ANSWER_VERSION } from './explain-back-contract.js';

export const explainBackEnabled = () => import.meta.env?.VITE_EXPLAIN_BACK === 'true';

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
const readable = error => (error instanceof AttemptRequestError ? MESSAGES[error.code] || error.code.replace(/_/g, ' ') : error?.message || 'try again');

// Oldest first, each with its submitted content and latest assessment (what explain-back-view.js serviceView reads).
async function loadCard({ app, board, cardId }) {
  const list = await listAttempts({ app, board, cardId });
  const attempts = await Promise.all(list.slice().reverse().map(async entry => {
    const view = await readAttempt({ app, board, attemptId: entry.attemptId });
    return { attemptId: entry.attemptId, submittedContent: view.attempt?.submittedContent || {}, assessment: view.assessment || null };
  }));
  return { attempts };
}

/** @returns the ExplainBackService value, or null when the durable path is off or the board is unknown. */
export function useExplainBackService({ app, board, enabled = explainBackEnabled(), assets = null }) {
  const [cards, setCards] = useState(() => new Map());
  const cardsRef = useRef(cards); cardsRef.current = cards;
  const bindings = useRef(new Map());
  const pending = useRef(new Set());
  const keys = useRef(new Map());
  const scope = `${app}\u0000${board}`;
  useEffect(() => { setCards(new Map()); bindings.current.clear(); pending.current.clear(); keys.current.clear(); }, [scope]);

  return useMemo(() => {
    if (!enabled || !app || !board) return null;
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
      board,
      card(blockId) {
        const raw = cardsRef.current.get(blockId);
        if (!raw && !pending.current.has(blockId)) { pending.current.add(blockId); queueMicrotask(() => refresh(blockId)); }
        return raw || null;
      },
      async submit({ block, text = '', sketch = null, voice = null, parentAttemptId = null, resources = [] }) {
        try {
          const binding = await bind(block);
          // ponytail: Sketch answers wait for the private attempt-asset upload (worker D); until it lands they are refused
          // with a clear message instead of being sent as text only.
          if (sketch && !assets?.uploadSketch) throw new Error('Sketch answers are not available yet on this build');
          const sketchRef = sketch ? await assets.uploadSketch({ block, sketch }) : null;
          const parent = parentAttemptId ? cardsRef.current.get(block.id)?.attempts.find(entry => entry.attemptId === parentAttemptId) : null;
          const baseline = parentAttemptId ? { parentAttemptId, parentAssessmentId: parent?.assessment?.status === 'completed' ? parent.assessment.assessmentId : null } : null;
          const answer = {
            v: ANSWER_VERSION, kind: EXPLAIN_BACK_KIND, text, voice: voice ? [voice] : [], resources, assistance: [],
            ...(sketchRef ? { sketch: sketchRef } : {}), ...(baseline ? { baseline } : {}),
          };
          // One key per card until a submission saves, so a lost response replays instead of saving twice. A key the
          // server already holds for other content (the learner edited after a lost response) gets a fresh key once.
          const send = () => submitAnswer({ app, board, binding, submissionKey: keys.current.get(block.id), answer });
          if (!keys.current.has(block.id)) keys.current.set(block.id, newSubmissionKey());
          try { await send(); } catch (error) {
            if (!(error instanceof AttemptRequestError && error.code === 'submission_key_conflict')) throw error;
            keys.current.set(block.id, newSubmissionKey());
            await send();
          }
          keys.current.delete(block.id);
        } catch (error) {
          throw new Error(readable(error));
        } finally {
          await refresh(block.id);
        }
      },
      async retry({ block, attemptId }) {
        try { await reassessAttempt({ app, board, attemptId, requestKey: newSubmissionKey() }); } finally { await refresh(block.id); }
      },
      voice: assets?.voice || null,
      VoicePlayer: assets?.VoicePlayer,
    };
  }, [enabled, app, board, assets, cards]);
}
