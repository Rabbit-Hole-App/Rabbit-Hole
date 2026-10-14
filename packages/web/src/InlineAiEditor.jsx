import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleHelp, CornerDownLeft, Loader2, RotateCcw, Square, X } from 'lucide-react';
import { composerKey } from './composer-keys.js';
import { buildContext, clippedOf, contextShape, staleness, unionBox } from './inline-ai-context.js';
import { cardId, cardTx, describeChange, editTx, explainConnects, explainTx, FACING, freeSpot, noteSize, placeNote, validateEdit, wordDiff } from './inline-ai-apply.js';
import { createInlineSession, routeColumn, stageTimings } from './inline-ai-session.js';
import { PROMPT_MAX, ROUTES, selectionSummary } from './inline-ai-route.js';

// The inline AI editor (docs/features/inline-ai-editor.md): a compact popover by the frozen selection, with Edit and
// Explain pills, the prompt, a context indicator, the streamed preview and Accept / Reject. Everything it shows before
// Accept lives here and in its overlay - never in the board, its autosave or its undo history. The canvas hands it a
// small adapter (board(), apply(tx), boxes, view) and owns nothing of a request.

const W = 360, GAP = 12, EDGE = 8;
const LABEL = { shape: 'Shape', line: 'Line', text: 'Text', sticky: 'Note', equation: 'Equation', section: 'Divider', card: 'Card', chat: 'Chat', connection: 'Connector' };
const RELATION = { connected: 'connected', sibling: 'sibling', inferred: 'drawn arrow (inferred)', group: 'same group', annotation: 'earlier note', nearby: 'nearby' };
const short = (text, n = 48) => { const one = String(text || '').replace(/\s+/g, ' ').trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };
const busy = status => status === 'routing' || status === 'generating' || status === 'streaming';

// What the target indicator says: the selected words, one object by its words, or how many.
export function targetLabel(target, board) {
  if (target.range) return `“${short(target.range.text, 40)}”`;
  if (target.ids.length > 1) return target.wholeGroup ? `Group · ${target.ids.length} objects` : `${target.ids.length} objects`;
  const id = target.ids[0];
  const entity = [...(board.shapes || []), ...(board.items || []), ...(board.blocks || []), ...(board.links || [])].find(entry => entry.id === id);
  const words = entity && short(entity.text ?? entity.label ?? entity.title ?? '', 32);
  return words ? `“${words}”` : 'Selection';
}
// The A3 split labels: what kind of selection, board and output a request was.
const selectionKind = (target, board) => {
  if (target.range) return 'range';
  if (target.ids.length > 1) return target.groupId ? 'group' : 'mixed';
  const id = target.ids[0];
  const item = (board.items || []).find(entry => entry.id === id);
  if (item) return item.mode === 'code' ? 'code' : 'text';
  const block = (board.blocks || []).find(entry => entry.id === id);
  if (block) return block.type === 'file' && block.kind === 'image' ? 'image' : block.type === 'snippet' ? 'code' : 'card';
  return (board.links || []).some(entry => entry.id === id) ? 'connection' : 'shape';
};

export default function InlineAiEditor({ target, canvas, config, view, readOnly = false, opened = null, cold = false, onClose }) {
  const [mode, setMode] = useState(target.range ? 'edit' : 'explain');
  const [prompt, setPrompt] = useState('');
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [state, setState] = useState({ status: 'idle' });
  // A7: each candidate's placement, by request id - computed once, before its ghost shows, and the one Accept applies.
  const [placements, setPlacements] = useState({});
  const [moved, setMoved] = useState(null); // the request whose spot was taken: its new place is shown, Accept again
  const box = useRef(null), field = useRef(null);
  const openMs = useRef(null);
  const rows = useRef([]);
  const board = canvas.board;
  // One session per opened editor: its requests, their late results and their metrics end with it.
  const session = useMemo(() => createInlineSession({
    transport: config.transport, boardKey: canvas.boardKey, enabled: config.enabled, motion: config.motion,
    flushMs: config.flushMs ?? 50,
    validate: (result, plan, request) => validateResult(result, request.frozen),
    onChange: setState,
    onMetrics: entry => {
      const split = { selection: selectionKind(target, board()), board: canvas.objectCount() > 200 ? 'large' : 'small', output: entry.capability === 'edit' ? 'edit' : entry.capability === 'note' ? 'text' : ['motion', 'animate', 'video', '3d'].includes(entry.capability) ? 'media' : 'card' };
      const first = !rows.current.length || rows.current[0].request_id === entry.requestId;
      rows.current = rows.current.filter(row => row.request_id !== entry.requestId);
      rows.current.push({
        request_id: entry.requestId, route: routeColumn(entry),
        capability: entry.capability || null, outcome: entry.outcome || 'closed', streaming: !!entry.streaming, mocked: !!config.mocked,
        metrics: { stages: { ...(first && openMs.current != null ? { open: openMs.current } : {}), ...(entry.prep ? { prep: entry.prep.ms } : {}), ...Object.fromEntries(Object.entries(stageTimings(entry)).filter(([, value]) => value != null)) },
          counts: { ...entry.counts, ...(entry.context ? { objects: entry.context.objects, chars: entry.context.chars, omitted: entry.context.omitted } : {}), ...(entry.tokens ? { inputTokens: entry.tokens.input, outputTokens: entry.tokens.output } : {}) },
          prepCache: entry.prep?.cacheHit ? 'hit' : 'miss', open: cold ? 'cold' : 'repeat', ...split },
      });
      canvas.telemetry?.(rows.current);
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A result checked against the board as it is now (inline-ai-apply.js): the preview it becomes, or why not.
  function validateResult(result, frozen) {
    if (result.kind === 'note') return { ok: true, preview: { text: result.text } };
    if (result.kind === 'edit') {
      const checked = validateEdit(result, frozen, board());
      return checked.ok ? { ok: true, preview: { summary: result.summary, changes: checked.changes.map(describeChange), raw: result } } : checked;
    }
    if (result.kind === 'card' || result.kind === 'proposal') return { ok: true, preview: { block: result.block, primitive: result.primitive, message: result.message, describe: canvas.describe(result.block) } };
    return { ok: false, errors: ['That result is not something the canvas can show.'] };
  }

  // A1: context prepared while the learner writes - local work only, scheduled off the input path; refreshed at submit.
  const prepare = (only = selectionOnly) => {
    const started = performance.now(), misses = canvas.cache.stats.misses;
    const context = buildContext({ ...board(), boxes: canvas.layout() }, target, { cache: canvas.cache, boardKey: canvas.boardKey, describeCard: canvas.describe, selectionOnly: only, extras: config.extras?.() || {} });
    return { context, ms: Math.round((performance.now() - started) * 10) / 10, cacheHit: canvas.cache.stats.misses === misses };
  };
  // config.prepareOnOpen false is the A3 baseline (context built only at Send), for the benchmark's comparison.
  useEffect(() => {
    if (config.prepareOnOpen === false) { canvas.cache.reset(); return undefined; }
    const timer = setTimeout(() => { const made = prepare(); setPrepared(made); }, 0);
    return () => clearTimeout(timer);
  }, [selectionOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    field.current?.focus({ preventScroll: true });
    if (opened != null) openMs.current = Math.round((performance.now() - opened) * 10) / 10;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => session.dispose('closed'), [session]);
  // A window or visual-viewport resize (a phone's keyboard opening) re-places the popover inside what is left.
  const [, setViewport] = useState(0);
  useEffect(() => {
    const moved = () => setViewport(n => n + 1);
    window.addEventListener('resize', moved);
    window.visualViewport?.addEventListener('resize', moved);
    return () => { window.removeEventListener('resize', moved); window.visualViewport?.removeEventListener('resize', moved); };
  }, []);
  // The popover's wheel and pointer stay its own: the canvas below never pans, zooms or selects through it.
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const stop = event => event.stopPropagation();
    node.addEventListener('wheel', stop);
    return () => node.removeEventListener('wheel', stop);
  }, []);

  const submit = text => {
    if (readOnly || busy(state.status)) return;
    session.submit({
      mode, prompt: text,
      prepare: () => {
        // An open text editor's words are saved first, so what the model reads and the fingerprint Accept checks come
        // from the same saved text - never from words captured when the editor opened.
        canvas.flushEdits?.();
        const made = prepare();
        setPrepared(made);
        return { context: made.context, frozen: { ...target, prints: made.context.prints, clipped: clippedOf(made.context) }, summary: selectionSummary(made.context), prints: made.context.prints, selectionOnly, shape: contextShape(made.context), prepMs: prepared?.ms ?? made.ms, cacheHit: made.cacheHit };
      },
    });
  };
  // A connector has no box of its own: it stands at the midpoint between the two objects it joins.
  const boxOfTarget = id => {
    const own = canvas.boxOf(id);
    if (own) return own;
    const link = (board().links || []).find(entry => entry.id === id);
    const a = link && canvas.boxOf(link.from), b = link && canvas.boxOf(link.to);
    return a && b ? { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2 - 1, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 1, w: 2, h: 2 } : null;
  };
  // A note's room while it streams: the prompt's longest note (400 characters), so streamed words never move it (A7).
  const reserved = () => noteSize('word '.repeat(80), canvas.measureNote);
  // One placement: the one placer (placeNote) over every kind of object on the board, beside the target; the camera
  // pans to it when the only free spot is off-screen.
  const placeFor = size => {
    const targetBox = unionBox(target.ids.map(boxOfTarget));
    if (!targetBox) return null;
    const spot = placeNote(targetBox, size, canvas.obstacles(target.ids), canvas.visibleWorld());
    if (spot.offscreen) canvas.reveal?.({ x: spot.x, y: spot.y, ...size });
    return { ...spot, size, target: targetBox };
  };
  const keep = (id, placement) => setPlacements(previous => ({ ...previous, [id]: placement }));
  useEffect(() => {
    // Streaming: the room is reserved once, before the first words show.
    if (state.status === 'streaming' && state.stream?.text && state.requestId && !placements[state.requestId]) { const room = placeFor(reserved()); if (room) keep(state.requestId, room); }
    // The finished note: it keeps its streamed place when it fits the room; a note placed for the first time (no stream)
    // or one longer than the room is placed once, now, before Accept is offered.
    const preview = state.preview;
    if (preview?.kind === 'note' && !placements[preview.requestId]?.final) {
      const final = noteSize(preview.text, canvas.measureNote), had = placements[preview.requestId];
      const fresh = had && final.h <= had.size.h && final.w <= had.size.w ? { ...had, size: final } : placeFor(final);
      // No target box (the selection is gone): no ghost; Accept then refuses it as stale.
      keep(preview.requestId, fresh ? { ...fresh, final: true } : { final: true });
    }
  }, [state.status, state.preview, state.requestId, !!state.stream?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  // A7 card ghost: drawn once invisibly at the end of the column to learn its real size (waiting until its size holds
  // for two frames, up to a second), then placed once beside the selection and shown pale there.
  const isCard = preview => preview && (preview.kind === 'card' || preview.kind === 'proposal');
  const ghostBlock = preview => ({ ...preview.block, id: cardId(preview.requestId) });
  useEffect(() => {
    const preview = state.preview;
    if (!isCard(preview) || !['preview', 'proposal'].includes(state.status) || !canvas.cardGhost) { canvas.cardGhost?.clear(); return undefined; }
    const known = placements[preview.requestId];
    if (known?.size) { canvas.cardGhost.show(ghostBlock(preview), { dx: known.dx, dy: known.dy }); return undefined; }
    let alive = true, last = null, frames = 0;
    canvas.cardGhost.show(ghostBlock(preview), { hidden: true });
    const settle = () => {
      if (!alive) return;
      const box = canvas.cardGhost.measure();
      frames += 1;
      const steady = box && last && Math.abs(box.w - last.w) < 0.5 && Math.abs(box.h - last.h) < 0.5;
      if (!steady && frames < 60) { last = box; requestAnimationFrame(settle); return; }
      if (!box) { canvas.cardGhost.clear(); return; }
      const size = { w: box.w, h: box.h }, spot = placeFor(size);
      if (!spot) { canvas.cardGhost.clear(); return; }
      const placed = { ...spot, final: true, dx: spot.x - box.x, dy: spot.y - box.y };
      keep(preview.requestId, placed);
      canvas.cardGhost.show(ghostBlock(preview), { dx: placed.dx, dy: placed.dy });
    };
    requestAnimationFrame(settle);
    return () => { alive = false; };
  }, [state.status, state.preview]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => canvas.cardGhost?.clear(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = () => {
    // A7: the spot the ghost shows must still be free. If something now takes it, the note is placed again and its new
    // ghost shown; Accept is pressed again. It never lands somewhere the learner did not see.
    const shown = (state.preview?.kind === 'note' || isCard(state.preview)) && placements[state.preview.requestId];
    if (shown?.size && !freeSpot({ x: shown.x, y: shown.y, ...shown.size }, canvas.obstacles(target.ids), unionBox(target.ids.map(boxOfTarget)))) {
      const again = placeFor(shown.size);
      if (again) {
        // A card's offset is from its slot at the end of the column: the slot is where its ghost is drawn less its offset.
        const drawn = isCard(state.preview) && canvas.cardGhost.measure();
        const slot = drawn ? { x: drawn.x - shown.dx, y: drawn.y - shown.dy } : null;
        keep(state.preview.requestId, { ...again, final: true, ...(slot ? { dx: again.x - slot.x, dy: again.y - slot.y } : {}) });
        setMoved(state.preview.requestId);
        return;
      }
    }
    setMoved(null);
    const out = session.accept(preview => {
      canvas.flushEdits?.();
      const now = board();
      const frozen = preview.frozen;
      const check = staleness(frozen, now, canvas.cache, canvas.boardKey, canvas.describe);
      if (check.gone.length) return { stale: { gone: check.gone, text: 'The selection was deleted while this was being made.' } };
      if (check.content) return { stale: { content: true, text: 'The selection changed while this was being made.' } };
      if (check.relations && preview.kind !== 'edit') return { stale: { relations: true, text: 'Its connections changed since this was written.' } };
      let tx;
      if (preview.kind === 'note') {
        const spot = placements[preview.requestId];
        if (!spot?.size) return { error: 'There is no place on the canvas beside the selection for this note.' };
        tx = explainTx({ requestId: preview.requestId, text: preview.text, frozen, board: now, boxes: { target: spot.target }, size: spot.size, place: spot, route: preview.route });
      } else if (preview.kind === 'edit') {
        const again = validateEdit(preview.raw, frozen, now);
        if (!again.ok) return { stale: { content: true, text: again.errors[0] || 'The edit no longer fits the selection.' } };
        tx = editTx({ requestId: preview.requestId, changes: again.changes });
      } else {
        const block = preview.kind === 'proposal' ? { ...preview.block, confirmedStart: true } : preview.block;
        // The ghost's spot, from the slot the card will take at the end of the column (where its ghost is drawn now).
        const spot = placements[preview.requestId], drawn = spot?.size && canvas.cardGhost?.measure();
        const place = drawn ? { side: spot.side, dx: spot.x - (drawn.x - spot.dx), dy: spot.y - (drawn.y - spot.dy) } : null;
        tx = cardTx({ requestId: preview.requestId, block, frozen, board: now, route: preview.route, place });
      }
      return canvas.apply(tx, preview.requestId, id => session.persisted(id)) ? { ok: true } : { stale: { gone: true, text: 'This canvas closed.' } };
    });
    if (out?.ok) onClose(true);
  };
  const reject = () => { session.reject(); onClose(true); };
  const close = () => { session.dispose('closed'); onClose(true); };

  const keyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (contextOpen) { setContextOpen(false); return; }
      close();
      return;
    }
    // Ctrl/Cmd+Enter accepts a preview; a paid proposal starts only from its own Generate button.
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && state.status === 'preview' && state.preview?.kind !== 'proposal') { event.preventDefault(); accept(); }
  };
  const fieldKey = event => {
    const what = composerKey(event.nativeEvent);
    if (what !== 'send' || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (state.status === 'proposal' || (state.preview && !prompt.trim())) return;
    submit(prompt);
  };

  // Where the popover goes: beside the target, never over it, inside the canvas surface (§10).
  const surface = canvas.surfaceSize();
  const targetScreen = (() => {
    const world = unionBox(target.ids.map(boxOfTarget));
    if (!world) return null;
    return { x: world.x * view.z + view.x, y: world.y * view.z + view.y, w: world.w * view.z, h: world.h * view.z };
  })();
  const [height, setHeight] = useState(180);
  useLayoutEffect(() => { if (box.current && Math.abs(box.current.offsetHeight - height) > 2) setHeight(box.current.offsetHeight); });
  // Clamped to the surface, never over the target, the style panel or the bottom strip (minimap, zoom, composer, hooks):
  // the first spot clear of all of them, else the one that covers least (a phone-sized canvas).
  const place = (() => {
    const width = Math.min(W, surface.w - EDGE * 2);
    const clamp = (left, top) => ({ left: Math.max(EDGE, Math.min(left, surface.w - width - EDGE)), top: Math.max(EDGE, Math.min(top, surface.h - height - EDGE)) });
    if (!targetScreen) return { ...clamp(EDGE, EDGE), width };
    const t = targetScreen, chrome = canvas.chromeRects();
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const tries = [[t.x, t.y + t.h + GAP], [t.x, t.y - GAP - height], [t.x + t.w + GAP, t.y], [t.x - GAP - width, t.y], [t.x + t.w - width, t.y + t.h + GAP], [t.x + t.w - width, t.y - GAP - height], [t.x + t.w + GAP, t.y + t.h - height], [t.x - GAP - width, t.y + t.h - height]].map(([left, top]) => clamp(left, top));
    const cost = spot => { const box = { x: spot.left, y: spot.top, w: width, h: height }; return overlap(box, t) * 4 + chrome.reduce((sum, rect) => sum + overlap(box, rect), 0); };
    return { ...tries.reduce((best, spot) => (cost(spot) < cost(best) ? spot : best)), width };
  })();

  const preview = state.preview;
  const status = state.status;
  const streamText = state.stream?.text;
  const counts = prepared?.context.counts;
  const omittedTotal = prepared ? Object.values(prepared.context.omitted).reduce((sum, n) => sum + n, 0) : 0;
  const contextLine = !prepared ? 'Preparing context…' : selectionOnly ? 'Selection only' : [
    `${counts.target} selected`, counts.connected && `${counts.connected} connected`, counts.sibling && `${counts.sibling} sibling${counts.sibling > 1 ? 's' : ''}`,
    counts.group && `${counts.group} in group`, counts.inferred && `${counts.inferred} drawn arrow${counts.inferred > 1 ? 's' : ''}`, counts.annotation && `${counts.annotation} earlier note${counts.annotation > 1 ? 's' : ''}`, counts.nearby && `${counts.nearby} nearby`,
  ].filter(Boolean).join(' · ');
  const writing = status === 'streaming' || (busy(status) && !preview);
  const acceptable = (status === 'preview' || status === 'proposal') && preview && !state.accepted;
  const z = view.z;
  return (
    <>
      {/* The overlay: the frozen target's outline and the ghost of what Accept adds (A7). Never in the board, the undo
          history, the thumbnail (data-thumbnail-hide) or an export; only the ghost itself takes the pointer, so nothing
          under it is clicked by mistake. */}
      <div data-inline-ai-overlay data-thumbnail-hide aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {/* The target is purple while the editor is open (owner 2026-10-13): its own canvas selection marks take --color-ai;
            every other selection stays blue. */}
        <style data-inline-target-color>{`${[...target.ids.flatMap(id => ['shape-id', 'item-id', 'block-id', 'link-for'].map(key => `[data-${key}="${CSS.escape(id)}"]`)),
          ...(target.groupId && target.wholeGroup ? [`[data-group-box="${CSS.escape(target.groupId)}"]`] : [])].join(',')}{--color-select:var(--color-ai)}`}</style>
        {target.ids.map(id => canvas.boxOf(id)).filter(Boolean).map((world, index) => (
          <div key={index} data-inline-target className="absolute rounded-md outline-2 outline-offset-4 outline-dashed outline-ai"
            style={{ left: world.x * z + view.x, top: world.y * z + view.y, width: world.w * z, height: world.h * z }} />
        ))}
        {(() => {
          // A7: the note Accept would add, pale, at exactly its placement and size, above everything; its connector along
          // the path Accept will draw. While it streams, the words fill the room reserved for them.
          const id = status === 'streaming' ? state.requestId : preview?.kind === 'note' ? preview.requestId : null;
          const g = id && placements[id];
          const text = status === 'streaming' ? streamText : preview?.kind === 'note' ? preview.text : null;
          if (!g?.size || !text) return null;
          const left = g.x * z + view.x, top = g.y * z + view.y, w = g.size.w * z, h = g.size.h * z;
          const port = (box, side) => ({ x: side === 'left' ? box.x : side === 'right' ? box.x + box.w : box.x + box.w / 2, y: side === 'top' ? box.y : side === 'bottom' ? box.y + box.h : box.y + box.h / 2 });
          const [fromSide, toSide] = FACING[g.side];
          const from = port({ x: left, y: top, w, h }, fromSide);
          const t = g.target, to = port({ x: t.x * z + view.x, y: t.y * z + view.y, w: t.w * z, h: t.h * z }, toSide);
          return (
            <>
              {explainConnects(target.ids, board()) && <svg data-inline-ghost-link className="absolute inset-0 h-full w-full overflow-visible opacity-50"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6b7280" strokeWidth={2 * z} strokeDasharray="6 5" /></svg>}
              <div data-inline-ghost data-ghost-kind="note" onPointerDown={event => event.stopPropagation()}
                className="pointer-events-auto absolute overflow-hidden rounded-[14px] border-2 border-dashed border-[#6b7280] bg-white/90 px-2 py-1.5 text-ink opacity-50 dark:bg-[#202020]/90"
                style={{ left, top, width: w, height: h, fontSize: 14 * z, lineHeight: 1.25 }}>
                {text}{status === 'streaming' && <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-ink-3 align-middle" />}
              </div>
            </>
          );
        })()}
        {(() => {
          // A7: the card ghost (drawn by the canvas at the end of its column, offset here) is framed and covered at its spot,
          // which is free, so the pointer there reaches only the ghost; its connector along the path Accept will draw.
          const g = isCard(preview) && placements[preview.requestId];
          if (!g?.size || !['preview', 'proposal'].includes(status)) return null;
          const left = g.x * z + view.x, top = g.y * z + view.y, w = g.size.w * z, h = g.size.h * z;
          const port = (box, side) => ({ x: side === 'left' ? box.x : side === 'right' ? box.x + box.w : box.x + box.w / 2, y: side === 'top' ? box.y : side === 'bottom' ? box.y + box.h : box.y + box.h / 2 });
          const [fromSide, toSide] = FACING[g.side];
          const from = port({ x: left, y: top, w, h }, fromSide), t = g.target, to = port({ x: t.x * z + view.x, y: t.y * z + view.y, w: t.w * z, h: t.h * z }, toSide);
          return (
            <>
              {explainConnects(target.ids, board()) && <svg data-inline-ghost-link className="absolute inset-0 h-full w-full overflow-visible opacity-50"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6b7280" strokeWidth={2 * z} strokeDasharray="6 5" /></svg>}
              <div data-inline-ghost data-ghost-kind="card" onPointerDown={event => event.stopPropagation()} className="pointer-events-auto absolute rounded-xl border-2 border-dashed border-[#6b7280]/70"
                style={{ left, top, width: w, height: h }} />
            </>
          );
        })()}
        {/* A7: an edit, pale, in place over each object it changes - removed words struck through, added words marked, a
            style change shown on the new text. While it streams, the new words so far. The object is untouched until Accept. */}
        {(() => {
          const place = id => { const world = canvas.boxOf(id); return world && { left: world.x * z + view.x, top: world.y * z + view.y, minWidth: world.w * z, minHeight: world.h * z }; };
          // Over its own object, so it lets clicks through: the learner can still open and edit those words.
          const frame = 'absolute rounded-md border border-dashed border-ai bg-white/95 px-1 text-ink opacity-60 dark:bg-[#202020]/95';
          if (status === 'streaming' && state.stream?.edits) return Object.entries(state.stream.edits).map(([id, text]) => {
            const at = place(id);
            return at && <div key={id} data-inline-ghost data-ghost-kind="edit" data-ghost-for={id} className={frame} style={{ ...at, fontSize: 14 * z }}>{text}</div>;
          });
          if (preview?.kind !== 'edit' || status === 'streaming') return null;
          return (preview.changes || []).map(change => {
            const at = place(change.id);
            if (!at) return null;
            const styled = Object.fromEntries((change.style || []).map(([key, , after]) => [key, after]));
            const look = { fontSize: (styled.fontSize || 14) * z, fontWeight: styled.bold ? 700 : undefined, fontStyle: styled.italic ? 'italic' : undefined, textDecoration: styled.underline ? 'underline' : undefined, color: styled.textColor || undefined };
            return (
              <div key={change.id} data-inline-ghost data-ghost-kind="edit" data-ghost-for={change.id} className={frame} style={{ ...at, ...look }}>
                {wordDiff(change.before, change.after).map((part, index) => (part.kind === 'same' ? <span key={index}>{part.t}</span>
                  : part.kind === 'del' ? <del key={index} data-ghost-del className="text-[#b42318]">{part.t}</del>
                    : <ins key={index} data-ghost-add className="bg-[#dcfce7] text-[#067647] no-underline">{part.t}</ins>))}
              </div>
            );
          });
        })()}
      </div>
      <div ref={box} role="dialog" aria-label="Edit or explain with AI" aria-modal="false" data-inline-ai data-keep-focus data-status={status}
        onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onKeyDown={keyDown}
        style={{ left: place.left, top: place.top, width: place.width }}
        className="absolute z-40 flex flex-col gap-1.5 rounded-xl border border-line bg-white p-2 text-sm text-ink shadow-pop">
        <div className="flex items-center gap-1.5">
          <div role="radiogroup" aria-label="Edit or explain" className="flex shrink-0 rounded-lg bg-hover p-0.5">
            {[['edit', 'Edit'], ['explain', 'Explain']].map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} data-inline-mode={value} disabled={busy(status)}
                onClick={() => setMode(value)}
                className={`h-6 rounded-md px-2.5 text-xs font-medium ${mode === value ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          <span data-inline-target-label title="The selection this request is about. Selecting something else does not change it." className="min-w-0 flex-1 truncate text-xs text-ink-2">{targetLabel(target, board())}</span>
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={close} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"><X size={14} /></button>
        </div>
        <div className="flex items-end gap-1.5">
          <textarea ref={field} rows={1} value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={fieldKey} data-inline-prompt
            aria-label={preview ? 'Refine the request' : mode === 'edit' ? 'Describe the change' : 'What should the explanation cover?'}
            placeholder={preview ? 'Refine…' : mode === 'edit' ? 'Describe the change…' : 'Explain this… or /diagram, /code'}
            disabled={readOnly}
            className="max-h-28 min-h-8 flex-1 resize-none rounded-lg border border-line bg-white px-2 py-1.5 text-sm leading-5 outline-none placeholder:text-ink-3 focus:border-ai" />
          {/* Submit keeps its place while a request runs (disabled, spinning): Stop is never under the pointer or finger that
              just pressed Submit, so a double press cannot cancel what it sent. */}
          <button type="button" data-inline-submit disabled={readOnly || status === 'proposal' || busy(status) || prompt.length > PROMPT_MAX} onClick={() => submit(prompt)} title={preview ? 'Refine (Enter)' : 'Submit (Enter)'}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-ink px-2.5 text-xs font-medium text-white disabled:opacity-40">{busy(status) && <Loader2 size={12} className="animate-spin" />}{preview ? 'Refine' : 'Submit'}<kbd className="ml-0.5 flex items-center font-sans text-[10px] text-white/70"><CornerDownLeft size={10} /></kbd></button>
        </div>
        {/* The supported limit, shown while writing; over it Submit waits and the count says what to do. Nothing is cut. */}
        {prompt.length > 0 && <p data-inline-count className={`-mt-1 text-right text-[11px] ${prompt.length > PROMPT_MAX ? 'text-[#b42318]' : 'text-ink-3'}`}>{prompt.length} / {PROMPT_MAX}{prompt.length > PROMPT_MAX ? ' - shorten it to send' : ''}</p>}
        {readOnly && <p data-inline-readonly className="text-xs text-ink-2">This canvas is view-only, so Edit and Explain can't add to it.</p>}
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <button type="button" data-inline-context aria-expanded={contextOpen} onClick={() => setContextOpen(open => !open)} className="flex min-w-0 items-center gap-1 rounded px-0.5 hover:text-ink">
            {contextOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className="truncate">Context: {contextLine}{omittedTotal ? ` · ${omittedTotal} left out` : ''}</span>
          </button>
          <label className="ml-auto flex shrink-0 items-center gap-1"><input type="checkbox" data-inline-selection-only checked={selectionOnly} disabled={busy(status) || !!preview} title={preview ? 'This preview was made with this scope. Reject it to change the scope.' : undefined} onChange={event => setSelectionOnly(event.target.checked)} className="h-3 w-3" />Selection only</label>
        </div>
        {contextOpen && prepared && (
          <ul data-inline-context-list data-scroll className="max-h-36 overflow-y-auto rounded-lg bg-hover px-2 py-1 text-xs text-ink-2">
            {prepared.context.target.objects.map(entry => <li key={entry.id} className="truncate"><span data-inline-context-target className="font-medium text-ai">Selected</span> · {LABEL[entry.type] || entry.type}{entry.flattened ? ' (flattened image)' : ''} · {short(target.range && target.range.id === entry.id ? target.range.text : entry.text)}</li>)}
            {prepared.context.related.map(entry => <li key={entry.id} className="truncate">{RELATION[entry.relation] || entry.relation} · {LABEL[entry.type] || entry.type} · {short(entry.text)}</li>)}
            {prepared.context.target.group && <li className="truncate">group “{short(prepared.context.target.group.label || 'untitled', 30)}”</li>}
            {prepared.context.broader.title && <li className="truncate">canvas title “{short(prepared.context.broader.title, 40)}”</li>}
            {omittedTotal > 0 && <li>{omittedTotal} more left out by the limits</li>}
            {selectionOnly && <li>Surroundings left out (selection only)</li>}
          </ul>
        )}
        {state.notice && <p data-inline-notice className="text-xs text-ink-2">{state.notice}</p>}
        {moved && moved === preview?.requestId && <p data-inline-moved role="status" className="text-xs text-ink-2">Something is where this was going, so it has a new place on the canvas. Check it, then Accept again.</p>}
        {busy(status) && (
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            {!streamText && !state.stream?.edits && <p data-inline-stage role="status" className="flex min-w-0 items-center gap-1.5"><Loader2 size={12} className="shrink-0 animate-spin" /><span className="truncate">{state.stage}{preview ? ' (your last preview stays until this one is ready)' : ''}</span></p>}
            <button type="button" data-inline-stop onClick={() => session.cancel()} title="Stop" aria-label="Stop" className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-ink-2 hover:bg-hover hover:text-ink"><Square size={10} fill="currentColor" />Stop</button>
          </div>
        )}
        {(writing && streamText) || (preview?.kind === 'note' && status !== 'streaming') ? (
          <div data-inline-preview="note" data-scroll className="max-h-40 overflow-y-auto rounded-lg border border-line px-2 py-1.5 text-sm leading-5 whitespace-pre-wrap">
            {status === 'streaming' || !preview ? streamText : preview.text}
            <p className="mt-1 text-[11px] text-ink-3">{status === 'streaming' ? 'Writing… (not on the canvas until you accept)' : `Adds an editable note${target.ids.length === 1 ? ' with an arrow' : ''} beside the selection.`}</p>
          </div>
        ) : null}
        {(state.stream?.edits && busy(status)) && (
          <div data-inline-preview="edit-stream" data-scroll className="max-h-40 overflow-y-auto rounded-lg border border-line px-2 py-1.5 text-xs">
            {Object.entries(state.stream.edits).map(([id, text]) => <pre key={id} className="whitespace-pre-wrap font-mono text-[12px] text-[#1a7f37]">{text}</pre>)}
            <p className="mt-1 text-[11px] text-ink-3">Writing… (checked before you can accept)</p>
          </div>
        )}
        {preview?.kind === 'edit' && !busy(status) && (
          <div data-inline-preview="edit" data-scroll className="max-h-48 overflow-y-auto rounded-lg border border-line px-2 py-1.5 text-xs">
            {preview.summary && <p className="mb-1 text-ink-2">{preview.summary}</p>}
            {preview.changes.map(change => (
              <div key={change.id} data-inline-change={change.id} className="mb-1.5">
                {change.before !== change.after && <>
                  <pre data-before className="whitespace-pre-wrap font-mono text-[12px] text-[#b42318] line-through decoration-[#b42318]/50">{change.before}</pre>
                  <pre data-after className="whitespace-pre-wrap font-mono text-[12px] text-[#1a7f37]">{change.after}</pre>
                </>}
                {change.style.map(([key, from, to]) => <p key={key} className="text-ink-2">{key === 'fontSize' ? 'Font size' : key === 'level' ? 'Level' : key}: {String(from ?? 'default')} → {String(to ?? 'default')}</p>)}
              </div>
            ))}
            {target.range && <p className="text-[11px] text-ink-3">Only the selected words change; the rest stays as it is.</p>}
          </div>
        )}
        {(preview?.kind === 'card' || preview?.kind === 'proposal') && !busy(status) && (
          <div data-inline-preview={preview.kind} data-card-type={preview.block?.type} className="rounded-lg border border-line px-2 py-1.5 text-xs">
            <p className="font-medium text-ink">{ROUTES[preview.route]?.label || 'Card'}: {short(preview.block?.title || preview.describe?.title || '', 60)}</p>
            {(() => { const b = preview.block || {}; const words = [b.brief, b.caption, b.body, b.goal, b.operation?.request, typeof b.code === 'string' ? b.code : null].find(value => typeof value === 'string' && value.trim()) || preview.describe?.text; return words ? <p className="mt-0.5 line-clamp-3 text-ink-2">{short(words, 220)}</p> : null; })()}
            <p className="mt-1 text-[11px] text-ink-3">Adds this card ({short(preview.block?.type, 20)}) to the canvas when you {preview.kind === "proposal" ? "generate" : "accept"}.</p>
          </div>
        )}
        {status === 'proposal' && (
          <div data-inline-paid role="group" aria-label="Paid generation" className="rounded-lg bg-hover px-2 py-1.5 text-xs text-ink-2">
            <p>{state.proposal?.message || 'This uses paid generation.'} Starting it can cost money even if you later reject or undo the card; undoing is not a refund. Once started, the job runs on its card and can't be cancelled from here.</p>
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button type="button" data-paid-cancel onClick={reject} className="h-7 rounded-lg border border-line bg-white px-2.5 text-ink hover:bg-hover">Cancel</button>
              <button type="button" data-paid-generate onClick={accept} disabled={!acceptable} className="h-7 rounded-lg bg-ink px-2.5 font-medium text-white disabled:opacity-40">Generate</button>
            </div>
          </div>
        )}
        {status === 'clarify' && state.clarify && (
          <div data-inline-clarify className="rounded-lg bg-hover px-2 py-1.5 text-xs">
            <p className="flex items-start gap-1 text-ink"><CircleHelp size={13} className="mt-px shrink-0 text-accent" />{state.clarify.question}</p>
            {state.clarify.options?.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{state.clarify.options.map(option => (
              <button key={option} type="button" data-inline-option={option} onClick={() => session.choose(option)} className="h-6 rounded-md border border-line bg-white px-2 text-ink hover:bg-hover">{ROUTES[option]?.label || option}</button>
            ))}</div>}
            {preview && <button type="button" data-inline-back onClick={() => session.back()} className="mt-1.5 flex items-center gap-1 rounded px-0.5 text-ink-2 hover:text-ink"><RotateCcw size={11} />Back to the preview</button>}
          </div>
        )}
        {status === 'stale' && state.stale && (
          <p data-inline-stale role="alert" className="flex items-center gap-1.5 text-xs text-[#b42318]">{state.stale.text} <button type="button" onClick={() => submit(prompt)} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink hover:bg-hover"><RotateCcw size={11} />Regenerate</button></p>
        )}
        {state.error && <p data-inline-error role="alert" className="text-xs text-[#b42318]">{state.error}</p>}
        {(preview && status !== 'proposal') && (
          <div className="flex items-center justify-end gap-1.5 pt-0.5">
            <button type="button" data-inline-reject onClick={reject} className="h-7 rounded-lg border border-line bg-white px-2.5 text-xs text-ink hover:bg-hover">Reject</button>
            <button type="button" data-inline-accept onClick={accept} disabled={!acceptable || readOnly} title={busy(status) ? 'Waiting for the new version' : 'Accept (Ctrl Enter)'}
              className="flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-xs font-medium text-white disabled:opacity-40"><Check size={12} />Accept</button>
          </div>
        )}
      </div>
    </>
  );
}
