import { useLayoutEffect, useRef, useState } from 'react';

// What is left of the Learn panel once it is retracted: a column of ticks down
// the right edge, one per lesson. Hovering them opens the contents list, so the
// course stays navigable without giving the panel its width back.
//
// The way back to the panel is View -> Right panel on the menubar, so the rail
// carries no button of its own - it is the contents, and nothing else.
//
// A learning journey's path rides the same rail (docs/features/adaptive-learning-path-v1-architecture.md §8, R2): its
// entries carry a `status` (and `changed`), the ticks become status glyphs, and a Path button opens the list for the
// keyboard. It is a teaching plan, so an upcoming section opens its purpose and never generates anything. Mounted inside
// the canvas frame (placement 'canvas'), it stays beside the Learn agent chat panel instead of under it (D5). Entries
// without a status are the heading rail, drawn exactly as before.
const PLACEMENT = {
  page: 'absolute top-1/2 right-0 z-30 -translate-y-1/2 pr-2 pl-6 max-lg:hidden',
  // The 52px gutter the canvas keeps clear (edgeInset): a narrow hover margin, so the rail never covers a card.
  canvas: 'absolute top-1/2 right-0 z-30 -translate-y-1/2 pr-2 pl-2 max-lg:hidden',
};
const GLYPHS = { completed: '✓', current: '●', upcoming: '○', skipped: '○', needs_review: '↺' };
const SAY = { completed: 'completed', current: 'current', upcoming: 'upcoming', optional: 'optional', skipped: 'skipped', needs_review: 'needs review' };
const CHANGED = { added: 'new', moved: 'moved', changed: 'changed' };
const tone = status => (status === 'current' ? 'text-accent' : status === 'completed' ? 'text-ink-2' : 'text-ink-3');

// ✓ completed, ● current, ○ upcoming, a dashed ring for optional, a struck-through ring for skipped, ↺ needs review.
const Glyph = ({ status }) => (status === 'optional'
  ? <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-current" />
  : <span className={status === 'skipped' ? 'line-through' : undefined}>{GLYPHS[status] ?? '○'}</span>);

// The list alone: collapsed, a strip of marks; expanded, the titles. The later Path button's drawer or sheet renders the
// same entries. A path entry is { id, n, title, purpose, status, changed, heading_block_id, open } (pathEntries, plus
// `open` for the one whose purpose shows); a heading entry is { n, label, available, active }.
export function PathList({ entries, onOpen, expanded }) {
  if (!entries.some(entry => entry.status)) {
    return expanded ? (
      <ol className="space-y-1">
        {entries.map(entry => (
          <li key={entry.n}>
            <button type="button" disabled={!entry.available} onClick={() => onOpen(entry)}
              aria-current={entry.active ? 'page' : undefined}
              className={`w-full rounded px-1 py-0.5 text-left text-sm hover:text-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3 ${entry.active ? 'font-semibold text-accent' : entry.available ? 'text-ink' : ''}`}>
              {entry.n}. {entry.label}
            </button>
          </li>
        ))}
      </ol>
    ) : (
      // The ticks are decoration for a pointer; the list behind them is the
      // accessible control, so screen readers get the list and not 40 marks.
      // The ticks sit in a pill so the rail reads as a control on any canvas.
      <div aria-hidden="true" className="flex flex-col items-end gap-1.5 rounded-full border border-line bg-white px-2 py-3 shadow-sm">
        {entries.map(entry => (
          <span key={entry.n} className={`h-0.5 rounded-full transition-all duration-150 ${entry.active ? 'w-6 bg-ink' : entry.available ? 'w-4 bg-ink-2' : 'w-4 bg-ink-3/50'}`} />
        ))}
      </div>
    );
  }
  if (!expanded) {
    return (
      <div aria-hidden="true" data-path-strip className="flex flex-col items-center gap-1 text-xs leading-none">
        {entries.map(entry => (
          <span key={entry.id} data-status={entry.status} className={`relative flex h-3.5 w-3.5 items-center justify-center ${tone(entry.status)}`}>
            <Glyph status={entry.status} />
            {entry.changed && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent" />}
          </span>
        ))}
      </div>
    );
  }
  return (
    <ol className="space-y-1">
      {entries.map(entry => (
        <li key={entry.id} data-path-entry={entry.id} data-status={entry.status}>
          <button type="button" onClick={() => onOpen(entry)} aria-current={entry.status === 'current' ? 'step' : undefined}
            aria-expanded={entry.heading_block_id ? undefined : !!entry.open}
            className={`flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-sm hover:text-accent ${entry.status === 'current' ? 'font-semibold text-accent' : entry.status === 'completed' ? 'text-ink' : 'text-ink-2'}`}>
            <span aria-hidden="true" className={`w-3.5 shrink-0 text-center text-xs ${tone(entry.status)}`}><Glyph status={entry.status} /></span>
            <span className={`min-w-0 flex-1 ${entry.status === 'skipped' ? 'line-through' : ''}`}>
              {entry.n}. {entry.title}<span className="sr-only">, {SAY[entry.status] ?? entry.status}{entry.changed ? `, ${CHANGED[entry.changed] ?? entry.changed}` : ''}</span>
            </span>
            {entry.changed && <span data-path-changed={entry.changed} aria-hidden="true" className="h-1.5 w-1.5 shrink-0 self-center rounded-full bg-accent" />}
          </button>
          {entry.open && !entry.heading_block_id && <p data-path-purpose className="mt-0.5 mb-1 pl-6 text-xs text-ink-2">{entry.purpose}</p>}
        </li>
      ))}
    </ol>
  );
}

// Where the open path list may stand (docs/features/learn-canvas-blocks.md, "Canvas utilities never cover authored
// content"), in the canvas frame's coordinates ({ left, top, right, bottom }): left of the right-hand chrome (`gutter`: the
// rail strip, or the tools when they dock right), below the Rabbit Hole navigator (`ceiling`: its bottom edge), above the
// bottom strip (`floor`: its top; the composer, the tray and the minimap live there).
// - Pinned (permanent: a path under review), it stays out of the composer column's horizontal span, so the chat sheet
//   over that column can never be under it either; null when that leaves too little room, and the list is then not pinned.
//   When that side room is narrow (under 220px: 1440 with the right panel open) and the canvas has no cards (`empty`),
//   it takes the free canvas above the sheet, the tray and the composer instead (the column's top is the tray's when it
//   shows): up to 320px wide, right-aligned to the rail, never left of the tools (`toolsRight`), while that is 160px tall.
// - Opened by hover, focus or the toggle (temporary), it may lie over the canvas at full width, but ends above the sheet
//   wherever the two would meet; else the pinned place; else nowhere. Placement, not z-order: the sheet's z-index lives
//   inside the canvas, the rail outside it.
export const FLYOUT = { width: 256, wide: 320, sideRoom: 220, gap: 8, minWidth: 128, minHeight: 160 };
export function flyoutRect({ gutter, column = null, sheet = null, ceiling = 0, floor, toolsRight = 0, empty = false, pinned }) {
  const { width, wide, sideRoom, gap, minWidth, minHeight } = FLYOUT;
  const right = gutter.left - gap, top = ceiling + gap, bottom = floor - gap, left = right - width;
  const fits = r => r.right - r.left >= minWidth && r.bottom - r.top >= minHeight;
  const side = (column?.right ?? -Infinity) + gap;
  const beside = { left: Math.max(left, side), top, right, bottom };
  if (pinned && empty && right - side < sideRoom) {
    const above = { left: Math.max(right - wide, toolsRight + gap), top, right, bottom: Math.min(bottom, (column?.top ?? floor) - gap, sheet ? sheet.top - gap : Infinity) };
    if (fits(above)) return above;
  }
  if (pinned) return fits(beside) ? beside : null;
  const over = { left, top, right, bottom: sheet && left < sheet.right && sheet.left < right ? Math.min(bottom, sheet.top - gap) : bottom };
  return fits(over) ? over : fits(beside) ? beside : null;
}

// The rail's places, measured from the live canvas in its frame and again whenever the frame, the bottom strip (the tray
// comes and goes) or the sheet changes size, the list opens or a card lands: { wrap, pin, open }; undefined until measured
// (a server render).
function useFlyout(wrapRef, pillRef, on, shown, empty) {
  const [place, setPlace] = useState(undefined);
  useLayoutEffect(() => {
    const wrap = wrapRef.current, frame = wrap?.parentElement;
    if (!on || !frame) return undefined;
    const measure = () => {
      const f = frame.getBoundingClientRect();
      const seen = el => {
        const r = el?.getBoundingClientRect();
        return r && r.width && r.height ? { left: r.left - f.left, top: r.top - f.top, right: r.right - f.left, bottom: r.bottom - f.top } : null;
      };
      const pill = seen(pillRef.current), column = seen(frame.querySelector('[data-canvas-composer]')), tools = seen(frame.querySelector('[data-tool-gutter]'));
      if (!pill) { setPlace(null); return; } // below lg the rail is hidden
      const gutter = { left: Math.min(pill.left, tools && column && tools.left > column.right ? tools.left : Infinity) };
      const ceiling = Math.max(0, ...[...frame.querySelectorAll('[data-dive-gutter] > *, [data-gutter-top] > *')].map(seen).filter(Boolean).map(r => r.bottom));
      const floor = seen(frame.querySelector('[data-canvas-bottom]'))?.top ?? f.height;
      const toolsRight = tools && tools.right < f.width / 2 ? tools.right : 0; // the tools docked left
      const near = { gutter, column, sheet: seen(frame.querySelector('[data-chat-sheet]')), ceiling, floor, toolsRight, empty };
      setPlace({ wrap: seen(wrap), pin: flyoutRect({ ...near, pinned: true }), open: flyoutRect({ ...near, pinned: false }) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [frame, frame.querySelector('[data-canvas-bottom]'), frame.querySelector('[data-chat-sheet]')]) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [on, shown, empty, wrapRef, pillRef]);
  return place;
}

// The rail's `empty`: the canvas holds nothing a pinned list could sit over - no card, ink stroke, shape, note, text box or
// divider (`content`, which AdaptiveCanvas publishes through onState: strokes + shapes + items + blocks) and no chat placed
// on it (`exchanges`, not in content). Before the canvas has reported, nothing is assumed empty.
export const canvasEmpty = (state, exchanges = []) => state?.content === 0 && !exchanges.length;

// pinned keeps the list open (a path under review) when there is room for it (flyoutRect). Hover, the Path button (a
// toggle that keeps it open) and focus inside the path rail (§8: hover or focus) each hold it open on their own, so the
// button never hides a list hover opened. Pinned open, the button can change nothing: disabled, and says it is expanded.
// empty: the canvas has no cards, so a pinned list may use the free canvas above the composer (flyoutRect).
export default function ContentsRail({ entries, onOpen, pinned = false, placement = 'page', empty = false }) {
  const [hover, setHover] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [focus, setFocus] = useState(false);
  const wrapRef = useRef(null), pillRef = useRef(null);
  const path = entries.some(entry => entry.status);
  const place = useFlyout(wrapRef, pillRef, path, hover || toggled || focus, empty);
  if (!entries.length) return null;
  // Before it is measured (a server render) a pinned list shows in the default place.
  const pinnedOpen = pinned && place?.pin !== null;
  const shown = pinnedOpen || hover || toggled || focus;
  const rect = place && (pinnedOpen ? place.pin : place.open);
  // The measured place, relative to the rail (the list's containing block): a band the list centres in and scrolls within.
  const band = rect && place.wrap && { left: rect.left - place.wrap.left, top: rect.top - place.wrap.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
  const list = (
    <>
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-ink-2 uppercase">{path ? 'Path' : 'Contents'}</h2>
      <PathList entries={entries} onOpen={onOpen} expanded />
    </>
  );
  return (
    <div ref={wrapRef} data-contents-rail data-placement={placement === 'page' ? undefined : placement} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      onFocus={path ? () => setFocus(true) : undefined} onBlur={path ? event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false); } : undefined}
      className={PLACEMENT[placement] ?? PLACEMENT.page}>
      {path ? (
        <div ref={pillRef} className="flex flex-col items-center gap-2 rounded-full border border-line bg-white px-1 py-2 shadow-sm">
          <button type="button" data-path-toggle aria-expanded={shown} disabled={pinnedOpen} onClick={() => setToggled(value => !value)}
            className="rounded-full px-1 py-0.5 text-[10px] font-semibold tracking-wider text-ink-2 uppercase hover:bg-hover hover:text-ink disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-ink-2">Path</button>
          <PathList entries={entries} onOpen={onOpen} expanded={false} />
        </div>
      ) : <PathList entries={entries} onOpen={onOpen} expanded={false} />}
      {path && place ? (
        // No place (flyoutRect null): the list stays closed rather than covering the composer, tray or sheet.
        <div data-path-flyout style={band || undefined} hidden={!band} className="pointer-events-none absolute flex flex-col justify-center">
          <nav aria-label="Learning path" hidden={!shown} className="pointer-events-auto max-h-full overflow-y-auto rounded-xl border border-line bg-white p-3 shadow-md">{list}</nav>
        </div>
      ) : (
        <nav aria-label={path ? 'Learning path' : 'Table of contents'} hidden={!shown}
          className="absolute top-1/2 right-full max-h-[80vh] w-64 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-md">
          {list}
        </nav>
      )}
    </div>
  );
}
