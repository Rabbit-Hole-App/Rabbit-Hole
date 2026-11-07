import { useSyncExternalStore } from 'react';
import { Scan } from 'lucide-react';

// Ask about selection (AdaptiveCanvas askArea): while the board is rendered to a picture, the canvas rectangle and the Chat composer both say
// Capturing, in the shimmering in-progress orange (owner 2026-11-07). One shared count, so the canvas needs no plumbing through LearnPage:
// a later crop can start before the earlier one ends, and the pill stays until the last one is done (or failed).
let pending = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listen => listen());
export const beginAreaCapture = () => { pending++; emit(); };
export const endAreaCapture = () => { pending = Math.max(0, pending - 1); emit(); };
export const areaCapturing = () => pending > 0;
export const subscribeAreaCapture = listen => (listeners.add(listen), () => listeners.delete(listen));
export const useAreaCapturing = () => useSyncExternalStore(subscribeAreaCapture, areaCapturing, () => false);

// SMIL ignores the reduced-motion media query, so the sweep is simply not drawn when motion is reduced (the label stays one orange).
const reducedMotion = () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-reduce-motion'));
const BASE = 'color-mix(in srgb, var(--color-claude) 55%, var(--color-white))';

// The canvas rectangle's label. background-clip:text (the .shimmer class) does nothing on SVG text, so the band is a gradient fill whose
// ends slide; objectBoundingBox units follow the text at any zoom.
export function CapturingLabel({ x, y, size }) {
  const still = reducedMotion();
  return (
    <>
      <defs>
        <linearGradient id="area-capturing-sweep" gradientUnits="objectBoundingBox" x1={still ? 0 : 1} x2={still ? 1 : 2} y1="0" y2="0">
          <stop offset="0" style={{ stopColor: BASE }} />
          <stop offset="0.35" style={{ stopColor: BASE }} />
          <stop offset="0.5" style={{ stopColor: 'var(--color-claude-deep)' }} />
          <stop offset="0.65" style={{ stopColor: BASE }} />
          <stop offset="1" style={{ stopColor: BASE }} />
          {!still && <animate attributeName="x1" values="1;-1" dur="1.6s" repeatCount="indefinite" />}
          {!still && <animate attributeName="x2" values="2;0" dur="1.6s" repeatCount="indefinite" />}
        </linearGradient>
      </defs>
      <text data-area-capturing-label x={x} y={y} fontSize={size} fontWeight="600" fill={still ? 'var(--color-claude)' : 'url(#area-capturing-sweep)'}>Capturing</text>
    </>
  );
}

// The Chat composer's pending pill, drawn like the other context chips (ContextChips CHIP) until the real area pill replaces it. It has no
// x: the capture cannot be abandoned (askArea has no cancel), it ends on its own in the picture or in a failure that removes this pill.
export const AreaCapturingPill = () => (useAreaCapturing() ? <CapturingPillView /> : null);
export function CapturingPillView() {
  return (
    <li data-area-capturing role="status" className="inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border border-dashed border-line-strong bg-white px-1.5 text-xs text-ink">
      <Scan size={14} strokeWidth={1.75} aria-hidden className="shrink-0 text-claude" /><span className="shimmer">Capturing</span>
    </li>
  );
}
