// Learn mode's layout (learn-mode-spec.md, owner 2026-11-18): the top row (the walk pill centred, the Learn | Canvas pill at the right), the guide on the
// left (the section's heading, the stop's lead, a rule, its follow) and the right split's tabs (Cards | Canvas | TOC | Chat). Built like StudyPane: the
// canvas frame only gets margins (never another parent, so a notebook's iframe never reloads) and the split is Study's (study-state.js studyLayout).
// The rows are fixed to the canvas column as it is with the right panel closed, so TOC and Chat (the right panel, widened to the split) open under them.
import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft as Back, ChevronRight as Forward } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from './ui.jsx';
import { SWITCH_ROW } from './study-ref.js';
import { studyLayout } from './study-state.js';
import { GUIDE_MAX, LEARN_TABS, LEARN_TOP } from './learn-mode.js';
import { walkProgress } from './learn-walk.js';

// walk: AdaptiveCanvas onState walk ({ at, total, heading, lead, follow }). onGeometry({ width, guide }): the column's width and the guide's (LearnPage
// widens the right panel to the rest). toggle: the Learn | Canvas pill (LearnPage's, the one the header shows outside Learn mode).
export default function LearnPane({ walk, tab, onTab, canvasApi, canvasFrame, split, panelOpen, toggle, onGeometry }) {
  const [box, setBox] = useState(null);
  // The canvas column's place on screen, read while the right panel is closed (open, the column is only the guide's width).
  useEffect(() => {
    const host = canvasFrame.current?.parentElement;
    if (!host || panelOpen) return undefined;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      setBox(previous => (previous && ['left', 'top', 'width', 'height'].every(key => Math.abs(previous[key] - rect[key]) < 1) ? previous : { left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [canvasFrame, panelOpen]);
  const layout = box && studyLayout({ width: box.width, height: box.height, split });
  const guide = layout ? (layout.stacked ? Math.round(box.width * 0.4) : layout.size) : 0;
  useEffect(() => { if (box) onGeometry?.({ width: Math.round(box.width), guide }); }, [box?.width, guide]); // eslint-disable-line react-hooks/exhaustive-deps
  // The frame's margins (StudyPane's way): beside the guide, under the two rows; the composer strip centred on the whole column (--study-shift).
  useLayoutEffect(() => {
    const frame = canvasFrame.current;
    if (!frame || !guide) return;
    frame.style.marginLeft = `${guide}px`;
    frame.style.marginTop = `${LEARN_TOP + SWITCH_ROW}px`;
    frame.style.setProperty('--study-shift', `${-Math.round(guide / 2)}px`);
    frame.style.zIndex = '30';
    if (getComputedStyle(frame).position === 'static') { frame.style.position = 'relative'; frame.dataset.learnPosition = ''; }
  }, [guide]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => {
    const frame = canvasFrame.current;
    if (!frame) return;
    frame.style.marginLeft = ''; frame.style.marginTop = ''; frame.style.removeProperty('--study-shift'); frame.style.zIndex = '';
    if (frame.dataset.learnPosition != null) { frame.style.position = ''; delete frame.dataset.learnPosition; }
  }, [canvasFrame]);
  if (!box || !walk) return null;
  const bottom = Math.max(0, window.innerHeight - (box.top + box.height));
  const title = walk.heading.replace(/^\d+(\.\d+)*\s+/, '');
  const walkApi = () => canvasApi.current?.walk;
  return <>
    <div data-learn-top className="fixed z-50 flex items-center justify-center border-b border-line bg-white" style={{ left: box.left, top: box.top, width: box.width, height: LEARN_TOP }}>
      {/* The walk pill (owner 2026-11-18 13:33, 14:15): Prev, n / N and the section, Next, a green bar card by card. Canvas on the right pill leaves. */}
      <div data-learn-walk role="toolbar" aria-label="Walk" className="flex w-[min(60%,560px)] flex-col overflow-hidden rounded-lg border border-line bg-white text-sm text-ink shadow-sm">
        <div className="flex h-10 items-center gap-2 px-1.5">
          <button type="button" onClick={() => walkApi()?.prev()} disabled={walk.at === 0} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1 font-medium hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent"><Back size={15} aria-hidden />Prev</button>
          <span data-learn-walk-count className="min-w-0 flex-1 truncate px-1 text-center text-ink-2 tabular-nums">{walk.at + 1} / {walk.total} · {title}</span>
          <button type="button" onClick={() => walkApi()?.next()} className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 font-medium text-white hover:opacity-90">Next<Forward size={15} aria-hidden /></button>
        </div>
        <div aria-hidden className="h-1 w-full shrink-0 bg-hover"><div data-learn-walk-progress className="h-full transition-[width] duration-300" style={{ width: `${Math.round(walkProgress(walk) * 100)}%`, background: 'var(--color-success)' }} /></div>
      </div>
      {toggle}
    </div>
    <aside aria-label="Guide" data-learn-guide className="fixed z-20 overflow-y-auto border-r border-line bg-white" style={{ left: box.left, top: box.top + LEARN_TOP, width: guide, bottom }}>
      <div className="px-8 pt-6 pb-40" style={{ maxWidth: GUIDE_MAX }}>
        <h2 data-learn-guide-heading className="text-lg font-semibold text-ink">{walk.heading}</h2>
        {walk.lead && <p data-learn-guide-lead className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">{walk.lead}</p>}
        {walk.lead && walk.follow && <hr className="my-5 border-line" />}
        {walk.follow && <p data-learn-guide-follow className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{walk.follow}</p>}
      </div>
    </aside>
    <div data-learn-tabs={tab} className="fixed z-50 flex items-center border-b border-line bg-white" style={{ left: box.left + guide, top: box.top + LEARN_TOP, width: box.width - guide, height: SWITCH_ROW }}>
      <Tabs value={tab} onValueChange={onTab} className="w-full">
        <TabsList aria-label="Learn views" className="h-[42px] shrink-0 gap-4 px-3">
          {LEARN_TABS.map(({ id, label }) => <TabsTrigger key={id} value={id} data-learn-tab={id}>{label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
    </div>
  </>;
}
