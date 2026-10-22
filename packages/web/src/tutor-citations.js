// The codebase Tutor activity's answer citations (owner brief 2026-10-21 "Selecting evidence"). While a codebase activity is
// shown (TutorActivity.jsx sets the target), selecting lines in a code card or the code reader offers Use in answer; each use
// adds one citation of those lines, as the ref the attempt store will check again (learn-codebase-goals.js citationRef). The
// pills above the answer read this store. Unsent citations live in this tab only, per activity, like the unsent answer.
import { useSyncExternalStore } from 'react';
import { CITATION_MAX, REPOSITORY_SOURCE, citationRef, citationsOverlap, isRepositorySource, linesText } from './learn-codebase-goals.js';

let target = null; // { activityId, repo, refs }: the shown codebase activity and its own repository refs
const drafts = new Map(); // activityId -> citation refs
const listeners = new Set();
let view = { target: null, list: [] };
const emit = () => { view = { target, list: target ? drafts.get(target.activityId) || [] : [] }; for (const listener of listeners) listener(); };
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const useCitations = () => useSyncExternalStore(subscribe, () => view, () => view);

export function setCitationTarget(next) {
  if ((target?.activityId ?? null) === (next?.activityId ?? null) && target?.refs === next?.refs) return;
  target = next; emit();
}
export function setCitations(activityId, list) { drafts.set(activityId, list); if (target?.activityId === activityId) emit(); }

// The activity's cited file for a selection, or null: Use in answer is offered only for files the question cites, at its commit.
// range: { repo, commit, path, start, end } as a reader or code card reports it.
export const citedFile = (range, at = target) => (at && range ? at.refs.find(ref => isRepositorySource(ref) && ref.id === `${range.repo}:${range.path}` && ref.version === range.commit) || null : null);

// Add the selected lines to the answer. -> null when added, else what the learner reads instead.
export function citeRange(range) {
  const file = citedFile(range);
  if (!file) return 'Only code this question cites can be used in your answer.';
  const ref = citationRef(target.refs, { kind: REPOSITORY_SOURCE, id: file.id, version: file.version, hash: file.hash, locator: { path: file.locator.path, start: range.start, end: range.end } });
  if (!ref) return `Only the cited ${linesText(file.locator.start, file.locator.end)} of this file can be used.`;
  const list = drafts.get(target.activityId) || [];
  if (list.some(c => citationsOverlap(c, ref))) return 'Those lines overlap a citation already in your answer.';
  if (list.length >= CITATION_MAX) return `Your answer can carry at most ${CITATION_MAX} citations.`;
  setCitations(target.activityId, [...list, ref]);
  return null;
}
