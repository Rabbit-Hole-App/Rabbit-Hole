// The one React seam for the roadmap: owns a controller per board, mirrors its state, tracks the overlay anchor, and listens for
// plain Tab. Everything it returns is derived from the server view (roadmap-client.js); the page passes a `host` describing the canvas:
//   hasBlock(id), insertCard(block), persist(), boardRevision(), savedHas(id), readOnly(), presenting(), editorOpen(), focusBlock(id),
//   sourceElement(sourceKey) -> the source card's DOM element or null, sourceRev(key), instruction(), depth().
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoadmapController } from './roadmap-controller.js';
import { anchorState, overlayPosition, overlayShown } from './roadmap-placement.js';
import { chatOf, claimsFocus, invitationOf, lessonSourcesOf, keyboardOwned, pillOf, tabAccepts, tocOf } from './roadmap-client.js';
import { pageKeyAllowed } from './shortcut-owner.js';
import { opensEditor } from './inline-ai-proposal.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';

const METHODS = ['hasBlock', 'insertCard', 'persist', 'boardRevision', 'savedHas', 'settled', 'readOnly', 'sourceRev', 'sourceName', 'instruction', 'depth', 'sources'];
const rectOf = element => { const r = element?.getBoundingClientRect?.(); return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; };
const same = (a, b) => (!a && !b) || (a && b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height);

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

  const pill = pillOf(state);
  // The overlay follows its source card while a proposal is pending: one frame loop, state set only when the rect moved.
  const [geometry, setGeometry] = useState({ anchor: null, surface: null });
  useEffect(() => {
    if (!pill) return undefined;
    let frame = 0;
    const measure = () => {
      const anchor = rectOf(hostRef.current?.sourceElement?.(pill.sourceKey)), surface = rectOf(document.querySelector('[data-canvas-surface]'));
      setGeometry(previous => (same(previous.anchor, anchor) && same(previous.surface, surface) ? previous : { anchor, surface }));
      frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [pill?.proposalId, pill?.version, pill?.sourceKey]);
  const surface = geometry.surface || { left: 0, top: 0, width: typeof window === 'undefined' ? 800 : window.innerWidth, height: typeof window === 'undefined' ? 600 : window.innerHeight };
  const where = anchorState(geometry.anchor, geometry.surface);

  // Plain Tab (D18): only for the selected current proposal, with the keyboard on the page, canvas or overlay, no editor, dialog,
  // composer or card widget, no Shift/Ctrl/Alt/Meta, no repeat. Everything else keeps the browser's focus movement.
  const live = useRef(null);
  live.current = { controller, pill };
  useEffect(() => {
    const onKey = event => {
      const { controller: current, pill: now } = live.current, h = hostRef.current || {};
      // R5: Ctrl/Cmd+K claims the editor only with the keyboard on the proposal overlay itself, so Quick Edit on a selected card is untouched.
      const editing = current.getState().editing;
      if (opensEditor(event, { onProposal: !!now?.canEdit && !!document.activeElement?.closest?.('[data-roadmap-overlay]'), editorOpen: editing || !!h.editorOpen?.(), readOnly: !!h.readOnly?.() })) { event.preventDefault(); event.stopPropagation(); current.openEditor(); return; }
      const blocked = !pageKeyAllowed(event) || !keyboardOwned(document.activeElement);
      if (!tabAccepts({ event, pill: now, blocked, editorOpen: editing || !!h.editorOpen?.(), presenting: !!h.presenting?.(), readOnly: !!h.readOnly?.() })) return;
      event.preventDefault();
      event.stopPropagation();
      current.acceptProposal();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Accept plan hands the keyboard to the first proposal: the button unmounts when the plan is accepted, so the learner is left on the
  // page with nothing focused. One shot per Accept plan; dropped when focus moves anywhere else, the learner is typing, the request
  // fails, or the overlay is not on screen. Tab then accepts through the same acceptProposal() as the button.
  const handoff = useRef(false);
  const acceptPlan = useCallback(() => { handoff.current = true; return controller.acceptPlan().then(body => { if (!body) handoff.current = false; return body; }); }, [controller]);
  useEffect(() => {
    const moved = event => { if (!event.target?.closest?.('[data-roadmap-accept-plan]')) handoff.current = false; };
    document.addEventListener('focusin', moved);
    return () => document.removeEventListener('focusin', moved);
  }, []);
  const showOverlay = overlayShown({ pill, visible: where.visible, editing: state.editing });
  useEffect(() => {
    if (!handoff.current || !pill) return;
    handoff.current = false;
    // The canvas slot is drawn one commit after the proposal appears: look again on the next two frames before giving up.
    const take = left => { const owner = document.querySelector('[data-roadmap-overlay]'); if (owner) owner.focus({ preventScroll: true }); else if (left) requestAnimationFrame(() => { if (claimsFocus(document.activeElement, { typing: busyRef.current })) take(left - 1); }); };
    if (showOverlay && claimsFocus(document.activeElement, { typing: busyRef.current })) take(2);
  }, [pill?.proposalId, pill?.version, showOverlay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Edit roadmap is a targeted pill in the real Chat composer (RoadmapTranscript.jsx, chat-workspace.jsx editing); the typed change goes to
  // the roadmap revision as its instruction (ask.jsx send -> controller.revise). Navigation only: never accepts, generates or charges.
  // source: the roadmap's source card (Go to highlighted text frames it; the verified passage scroll is UI.07's).
  const go = useCallback(nav => {
    const h = hostRef.current, view = controller.getState().view;
    if (nav.kind === 'card') h?.focusBlock?.(nav.cardId);
    else if (nav.kind === 'proposal') h?.focusBlock?.(h.sourceBlockId?.(live.current.pill?.sourceKey || view?.roadmap?.scope?.source?.key));
    else if (nav.kind === 'source') { const id = h?.sourceBlockId?.(view?.roadmap?.scope?.source?.key); if (id) h.focusBlock?.(id); else h?.notice?.('The source file is not on this canvas.'); } // a source card that is gone said nothing before
  }, [controller]);

  return {
    lessonSources: () => lessonSourcesOf(controller.getState(), hostRef.current?.sources?.() || []),
    state, controller, pill, active: !!state.view && state.flag !== 'off' && isUnfinishedRoadmap(state.view.roadmap.state), toc: tocOf(state), lines: chatOf(state), invitation: invitationOf(state),
    position: overlayPosition(geometry.anchor, surface), surface, showOverlay,
    acceptPlan, go, restoreCard: resultId => controller.restoreCard(resultId), sourceReady: key => controller.sourceReady(key),
    on: enabled && !!boardId && state.flag !== 'off', // the roadmap runs on this canvas: its lines render in Chat's transcript (RoadmapTranscript.jsx)
  };
}
