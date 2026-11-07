import { useEffect, useState } from 'react';
import { loadAsset } from './learn-board-assets.js';

// A reusable figure: an illustration in its own container with its caption below (the written Explanation puts one after its opening paragraph).
// The source is the image block's own asset path: a `src` (URL or data URL) or a `cacheKey` that learn-board-assets loadAsset answers from this
// browser's cache and then the board's server copy, so the picture is saved and reloaded with the board (assetKeysOf lists the key).
// The container reserves its square before the image arrives (nothing jumps), the image never leaves it, and the callouts are optional:
// they are drawn only when the caller passes placements it trusts, as percentages of the image. The figure works on its own without them.
export const validCallouts = list => (Array.isArray(list) ? list : []).filter(c => c && typeof c.text === 'string' && c.text && ['px', 'py', 'lx', 'ly'].every(k => Number.isFinite(c[k]) && c[k] >= 0 && c[k] <= 100)).slice(0, 6);

function useIllustrationUrl({ src, cacheKey }) {
  const [url, setUrl] = useState(src || '');
  useEffect(() => {
    let live = true, made = '';
    if (src) { setUrl(src); return undefined; }
    setUrl('');
    if (!cacheKey) return undefined;
    loadAsset(cacheKey).then(value => {
      if (!live || value == null) return;
      if (typeof value === 'string') setUrl(value);
      else { made = URL.createObjectURL(value); setUrl(made); }
    });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [src, cacheKey]);
  return url;
}

export default function IllustrationFigure({ illustration, className = '' }) {
  const url = useIllustrationUrl(illustration || {});
  // What happened to THIS url (a different url is loading again). Derived, not reset in an effect: a picture that is already decoded can fire its load before an effect would run.
  const [done, setDone] = useState({ url: '', ok: null });
  const state = url && done.url === url ? (done.ok ? 'ready' : 'failed') : 'loading'; // loading | ready | failed
  const callouts = state === 'ready' ? validCallouts(illustration?.callouts) : [];
  const ratio = Number.isFinite(illustration?.aspect) && illustration.aspect > 0.3 && illustration.aspect < 3 ? illustration.aspect : 1;
  return (
    <figure data-illustration data-illustration-state={state} className={`m-0 my-2 ${className}`}>
      <div data-illustration-frame style={{ aspectRatio: String(ratio) }} className="relative w-full overflow-hidden rounded-xl border border-line bg-[var(--viz-surface,#fbfbfa)]">
        {state !== 'ready' && <div aria-hidden="true" className={`absolute inset-0 ${state === 'loading' ? 'animate-pulse bg-hover' : ''}`} />}
        {state === 'failed' && <div role="status" className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-ink-2">The illustration is unavailable.</div>}
        {url && <img src={url} alt={illustration?.alt || ''} draggable={false} ref={el => { if (el && el.complete && el.naturalWidth > 0 && !(done.url === url && done.ok)) setDone({ url, ok: true }); }} onLoad={() => setDone({ url, ok: true })} onError={() => setDone({ url, ok: false })} className={`absolute inset-0 block h-full w-full object-contain transition-opacity ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`} />}
        {callouts.length > 0 && (
          <div data-illustration-callouts className="pointer-events-none absolute inset-0">
            <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {callouts.map((c, i) => <line key={i} x1={c.lx} y1={c.ly} x2={c.px} y2={c.py} stroke="#1f2937" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {callouts.map((c, i) => (
              <span key={i} data-callout-dot style={{ left: `${c.px}%`, top: `${c.py}%` }} className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-accent" />
            ))}
            {callouts.map((c, i) => (
              <span key={i} data-callout-label style={{ left: `${c.lx}%`, top: `${c.ly}%` }} className="absolute max-w-[45%] -translate-x-1/2 -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-center text-[11px] leading-tight text-ink">{c.text}</span>
            ))}
          </div>
        )}
      </div>
      {illustration?.caption && <figcaption data-illustration-caption className="mt-1.5 text-xs text-ink-2">{illustration.caption}</figcaption>}
    </figure>
  );
}
