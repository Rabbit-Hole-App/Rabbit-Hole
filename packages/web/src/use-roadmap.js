// The one React seam for the roadmap: owns a controller per board and mirrors its state. Everything it returns is derived from the server view (roadmap-client.js); the
// page passes a `host` describing the canvas:
//   hasBlock(id), insertCard(block), persist(), boardRevision(), savedHas(id), settled(id), readOnly(), focusBlock(id), notice(message),
//   sourceBlockId(sourceKey), sourceRev(key), sourceName(key), instruction(), depth(), sources().
// Owner 2026-11-14: a course is made from one Generate course, so the per-card offer is gone: no overlay anchor, no plain-Tab accept, no proposal editor.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createRoadmapController } from './roadmap-controller.js';
import { canRetryCourse, canStartCourse, chatOf, courseOf, invitationOf, lessonSourcesOf, tocOf } from './roadmap-client.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';

const METHODS = ['hasBlock', 'insertCard', 'persist', 'boardRevision', 'savedHas', 'settled', 'readOnly', 'sourceRev', 'sourceName', 'instruction', 'depth', 'sources'];

export function useRoadmap({ api, boardId, host, enabled = true, mode = 'auto', typing = false, answering = false }) {
  const hostRef = useRef(host), busyRef = useRef(false);
  hostRef.current = host;
  busyRef.current = typing || answering;
  const controller = useMemo(() => {
    const delegate = Object.fromEntries(METHODS.map(name => [name, (...args) => hostRef.current?.[name]?.(...args)]));
    return createRoadmapController({ api, boardId, host: { ...delegate, busy: () => busyRef.current } });
  }, [api, boardId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => { if (!enabled || !boardId) return undefined; controller.start(); return () => controller.stop(); }, [controller, enabled, boardId]);
  useEffect(() => { controller.setMode(mode); }, [controller, mode]);

  // Navigation only (a table-of-contents row's Go to card, Go to source text): never generates or charges.
  const go = useCallback(nav => {
    const h = hostRef.current, view = controller.getState().view;
    if (nav.kind === 'card') h?.focusBlock?.(nav.cardId);
    else if (nav.kind === 'proposal') h?.focusBlock?.(h.sourceBlockId?.(view?.roadmap?.scope?.source?.key));
    else if (nav.kind === 'source') { const id = h?.sourceBlockId?.(view?.roadmap?.scope?.source?.key); if (id) h.focusBlock?.(id); else h?.notice?.('The source file is not on this canvas.'); } // a source card that is gone said nothing before
  }, [controller]);

  return {
    lessonSources: () => lessonSourcesOf(controller.getState(), hostRef.current?.sources?.() || []),
    state, controller, active: !!state.view && state.flag !== 'off' && isUnfinishedRoadmap(state.view.roadmap.state), toc: tocOf(state), lines: chatOf(state), invitation: invitationOf(state),
    canStartCourse: canStartCourse(state), canRetryCourse: canRetryCourse(state), course: courseOf(state), startCourse: () => controller.startCourse(), stopCourse: () => controller.stopCourse(), retryCourse: () => controller.retryCourse(),
    acceptPlan: () => controller.acceptPlan(), go, restoreCard: resultId => controller.restoreCard(resultId), sourceReady: key => controller.sourceReady(key), expectInvitation: () => controller.expectInvitation(),
    on: enabled && !!boardId && state.flag !== 'off', // the roadmap runs on this canvas: its lines render in Chat's transcript (RoadmapTranscript.jsx)
  };
}
