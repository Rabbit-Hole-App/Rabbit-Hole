// The one React seam for the roadmap: owns a controller per board, mirrors its state, tracks the overlay anchor, and listens for
// plain Tab. Everything it returns is derived from the server view (roadmap-client.js); the page passes a `host` describing the canvas:
//   hasBlock(id), insertCard(block), persist(), boardRevision(), readOnly(), presenting(), editorOpen(), focusBlock(id),
//   sourceElement(sourceKey) -> the source card's DOM element or null, sourceRev(key), instruction(), depth().
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoadmapController } from './roadmap-controller.js';
import { anchorState, overlayPosition } from './roadmap-placement.js';
import { chatOf, indicatorOf, invitationOf, keyboardOwned, pillOf, tabAccepts, tocOf } from './roadmap-client.js';
import { pageKeyAllowed } from './shortcut-owner.js';
import { opensEditor } from './inline-ai-proposal.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';

const METHODS = ['hasBlock', 'insertCard', 'persist', 'boardRevision', 'readOnly', 'sourceRev', 'instruction', 'depth'];
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

  useEffect(() => { if (!enabled || !boardId) return undefined; controller.start(); const tick = setInterval(() => controller.idleTick(), 1500); return () => { clearInterval(tick); controller.stop(); }; }, [controller, enabled, boardId]);
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

  // Edit plan routes into the ToC conversation: the next message the learner sends there is the plan revision (divert).
  const editing = useRef(false);
  const editPlan = useCallback(() => {
    editing.current = true;
    document.querySelector('[data-toc-start] button')?.click();
    requestAnimationFrame(() => document.querySelector('[data-toc-composer] textarea, [data-toc-composer] input:not([type="file"])')?.focus());
  }, []);
  const divert = useCallback(text => { if (!editing.current || !text?.trim()) return false; editing.current = false; controller.revise({ instruction: text.trim() }); return true; }, [controller]);
  const go = useCallback(nav => { if (nav.kind === 'card') hostRef.current?.focusBlock?.(nav.cardId); else if (nav.kind === 'proposal') hostRef.current?.focusBlock?.(hostRef.current.sourceBlockId?.(live.current.pill?.sourceKey)); }, []);

  return {
    state, controller, pill, active: !!state.view && state.flag !== 'off' && isUnfinishedRoadmap(state.view.roadmap.state), toc: tocOf(state), lines: chatOf(state), invitation: invitationOf(state, { typing, answering }),
    indicator: indicatorOf(state, { offscreen: where.offscreen }), position: overlayPosition(geometry.anchor, surface), surface, showOverlay: !!pill && where.visible,
    editPlan, divert, go, sourceReady: key => controller.sourceReady(key),
  };
}
