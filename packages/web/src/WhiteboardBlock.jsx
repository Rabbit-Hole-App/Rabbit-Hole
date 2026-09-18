import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Tldraw, getSnapshot, loadSnapshot } from 'tldraw';
import { Loader2, PanelTopClose, PanelTopOpen, Volume2 } from 'lucide-react';
import { learnShapeUtils } from './learn-shape-utils.js';
import { getSpeed } from './learn-audio.js';
import { sigmoidBoard } from './sigmoid-board.js';
import { registerBoardAsk } from './board-ask.js';
import { requestBoardExplanation } from './learn-board-request.js';
import { wsHeaders } from './api.js';
import 'tldraw/tldraw.css';

// A real tldraw board inside a canvas node: the learner gets tldraw's own
// tools and shapes, the drawing is saved with the block, and a region drawn
// over it can be sent to the tutor with a thumbnail of exactly that part.
// ponytail: the board is stored in the block; a shared multi-learner board
// would need the server store instead.

const HIDDEN = {
  PageMenu: null, MainMenu: null, DebugMenu: null, DebugPanel: null,
  HelpMenu: null, KeyboardShortcutsDialog: null, Minimap: null,
};
// Hiding the toolbar leaves the board itself untouched, so a drawing stays
// readable when the node is small.
const NO_TOOLS = { Toolbar: null, StylePanel: null, ActionsMenu: null, QuickActions: null, ZoomMenu: null, NavigationPanel: null };

const shapeText = shape => shape.props?.text
  || shape.props?.richText?.content?.map(part => part.content?.map(run => run.text || '').join('') || '').join(' ')
  || shape.meta?.label || '';

export default function WhiteboardBlock({ block, appName, onChange, onAskSelection }) {
  const editor = useRef(null);
  const saving = useRef(null);
  const host = useRef(null);
  const wrapper = useRef(null);
  const drag = useRef(null);
  const [selecting, setSelecting] = useState(false);
  const [rectangle, setRectangle] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(null);
  const [voiceError, setVoiceError] = useState('');
  // The board saves itself long after mount, so every write starts from the
  // block as it is now - otherwise a save would revert narration typed since.
  const latest = useRef(block);
  latest.current = block;
  useEffect(() => () => { clearTimeout(saving.current); if (voice) URL.revokeObjectURL(voice.url); }, [voice]);
  const narration = (block.narration || '').trim();

  // Marking a region is a question about a still moment, so anything playing
  // in this block stops first.
  const pauseMedia = () => wrapper.current?.querySelectorAll('audio, video').forEach(player => player.pause());
  const clearRegion = () => { setSelecting(false); setRectangle(null); drag.current = null; onChange({ ...latest.current, marked: null }); };
  const arm = () => { pauseMedia(); setRectangle(null); setSelecting(true); };
  useEffect(() => {
    const key = event => { if (event.key === 'Escape' && (selecting || block.marked)) clearRegion(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selecting, block.marked]);

  const narrate = async (text, existing) => {
    const words = (text || '').trim();
    if (!words) return;
    setSpeaking(true); setVoiceError('');
    try {
      const response = await fetch('/api/learn/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...wsHeaders() }, body: JSON.stringify({ app: appName, text: words }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      setVoice({ url: URL.createObjectURL(await response.blob()), text: existing ?? words });
    } catch (problem) { setVoiceError(problem.message); }
    finally { setSpeaking(false); }
  };

  const point = event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  const region = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  // The rectangle is stored in the board's own page coordinates, so it stays
  // over what it was drawn on when the board is panned or zoomed.
  const toPage = area => {
    const instance = editor.current, frame = host.current?.getBoundingClientRect();
    if (!instance || !frame) return null;
    const topLeft = instance.screenToPage({ x: frame.left + area.x * frame.width, y: frame.top + area.y * frame.height });
    const bottomRight = instance.screenToPage({ x: frame.left + (area.x + area.w) * frame.width, y: frame.top + (area.y + area.h) * frame.height });
    return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
  };
  const ask = async marked => {
    const instance = editor.current;
    if (!instance || !marked) return;
    const bounds = new Box(marked.x, marked.y, marked.w, marked.h);
    const whole = instance.getCurrentPageShapes();
    const inside = whole.filter(shape => { const at = instance.getShapePageBounds(shape.id); return at && bounds.includes(at); });
    const shapes = inside.length ? inside : whole.filter(shape => { const at = instance.getShapePageBounds(shape.id); return at && bounds.collides(at); });
    let preview = '';
    try {
      const image = await instance.toImage(shapes.map(shape => shape.id), { format: 'png', background: true, padding: 12, scale: 1, bounds });
      preview = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(image.blob); });
    } catch { /* the question still works without a picture */ }
    onAskSelection?.({ ...latest.current, marked }, {
      preview,
      region: marked,
      shapes: shapes.map(shape => ({ type: shape.type, text: shapeText(shape), author: shape.meta?.author || 'learner' })),
    });
  };

  // The tutor draws its answer onto this same board. Shapes it creates carry
  // author 'assistant' already, so the learner's own ink stays distinguishable.
  const explain = async ({ question, answer, onStage }) => {
    const instance = editor.current;
    if (!instance) throw new Error('The board is still loading. Try again in a moment.');
    const snapshot = {
      lessonId: 'learn-freeform',
      runId: block.id,
      method: 'lesson',
      target: null,
      relatedObjects: [],
      lessonContext: { topic: (block.title || 'Whiteboard').slice(0, 150), currentStage: 'explanation', recentExplanations: [] },
    };
    onStage?.('Planning explanation...');
    const { plan } = await requestBoardExplanation({ app: appName, snapshot, question, answer }, stage => onStage?.(stage));
    if (plan.needsClarification) throw new Error(plan.summary);
    onStage?.('Drawing...');
    const { drawExplanation } = await import('./learn-board-renderer.js');
    drawExplanation(instance, snapshot, plan, { app: appName });
    const spoken = plan.blocks.map(item => item.text).filter(Boolean).join(' ').slice(0, 3800);
    if (spoken) narrate(spoken, spoken);
  };
  useEffect(() => registerBoardAsk(block.id, { arm, clear: clearRegion, explain }), [block.id, block.marked, block.title]);

  const mount = instance => {
    editor.current = instance;
    if (block.snapshot) { try { loadSnapshot(instance.store, block.snapshot); } catch { /* an unreadable board starts empty */ } }
    else if (block.demo === 'sigmoid') instance.createShapes(sigmoidBoard());
    // Lesson and tutor shapes arrive already tagged; anything else is the
    // learner's, so a replay can reset one without touching the other.
    instance.sideEffects.registerAfterCreateHandler('shape', shape => {
      if (!shape.meta?.author) instance.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, author: 'learner' } });
    });
    instance.store.listen(() => {
      clearTimeout(saving.current);
      saving.current = setTimeout(() => {
        const snapshot = getSnapshot(instance.store);
        const encoded = JSON.stringify(snapshot);
        // A very large board would blow the canvas storage quota; keep the
        // drawing in memory and say so rather than losing the whole canvas.
        const current = latest.current;
        onChange({ ...current, snapshot: encoded.length > 400000 ? current.snapshot : snapshot, tooLarge: encoded.length > 400000 });
      }, 700);
    }, { source: 'user', scope: 'document' });
  };

  // OnTheCanvas draws inside the camera transform, so the marker is placed in
  // page coordinates once and tldraw keeps it there.
  const marked = block.marked;
  const components = useMemo(() => ({
    ...HIDDEN,
    ...(block.toolsHidden ? NO_TOOLS : {}),
    OnTheCanvas: marked ? () => (
      <div data-board-marker style={{ position: 'absolute', left: marked.x, top: marked.y, width: marked.w, height: marked.h, border: '2.5px solid #dc2626', borderRadius: 4, pointerEvents: 'none' }} />
    ) : null,
  }), [marked?.x, marked?.y, marked?.w, marked?.h, block.toolsHidden]);

  return (
    <div ref={wrapper} className="flex min-h-0 flex-1 flex-col gap-2" onPointerDown={event => event.stopPropagation()}>
      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-line">
        <Tldraw onMount={mount} shapeUtils={learnShapeUtils} components={components} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} />
        <button type="button" data-board-tools aria-pressed={!block.toolsHidden}
          title={block.toolsHidden ? 'Show the drawing tools' : 'Hide the drawing tools'}
          onClick={() => onChange({ ...latest.current, toolsHidden: !block.toolsHidden })}
          className="absolute top-1.5 right-1.5 z-[350] flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-white text-ink-2 shadow-sm hover:bg-hover hover:text-ink">
          {block.toolsHidden ? <PanelTopOpen size={14} /> : <PanelTopClose size={14} />}
        </button>
        {selecting && (
          <svg data-board-region aria-label="Select board region" viewBox="0 0 1 1" preserveAspectRatio="none"
            className="absolute inset-0 z-[300] h-full w-full touch-none" style={{ cursor: 'crosshair' }}
            onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = point(event); setRectangle(null); }}
            onPointerMove={event => { if (drag.current) setRectangle(region(drag.current, point(event))); }}
            onPointerUp={event => {
              if (!drag.current) return;
              const area = region(drag.current, point(event));
              drag.current = null; setRectangle(null);
              if (area.w < 0.02 || area.h < 0.02) return;
              setSelecting(false);
              const page = toPage(area);
              if (!page) return;
              onChange({ ...latest.current, marked: page });
              ask(page);
            }}
            onPointerCancel={() => { drag.current = null; setRectangle(null); }}>
            {rectangle && <rect {...rectangle} width={rectangle.w} height={rectangle.h} fill="none" stroke="#dc2626" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
          </svg>
        )}
      </div>
      {selecting && <p data-board-hint className="shrink-0 text-xs text-ink-2">Drag a rectangle around the part you want to ask about, or press Esc.</p>}
      {block.tooLarge && <span className="shrink-0 text-xs text-amber-700">This board is too large to save; it stays until you reload.</span>}
      <div className="shrink-0 space-y-1.5">
        <textarea value={block.narration || ''} rows={2} placeholder="Narration for this board…"
          onChange={event => onChange({ ...latest.current, narration: event.target.value })}
          className="w-full resize-y rounded-lg border border-line p-2 text-xs outline-none focus:border-ink-3" />
        {/* Once a player exists for this text, the player is the control. */}
        {voice?.text !== narration && (
          <div className="flex items-center gap-2">
            <button type="button" data-board-speak disabled={speaking || !narration} onClick={() => narrate(narration)}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white disabled:opacity-50">
              {speaking ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}Read it aloud
            </button>
            {voiceError && <span className="text-xs text-red-700">{voiceError}</span>}
          </div>
        )}
        {voice && <audio data-board-audio src={voice.url} controls autoPlay
          onLoadedMetadata={event => { event.currentTarget.playbackRate = getSpeed(); }} className="w-full" />}
      </div>
    </div>
  );
}
