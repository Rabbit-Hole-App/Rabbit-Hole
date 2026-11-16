import { useEffect, useRef } from 'react';
import { placeTip, TIP_BOX } from './ui.jsx';

// ONE tooltip for every `title` in the app (owner 2026-11-15: tooltips consistent, above everything else). The browser's own title bubble is not drawn:
// while the pointer rests on an element that has a title, the title moves out of the way (and back when the pointer leaves) and this layer draws the same
// dark bubble as <Tip>, in the top layer, so no panel, card or dialog can cover it. Elements that name themselves for assistive tech (iframes) keep their title.
const SKIP = new Set(['IFRAME', 'EMBED', 'OBJECT']);
const DELAY_MS = 350;

export default function TooltipLayer() {
  const box = useRef(null);
  useEffect(() => {
    const pop = box.current;
    if (!pop || typeof pop.showPopover !== 'function') return undefined;
    let target = null, timer = 0;
    const give = () => {
      if (target?.dataset?.tipTitle == null) return;
      if (!target.hasAttribute('title')) target.setAttribute('title', target.dataset.tipTitle); // a title React set meanwhile wins over the one saved
      delete target.dataset.tipTitle;
      if (target.dataset.tipAria != null) { target.removeAttribute('aria-label'); delete target.dataset.tipAria; }
    };
    const hide = () => { clearTimeout(timer); give(); target = null; try { pop.hidePopover(); } catch { /* not shown */ } };
    const open = el => {
      pop.textContent = el.dataset.tipTitle;
      try { pop.showPopover(); } catch { return; }
      placeTip(pop, el);
    };
    const over = event => {
      const el = event.target instanceof Element ? event.target.closest('[title]:not(iframe):not(embed):not(object), [data-tip-title]') : null;
      if (el === target) return;
      hide();
      if (!el || SKIP.has(el.tagName)) return;
      const title = el.getAttribute('title');
      if (!title) return;
      el.dataset.tipTitle = title; el.removeAttribute('title'); target = el;
      if (!el.hasAttribute('aria-label') && !el.textContent.trim()) { el.setAttribute('aria-label', title); el.dataset.tipAria = ''; } // an icon with only a title keeps its name while the title is away
      timer = setTimeout(() => open(el), DELAY_MS);
    };
    const events = [['pointerover', over], ['pointerdown', hide], ['keydown', hide], ['scroll', hide], ['blur', hide]];
    for (const [name, handler] of events) window.addEventListener(name, handler, true);
    document.documentElement.addEventListener('pointerleave', hide);
    return () => { hide(); for (const [name, handler] of events) window.removeEventListener(name, handler, true); document.documentElement.removeEventListener('pointerleave', hide); };
  }, []);
  return <span ref={box} popover="manual" role="tooltip" data-tooltip-layer className={`${TIP_BOX} text-xs font-semibold text-white`} />;
}
